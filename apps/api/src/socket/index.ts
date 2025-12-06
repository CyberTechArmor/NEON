/**
 * Socket.io Server
 *
 * Real-time communication for chat, presence, and notifications
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getConfig } from '@neon/config';
import { prisma } from '@neon/database';
import { getRedis, getPublisher, getSubscriber, publish } from '../services/redis';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  AccessTokenPayload,
} from '@neon/shared';
import { SocketEvents } from '@neon/shared';
import { createAdapter } from '@socket.io/redis-adapter';

const config = getConfig();

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

// User socket mapping
const userSockets = new Map<string, Set<string>>();

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

  // Use Redis adapter for horizontal scaling
  const pubClient = getPublisher();
  const subClient = getSubscriber().duplicate();
  io.adapter(createAdapter(pubClient, subClient));

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

    console.log(`[Socket] User connected: ${userId}`);

    // Track socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // Join org room
    socket.join(`org:${orgId}`);

    // Update presence
    updatePresence(userId, 'ONLINE');

    // Handle authentication confirmation
    socket.emit(SocketEvents.AUTH_SUCCESS, { userId, orgId });

    // ==========================================================================
    // Presence
    // ==========================================================================

    socket.on(SocketEvents.PRESENCE_UPDATE, async (data) => {
      await updatePresence(userId, data.status, data.message);
    });

    socket.on(SocketEvents.PRESENCE_SUBSCRIBE, async (userIds) => {
      // Subscribe to presence updates for specific users
      for (const uid of userIds) {
        socket.join(`presence:${uid}`);
      }

      // Send current presence for requested users
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
      socket.join(`conversation:${conversationId}`);
    });

    socket.on(SocketEvents.CONVERSATION_LEAVE, (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // ==========================================================================
    // Messages
    // ==========================================================================

    socket.on(SocketEvents.MESSAGE_SEND, async (data, callback) => {
      try {
        // TODO: Implement message sending
        // This would call the message service to create and broadcast the message

        callback({ success: true, tempId: data.tempId, message: undefined });
      } catch (error) {
        callback({
          success: false,
          tempId: data.tempId,
          error: error instanceof Error ? error.message : 'Failed to send message',
        });
      }
    });

    // ==========================================================================
    // Typing Indicators
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
      // TODO: Implement read receipt tracking
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
        // TODO: Implement call initiation via LiveKit service
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
        // TODO: Implement call answering
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
          }, 5000); // 5 second delay before marking offline
        }
      }
    });
  });

  return io;
}

/**
 * Get Socket.io server instance
 */
export function getSocketServer(): Server | null {
  return io;
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

  // Cache presence in Redis for quick lookups
  const redis = getRedis();
  await redis.hset(`presence:${userId}`, {
    status,
    message: message ?? '',
    lastActiveAt: now.toISOString(),
  });
  await redis.expire(`presence:${userId}`, 3600); // 1 hour expiry

  // Broadcast to subscribers
  if (io) {
    io.to(`presence:${userId}`).emit(SocketEvents.PRESENCE_UPDATE, {
      userId,
      status,
      message,
      lastActiveAt: now.toISOString(),
    });
  }
}

/**
 * Get presence for multiple users
 */
async function getPresenceForUsers(
  userIds: string[]
): Promise<Array<{ userId: string; status: string; message?: string; lastActiveAt?: string }>> {
  const redis = getRedis();
  const results = [];

  for (const userId of userIds) {
    const presence = await redis.hgetall(`presence:${userId}`);
    if (presence.status) {
      results.push({
        userId,
        status: presence.status,
        message: presence.message || undefined,
        lastActiveAt: presence.lastActiveAt,
      });
    } else {
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
  }

  return results;
}

/**
 * Send notification to user
 */
export async function sendNotification(
  userId: string,
  notification: {
    id: string;
    type: string;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  if (io) {
    const sockets = userSockets.get(userId);
    if (sockets && sockets.size > 0) {
      io.to(Array.from(sockets)).emit(SocketEvents.NOTIFICATION, {
        ...notification,
        createdAt: new Date().toISOString(),
      });
    }
  }
}

/**
 * Broadcast to conversation
 */
export function broadcastToConversation(
  conversationId: string,
  event: keyof ServerToClientEvents,
  data: unknown
): void {
  if (io) {
    io.to(`conversation:${conversationId}`).emit(event as any, data as any);
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
