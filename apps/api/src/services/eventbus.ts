/**
 * Event Bus Service
 *
 * A unified event bus for real-time messaging that abstracts the underlying transport.
 * Supports multiple adapters:
 * - InMemory: For single-instance deployments and development
 * - RabbitMQ: For multi-instance production deployments with guaranteed delivery
 *
 * This replaces the Socket.io Redis adapter for more reliable and flexible messaging.
 */

import { EventEmitter } from 'events';
import { getConfig } from '@neon/config';

const config = getConfig();

// =============================================================================
// Types
// =============================================================================

export interface EventBusMessage {
  event: string;
  payload: unknown;
  metadata: {
    timestamp: string;
    source: string;
    correlationId?: string;
  };
}

export interface EventBusAdapter {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(channel: string, message: EventBusMessage): Promise<void>;
  subscribe(channel: string, handler: (message: EventBusMessage) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  isConnected(): boolean;
}

export type EventHandler = (event: string, payload: unknown, metadata: EventBusMessage['metadata']) => void;

// =============================================================================
// In-Memory Adapter (Single Instance / Development)
// =============================================================================

class InMemoryAdapter implements EventBusAdapter {
  name = 'inmemory';
  private emitter: EventEmitter;
  private connected = false;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
  }

  async connect(): Promise<void> {
    this.connected = true;
    console.log('[EventBus] InMemory adapter connected');
  }

  async disconnect(): Promise<void> {
    this.emitter.removeAllListeners();
    this.connected = false;
    console.log('[EventBus] InMemory adapter disconnected');
  }

  async publish(channel: string, message: EventBusMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('InMemory adapter not connected');
    }
    // Emit asynchronously to prevent blocking
    setImmediate(() => {
      this.emitter.emit(channel, message);
    });
  }

  async subscribe(channel: string, handler: (message: EventBusMessage) => void): Promise<void> {
    if (!this.connected) {
      throw new Error('InMemory adapter not connected');
    }
    this.emitter.on(channel, handler);
    console.log(`[EventBus] Subscribed to channel: ${channel}`);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.emitter.removeAllListeners(channel);
    console.log(`[EventBus] Unsubscribed from channel: ${channel}`);
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// =============================================================================
// RabbitMQ Adapter (Multi-Instance / Production)
// =============================================================================

class RabbitMQAdapter implements EventBusAdapter {
  name = 'rabbitmq';
  private connection: any = null;
  private channel: any = null;
  private subscriptions: Map<string, (msg: any) => void> = new Map();
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    try {
      // Dynamic require to avoid requiring amqplib if not using RabbitMQ
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      let amqp: any;
      try {
        // Use require for optional dependency
        amqp = require('amqplib');
      } catch (importError) {
        throw new Error('amqplib is not installed. Run: npm install amqplib');
      }

      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      // Set up exchange for pub/sub
      await this.channel.assertExchange('neon_events', 'topic', { durable: true });

      // Handle connection errors
      this.connection.on('error', (err: Error) => {
        console.error('[EventBus] RabbitMQ connection error:', err.message);
        this.handleReconnect();
      });

      this.connection.on('close', () => {
        console.log('[EventBus] RabbitMQ connection closed');
        this.handleReconnect();
      });

      this.reconnectAttempts = 0;
      console.log('[EventBus] RabbitMQ adapter connected');
    } catch (error) {
      console.error('[EventBus] Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[EventBus] Max reconnect attempts reached for RabbitMQ');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[EventBus] Attempting RabbitMQ reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect();
        // Re-subscribe to channels
        for (const [channel, handler] of this.subscriptions) {
          await this.subscribeInternal(channel, handler);
        }
      } catch (error) {
        console.error('[EventBus] RabbitMQ reconnect failed:', error);
      }
    }, delay);
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.subscriptions.clear();
      console.log('[EventBus] RabbitMQ adapter disconnected');
    } catch (error) {
      console.error('[EventBus] Error disconnecting from RabbitMQ:', error);
    }
  }

  async publish(channel: string, message: EventBusMessage): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ adapter not connected');
    }

    const content = Buffer.from(JSON.stringify(message));
    this.channel.publish('neon_events', channel, content, {
      persistent: true,
      contentType: 'application/json',
    });
  }

  async subscribe(channel: string, handler: (message: EventBusMessage) => void): Promise<void> {
    const wrappedHandler = (msg: any) => {
      if (msg) {
        try {
          const content = JSON.parse(msg.content.toString());
          handler(content);
          this.channel?.ack(msg);
        } catch (error) {
          console.error('[EventBus] Error processing RabbitMQ message:', error);
          this.channel?.nack(msg, false, false);
        }
      }
    };

    this.subscriptions.set(channel, wrappedHandler);
    await this.subscribeInternal(channel, wrappedHandler);
  }

  private async subscribeInternal(channel: string, handler: (msg: any) => void): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ adapter not connected');
    }

    // Create an exclusive queue for this subscriber
    const { queue } = await this.channel.assertQueue('', { exclusive: true });
    await this.channel.bindQueue(queue, 'neon_events', channel);
    await this.channel.consume(queue, handler, { noAck: false });

    console.log(`[EventBus] Subscribed to RabbitMQ channel: ${channel}`);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.subscriptions.delete(channel);
    console.log(`[EventBus] Unsubscribed from RabbitMQ channel: ${channel}`);
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }
}

