/**
 * Redis Service
 *
 * Redis client for caching, pub/sub, and session management
 */

import Redis from 'ioredis';
import { getConfig } from '@neon/config';

const config = getConfig();

let redis: Redis | null = null;
let subscriber: Redis | null = null;
let publisher: Redis | null = null;

/**
 * Get Redis client options
 */
function getRedisOptions(): ConstructorParameters<typeof Redis>[0] {
  const url = new URL(config.redis.url);

  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: config.redis.password || undefined,
    keyPrefix: config.redis.prefix,
    retryStrategy: (times: number) => {
      if (times > 10) {
        console.error('[Redis] Max retry attempts reached');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    reconnectOnError: (err: Error) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  };
}

/**
 * Connect to Redis
 */
export async function connectRedis(): Promise<void> {
  const options = getRedisOptions();

  redis = new Redis(options);
  subscriber = new Redis(options);
  publisher = new Redis(options);

  // Event handlers
  redis.on('connect', () => {
    console.log('[Redis] Connected');
  });

  redis.on('error', (error) => {
    console.error('[Redis] Error:', error.message);
  });

  redis.on('close', () => {
    console.log('[Redis] Connection closed');
  });

  // Wait for connection
  await new Promise<void>((resolve, reject) => {
    redis!.once('ready', resolve);
    redis!.once('error', reject);
  });
}

/**
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
  if (publisher) {
    await publisher.quit();
    publisher = null;
  }
}

/**
 * Get Redis client
 */
export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not connected');
  }
  return redis;
}

/**
 * Get subscriber client (for pub/sub)
 */
export function getSubscriber(): Redis {
  if (!subscriber) {
    throw new Error('Redis subscriber not connected');
  }
  return subscriber;
}

/**
 * Get publisher client (for pub/sub)
 */
export function getPublisher(): Redis {
  if (!publisher) {
    throw new Error('Redis publisher not connected');
  }
  return publisher;
}

// =============================================================================
// Cache Helpers
// =============================================================================

/**
 * Set a cached value with optional TTL
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  const redis = getRedis();
  const serialized = JSON.stringify(value);

  if (ttlSeconds) {
    await redis.setex(key, ttlSeconds, serialized);
  } else {
    await redis.set(key, serialized);
  }
}

/**
 * Get a cached value
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const value = await redis.get(key);

  if (!value) {
    return null;
  }

  return JSON.parse(value) as T;
}

/**
 * Delete a cached value
 */
export async function deleteCache(key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(key);
}

/**
 * Delete multiple cached values by pattern
 */
export async function deleteCachePattern(pattern: string): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys(pattern);

  if (keys.length > 0) {
    // Remove prefix from keys since del() will add it
    const keysWithoutPrefix = keys.map((k) => k.replace(config.redis.prefix, ''));
    await redis.del(...keysWithoutPrefix);
  }
}

// =============================================================================
// Session Helpers
// =============================================================================

/**
 * Store session data
 */
export async function setSession(
  sessionId: string,
  data: Record<string, unknown>,
  ttlSeconds: number
): Promise<void> {
  await setCache(`session:${sessionId}`, data, ttlSeconds);
}

/**
 * Get session data
 */
export async function getSession(
  sessionId: string
): Promise<Record<string, unknown> | null> {
  return getCache(`session:${sessionId}`);
}

/**
 * Delete session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await deleteCache(`session:${sessionId}`);
}

/**
 * Delete all sessions for a user
 */
export async function deleteUserSessions(userId: string): Promise<void> {
  await deleteCachePattern(`*session:*:${userId}*`);
}

// =============================================================================
// Rate Limiting Helpers
// =============================================================================

/**
 * Check and increment rate limit
 * Returns remaining attempts, or -1 if limit exceeded
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<{ remaining: number; resetAt: number }> {
  const redis = getRedis();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  const rateKey = `ratelimit:${key}`;

  // Use a sorted set for sliding window rate limiting
  await redis
    .multi()
    .zremrangebyscore(rateKey, 0, windowStart)
    .zadd(rateKey, now, `${now}`)
    .expire(rateKey, windowSeconds)
    .exec();

  const count = await redis.zcard(rateKey);
  const remaining = Math.max(0, maxAttempts - count);
  const resetAt = now + windowMs;

  return { remaining, resetAt };
}

// =============================================================================
// Pub/Sub Helpers
// =============================================================================

/**
 * Publish a message to a channel
 */
export async function publish(channel: string, message: unknown): Promise<void> {
  const publisher = getPublisher();
  await publisher.publish(channel, JSON.stringify(message));
}

/**
 * Subscribe to a channel
 */
export async function subscribe(
  channel: string,
  callback: (message: unknown) => void
): Promise<void> {
  const subscriber = getSubscriber();

  subscriber.on('message', (ch, message) => {
    if (ch === `${config.redis.prefix}${channel}`) {
      try {
        callback(JSON.parse(message));
      } catch (error) {
        console.error(`[Redis] Error parsing message on ${channel}:`, error);
      }
    }
  });

  await subscriber.subscribe(`${config.redis.prefix}${channel}`);
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribe(channel: string): Promise<void> {
  const subscriber = getSubscriber();
  await subscriber.unsubscribe(`${config.redis.prefix}${channel}`);
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  if (!redis) {
    return { healthy: false, error: 'Redis not connected' };
  }

  const start = Date.now();

  try {
    await redis.ping();
    return {
      healthy: true,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
