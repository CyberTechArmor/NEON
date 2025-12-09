/**
 * Socket.io Server
 *
 * Real-time communication for chat, presence, and notifications.
 *
 * Architecture:
 * - Uses EventBus for cross-instance event propagation (InMemory or RabbitMQ)
 * - Direct socket tracking for reliable message delivery
 * - Redis is used ONLY for caching (presence, sessions) - NOT for pub/sub messaging
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getConfig } from '@neon/config';
import { prisma } from '@neon/database';
import { getRedis } from '../services/redis';
import { subscribeToEvents, publishEvent } from '../services/eventbus';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  AccessTokenPayload,
} from '@neon/shared';
import { SocketEvents } from '@neon/shared';

const config = getConfig();

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

// User socket mapping - tracks all connected sockets per user
const userSockets = new Map<string, Set<string>>();

// Socket to user mapping - for quick reverse lookup
const socketToUser = new Map<string, string>();

/**
 * Create and configure Socket.io server
 */
export function createSocketServer(httpServer: HttpServer): Server {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: config.api.corsOrigins,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // NOTE: Removed Redis adapter - using EventBus for cross-instance messaging
  // This provides more reliable message delivery and cleaner architecture

  // Subscribe to EventBus events and deliver to connected clients
  setupEventBusSubscriptions();

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = jwt.verify(token as string, config.auth.jwtSecret) as AccessTokenPayload;

      if (payload.type !== 'access') {
        return next(new Error('Invalid token type'));
      }

      // Verify user exists and is active
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, orgId: true, status: true, displayName: true },
      });

      if (!user || user.status !== 'ACTIVE') {
        return next(new Error('User not found or inactive'));
      }

      // Attach user info to socket
      socket.data.userId = user.id;
      socket.data.orgId = user.orgId;
      socket.data.displayName = user.displayName;

      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const orgId = socket.data.orgId as string;

    console.log(`[Socket] User connected: ${userId} (socket: ${socket.id})`);

    // Track socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);
    socketToUser.set(socket.id, userId);

    // Join org room and personal user room
    socket.join(`org:${orgId}`);
    socket.join(`user:${userId}`);

    // Log room membership for debugging
    console.log(`[Socket] User ${userId} joined rooms: org:${orgId}, user:${userId}`);
    console.log(`[Socket] User ${userId} now has ${userSockets.get(userId)?.size || 0} active connections`);

    // Update presence
    updatePresence(userId, 'ONLINE');

    // Handle authentication confirmation
    socket.emit(SocketEvents.AUTH_SUCCESS, { userId, orgId });

    // ==========================================================================
    // Presence
    // ==========================================================================

    socket.on(SocketEvents.PRESENCE_UPDATE, async (data) => {
      const normalizedStatus = normalizePresenceStatus(data.status);
      await updatePresence(userId, normalizedStatus, data.message);
    });

    socket.on(SocketEvents.PRESENCE_SUBSCRIBE, async (userIds) => {
      for (const uid of userIds) {
        socket.join(`presence:${uid}`);
      }
      const presenceData = await getPresenceForUsers(userIds);
      for (const presence of presenceData) {
        socket.emit(SocketEvents.PRESENCE_UPDATE, presence);
      }
    });

    socket.on(SocketEvents.PRESENCE_UNSUBSCRIBE, (userIds) => {
      for (const uid of userIds) {
        socket.leave(`presence:${uid}`);
      }
    });

    // ==========================================================================
    // Conversations
    // ==========================================================================

    socket.on(SocketEvents.CONVERSATION_JOIN, (conversationId) => {
      console.log(`[Socket] User ${userId} joining conversation: ${conversationId}`);
      socket.join(`conversation:${conversationId}`);
    });

    socket.on(SocketEvents.CONVERSATION_LEAVE, (conversationId) => {
      console.log(`[Socket] User ${userId} leaving conversation: ${conversationId}`);
      socket.leave(`conversation:${conversationId}`);
    });

    // ==========================================================================
    // Messages (socket-based sending - optional, API is preferred)
    // ==========================================================================

    socket.on(SocketEvents.MESSAGE_SEND, async (data, callback) => {
      try {
        // Note: This is a placeholder - actual message creation should go through REST API
        // for proper validation, persistence, and business logic
        callback({ success: false, tempId: data.tempId, error: 'Please use REST API for sending messages' });
      } catch (error) {
        callback({
          success: false,
          tempId: data.tempId,
          error: error instanceof Error ? error.message : 'Failed to send message',
        });
      }
    });

    // ==========================================================================
    // Typing Indicators (direct socket-to-socket, no persistence needed)
    // ==========================================================================

    socket.on(SocketEvents.TYPING_START, (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit(SocketEvents.TYPING_INDICATOR, {
        userId,
        displayName: socket.data.displayName as string,
        conversationId,
        isTyping: true,
      });
    });

    socket.on(SocketEvents.TYPING_STOP, (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit(SocketEvents.TYPING_INDICATOR, {
        userId,
        displayName: socket.data.displayName as string,
        conversationId,
        isTyping: false,
      });
    });

    // ==========================================================================
    // Read Receipts
    // ==========================================================================

    socket.on(SocketEvents.MESSAGE_READ, async (data) => {
      socket.to(`conversation:${data.conversationId}`).emit(SocketEvents.READ_RECEIPT, {
        userId,
        messageId: data.messageId,
        readAt: new Date().toISOString(),
      });
    });

    // ==========================================================================
    // Calls
    // ==========================================================================

    socket.on(SocketEvents.CALL_INITIATE, async (data, callback) => {
      try {
        callback({ success: false, error: 'Calls not yet implemented' });
      } catch (error) {
        callback({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to initiate call',
        });
      }
    });

    socket.on(SocketEvents.CALL_ANSWER, async (callId, callback) => {
      try {
        callback({ success: false, error: 'Calls not yet implemented' });
      } catch (error) {
        callback({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to answer call',
        });
      }
    });

    socket.on(SocketEvents.CALL_DECLINE, async (callId) => {
      // TODO: Implement call declining
    });

    socket.on(SocketEvents.CALL_END, async (callId) => {
      // TODO: Implement call ending
    });

    // ==========================================================================
    // Notifications
    // ==========================================================================

    socket.on(SocketEvents.NOTIFICATION_READ, async (notificationId) => {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { read: true, readAt: new Date() },
      });
    });

    // ==========================================================================
    // Test Alerts
    // ==========================================================================

    socket.on(SocketEvents.TEST_ALERT_SEND, async (data) => {
      const alertId = `alert-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const alert = {
        id: alertId,
        title: data.title || 'Test Alert',
        body: data.body || 'This is a test alert.',
        createdAt: new Date().toISOString(),
      };

      console.log(`[Socket] Sending test alert to user ${userId}`);

      // Emit directly to all user's sockets
      emitToUser(userId, SocketEvents.TEST_ALERT, alert);
    });

    socket.on(SocketEvents.TEST_ALERT_ACKNOWLEDGE, (data) => {
      console.log(`[Socket] Test alert acknowledged by user ${userId}`);
      emitToUser(userId, SocketEvents.TEST_ALERT_ACKNOWLEDGED, { id: data.id });
    });

    // ==========================================================================
    // Disconnect
    // ==========================================================================

    socket.on('disconnect', async (reason) => {
      console.log(`[Socket] User disconnected: ${userId} (${reason})`);

      // Remove socket tracking
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          // No more connections - set offline after delay
          setTimeout(async () => {
            if (!userSockets.has(userId) || userSockets.get(userId)!.size === 0) {
              await updatePresence(userId, 'OFFLINE');
            }
          }, 5000);
        }
      }
      socketToUser.delete(socket.id);
    });
  });

  return io;
}

/**
 * Setup EventBus subscriptions to receive events and deliver to clients
 */
function setupEventBusSubscriptions(): void {
  // Subscribe to all events and route to appropriate clients
  subscribeToEvents('*', (event, payload, metadata) => {
    console.log(`[Socket] EventBus received: ${event}`);
    handleEventBusMessage(event, payload as Record<string, unknown>);
  });

  // Subscribe to specific message events for better routing
  subscribeToEvents('message:*', (event, payload, metadata) => {
    handleEventBusMessage(event, payload as Record<string, unknown>);
  });

  subscribeToEvents('notification', (event, payload, metadata) => {
    handleEventBusMessage(event, payload as Record<string, unknown>);
  });

  subscribeToEvents('conversation:*', (event, payload, metadata) => {
    handleEventBusMessage(event, payload as Record<string, unknown>);
  });

  console.log('[Socket] EventBus subscriptions configured');
}

/**
 * Handle messages received from EventBus and route to appropriate clients
 */
function handleEventBusMessage(event: string, payload: Record<string, unknown>): void {
  if (!io) return;

  // Route based on event type
  switch (event) {
    case SocketEvents.MESSAGE_RECEIVED:
    case SocketEvents.MESSAGE_EDITED:
    case SocketEvents.MESSAGE_DELETED:
    case SocketEvents.MESSAGE_REACTION_ADDED:
    case SocketEvents.MESSAGE_REACTION_REMOVED:
      // Message events - broadcast to conversation participants
      if (payload.conversationId && payload.targetUserIds) {
        const userIds = payload.targetUserIds as string[];
        for (const userId of userIds) {
          emitToUser(userId, event as keyof ServerToClientEvents, payload);
        }
      } else if (payload.conversationId) {
        // Fallback: emit to conversation room
        io.to(`conversation:${payload.conversationId}`).emit(event as any, payload);
      }
      break;

    case SocketEvents.NOTIFICATION:
      // Notification - send to specific user
      if (payload.userId) {
        emitToUser(payload.userId as string, event as keyof ServerToClientEvents, payload);
      }
      break;

    case SocketEvents.CONVERSATION_CREATED:
    case SocketEvents.CONVERSATION_UPDATED:
      // Conversation events - broadcast to participants
      if (payload.targetUserIds) {
        const userIds = payload.targetUserIds as string[];
        for (const userId of userIds) {
          emitToUser(userId, event as keyof ServerToClientEvents, payload);
        }
      }
      break;

    default:
      // Unknown event - log for debugging
      console.log(`[Socket] Unhandled EventBus event: ${event}`);
  }
}

/**
 * Get Socket.io server instance
 */
export function getSocketServer(): Server | null {
  return io;
}

/**
 * Emit an event to all of a user's connected sockets
 */
function emitToUser(userId: string, event: keyof ServerToClientEvents, data: unknown): void {
  if (!io) return;

  const socketIds = userSockets.get(userId);
  if (socketIds && socketIds.size > 0) {
    console.log(`[Socket] Emitting ${String(event)} to user ${userId} (${socketIds.size} sockets)`);
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event as any, data as any);
      } else {
        // Clean up stale socket reference
        socketIds.delete(socketId);
        socketToUser.delete(socketId);
      }
    }
  } else {
    console.log(`[Socket] User ${userId} has no active sockets`);
  }
}

/**
 * Update user presence
 */
async function updatePresence(
  userId: string,
  status: 'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE',
  message?: string
): Promise<void> {
  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      presenceStatus: status,
      presenceMessage: message ?? null,
      lastActiveAt: status === 'OFFLINE' ? undefined : now,
    },
  });

  // Cache presence in Redis for quick lookups (Redis is still used for caching)
  try {
    const redis = getRedis();
    await redis.hset(`presence:${userId}`, {
      status,
      message: message ?? '',
      lastActiveAt: now.toISOString(),
    });
    await redis.expire(`presence:${userId}`, 3600);
  } catch (error) {
    console.warn('[Socket] Failed to cache presence in Redis:', error);
  }

  // Broadcast to presence subscribers
  if (io) {
    io.to(`presence:${userId}`).emit(SocketEvents.PRESENCE_UPDATE, {
      userId,
      status,
      message,
      lastActiveAt: now.toISOString(),
    });
  }
}

type PresenceStatus = 'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE';

/**
 * Normalize presence status string to Prisma enum format
 */
function normalizePresenceStatus(status: string): PresenceStatus {
  const upperStatus = (status || 'offline').toUpperCase();
  if (upperStatus === 'BUSY') return 'DND';
  if (['ONLINE', 'AWAY', 'DND', 'OFFLINE'].includes(upperStatus)) {
    return upperStatus as PresenceStatus;
  }
  return 'OFFLINE';
}

/**
 * Get presence for multiple users
 */
async function getPresenceForUsers(
  userIds: string[]
): Promise<Array<{ userId: string; status: PresenceStatus; message?: string; lastActiveAt?: string }>> {
  const results = [];

  for (const userId of userIds) {
    try {
      const redis = getRedis();
      const presence = await redis.hgetall(`presence:${userId}`);
      if (presence.status) {
        results.push({
          userId,
          status: presence.status as PresenceStatus,
          message: presence.message || undefined,
          lastActiveAt: presence.lastActiveAt,
        });
        continue;
      }
    } catch (error) {
      // Redis unavailable, fall through to database
    }

    // Fallback to database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { presenceStatus: true, presenceMessage: true, lastActiveAt: true },
    });
    if (user) {
      results.push({
        userId,
        status: user.presenceStatus,
        message: user.presenceMessage ?? undefined,
        lastActiveAt: user.lastActiveAt?.toISOString(),
      });
    }
  }

  return results;
}

// =============================================================================
// Export Functions for HTTP Routes
// =============================================================================

/**
 * Send notification to user via direct socket emission
 */
export async function sendNotification(
  userId: string,
  notification: {
    id: string;
    type: string;
    title: string;
    body?: string | null;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  const notificationPayload = {
    ...notification,
    body: notification.body ?? null,
    data: notification.data ?? null,
    createdAt: new Date().toISOString(),
  };

  // Publish to EventBus for cross-instance delivery
  await publishEvent(SocketEvents.NOTIFICATION, {
    userId,
    ...notificationPayload,
  });

  // Also emit directly for same-instance delivery
  emitToUser(userId, SocketEvents.NOTIFICATION, notificationPayload);
}

/**
 * Broadcast to conversation room (secondary delivery mechanism)
 */
export function broadcastToConversation(
  conversationId: string,
  event: keyof ServerToClientEvents,
  data: unknown
): void {
  if (!io) {
    console.error(`[Socket] Cannot broadcast to conversation ${conversationId}: io is null`);
    return;
  }

  const room = `conversation:${conversationId}`;
  const socketsInRoom = io.sockets.adapter.rooms.get(room);
  const socketCount = socketsInRoom?.size || 0;

  console.log(`[Socket] Broadcasting ${String(event)} to conversation room ${room} (${socketCount} sockets)`);

  if (socketCount > 0) {
    for (const socketId of socketsInRoom!) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event as any, data as any);
      }
    }
  }
}

/**
 * Broadcast to conversation participants using EventBus + direct socket emission
 * This is the PRIMARY method for delivering messages reliably
 */
export async function broadcastToConversationParticipants(
  conversationId: string,
  event: keyof ServerToClientEvents,
  data: unknown
): Promise<void> {
  console.log(`[Socket] broadcastToConversationParticipants: ${conversationId}, event: ${String(event)}`);

  try {
    // Get all participants of the conversation
    const participants = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        leftAt: null,
      },
      select: { userId: true },
    });

    const participantIds = participants.map((p: { userId: string }) => p.userId);
    console.log(`[Socket] Found ${participantIds.length} participants:`, participantIds);

    // Publish to EventBus with target user IDs for cross-instance delivery
    await publishEvent(event, {
      ...(data as Record<string, unknown>),
      conversationId,
      targetUserIds: participantIds,
    });

    // Also emit directly to same-instance sockets for immediate delivery
    let totalSocketsEmitted = 0;
    for (const userId of participantIds) {
      const socketIds = userSockets.get(userId);
      if (socketIds && socketIds.size > 0) {
        for (const socketId of socketIds) {
          const socket = io?.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit(event as any, data as any);
            totalSocketsEmitted++;
          } else {
            socketIds.delete(socketId);
            socketToUser.delete(socketId);
          }
        }
      }
    }

    console.log(`[Socket] Emitted ${String(event)} to ${totalSocketsEmitted} sockets for ${participantIds.length} participants`);
  } catch (error) {
    console.error(`[Socket] Error broadcasting to conversation participants:`, error);
  }
}

/**
 * Broadcast to organization
 */
export function broadcastToOrg(
  orgId: string,
  event: keyof ServerToClientEvents,
  data: unknown
): void {
  if (io) {
    io.to(`org:${orgId}`).emit(event as any, data as any);
  }
}

/**
 * Broadcast to a specific user (all their connected devices)
 */
export function broadcastToUser(
  userId: string,
  event: keyof ServerToClientEvents,
  data: unknown
): void {
  emitToUser(userId, event, data);
}

/**
 * Broadcast to multiple users
 */
export function broadcastToUsers(
  userIds: string[],
  event: keyof ServerToClientEvents,
  data: unknown
): void {
  for (const userId of userIds) {
    emitToUser(userId, event, data);
  }
  console.log(`[Socket] Broadcasted ${String(event)} to ${userIds.length} users`);
}

/**
 * Get connected user count
 */
export function getConnectedUserCount(): number {
  return userSockets.size;
}

/**
 * Get total socket count
 */
export function getTotalSocketCount(): number {
  let count = 0;
  for (const sockets of userSockets.values()) {
    count += sockets.size;
  }
  return count;
}

/**
 * Check if a user is connected
 */
export function isUserConnected(userId: string): boolean {
  const sockets = userSockets.get(userId);
  return sockets !== undefined && sockets.size > 0;
}