// =============================================================================
// Event Bus Service
// =============================================================================

class EventBusService {
  private adapter: EventBusAdapter | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private isInitialized = false;

  /**
   * Initialize the event bus with the appropriate adapter
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[EventBus] Already initialized');
      return;
    }

    const adapterType = process.env.EVENTBUS_ADAPTER || 'inmemory';
    const rabbitmqUrl = process.env.RABBITMQ_URL;

    if (adapterType === 'rabbitmq' && rabbitmqUrl) {
      console.log('[EventBus] Using RabbitMQ adapter');
      this.adapter = new RabbitMQAdapter(rabbitmqUrl);
    } else {
      console.log('[EventBus] Using InMemory adapter');
      this.adapter = new InMemoryAdapter();
    }

    await this.adapter.connect();

    // Subscribe to the main events channel
    await this.adapter.subscribe('events.*', (message) => {
      this.handleMessage(message);
    });

    // Also subscribe to specific channels for better routing
    await this.adapter.subscribe('events.message', (message) => {
      this.handleMessage(message);
    });

    await this.adapter.subscribe('events.notification', (message) => {
      this.handleMessage(message);
    });

    await this.adapter.subscribe('events.presence', (message) => {
      this.handleMessage(message);
    });

    await this.adapter.subscribe('events.conversation', (message) => {
      this.handleMessage(message);
    });

    this.isInitialized = true;
    console.log(`[EventBus] Initialized with ${this.adapter.name} adapter`);
  }

  /**
   * Shutdown the event bus
   */
  async shutdown(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
    }
    this.handlers.clear();
    this.isInitialized = false;
    console.log('[EventBus] Shutdown complete');
  }

  /**
   * Publish an event to the bus
   */
  async publish(
    event: string,
    payload: unknown,
    options?: {
      correlationId?: string;
      source?: string;
    }
  ): Promise<void> {
    if (!this.adapter || !this.isInitialized) {
      console.error('[EventBus] Cannot publish - not initialized');
      return;
    }

    const message: EventBusMessage = {
      event,
      payload,
      metadata: {
        timestamp: new Date().toISOString(),
        source: options?.source || 'api',
        correlationId: options?.correlationId,
      },
    };

    // Determine the channel based on event type
    const channel = this.getChannelForEvent(event);

    console.log(`[EventBus] Publishing event: ${event} to channel: ${channel}`);
    await this.adapter.publish(channel, message);
  }

  /**
   * Subscribe to events
   */
  subscribe(eventPattern: string, handler: EventHandler): void {
    if (!this.handlers.has(eventPattern)) {
      this.handlers.set(eventPattern, new Set());
    }
    this.handlers.get(eventPattern)!.add(handler);
    console.log(`[EventBus] Handler registered for pattern: ${eventPattern}`);
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(eventPattern: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventPattern);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventPattern);
      }
    }
  }

  /**
   * Get the adapter name
   */
  getAdapterName(): string {
    return this.adapter?.name || 'none';
  }

  /**
   * Check if the event bus is healthy
   */
  isHealthy(): boolean {
    return this.isInitialized && (this.adapter?.isConnected() ?? false);
  }

  /**
   * Handle incoming messages from the adapter
   */
  private handleMessage(message: EventBusMessage): void {
    console.log(`[EventBus] Received event: ${message.event}`);

    // Find matching handlers
    for (const [pattern, handlers] of this.handlers) {
      if (this.matchesPattern(message.event, pattern)) {
        for (const handler of handlers) {
          try {
            handler(message.event, message.payload, message.metadata);
          } catch (error) {
            console.error(`[EventBus] Error in handler for ${pattern}:`, error);
          }
        }
      }
    }
  }

  /**
   * Check if an event matches a pattern
   */
  private matchesPattern(event: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === event) return true;

    // Support wildcard patterns like 'message:*'
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -1);
      return event.startsWith(prefix);
    }

    return false;
  }

  /**
   * Get the routing channel for an event
   */
  private getChannelForEvent(event: string): string {
    if (event.startsWith('message:')) return 'events.message';
    if (event.startsWith('notification')) return 'events.notification';
    if (event.startsWith('presence:')) return 'events.presence';
    if (event.startsWith('conversation:')) return 'events.conversation';
    return 'events.message'; // Default to message channel
  }
}

// Singleton instance
export const eventBus = new EventBusService();

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Initialize the event bus (call during server startup)
 */
export async function initializeEventBus(): Promise<void> {
  await eventBus.initialize();
}

/**
 * Shutdown the event bus (call during server shutdown)
 */
export async function shutdownEventBus(): Promise<void> {
  await eventBus.shutdown();
}

/**
 * Publish an event
 */
export async function publishEvent(
  event: string,
  payload: unknown,
  options?: { correlationId?: string; source?: string }
): Promise<void> {
  await eventBus.publish(event, payload, options);
}

/**
 * Subscribe to events
 */
export function subscribeToEvents(eventPattern: string, handler: EventHandler): void {
  eventBus.subscribe(eventPattern, handler);
}

/**
 * Unsubscribe from events
 */
export function unsubscribeFromEvents(eventPattern: string, handler: EventHandler): void {
  eventBus.unsubscribe(eventPattern, handler);
}
