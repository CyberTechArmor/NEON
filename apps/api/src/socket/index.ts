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

    // Join org room and personal user room
    socket.join(`org:${orgId}`);
    socket.join(`user:${userId}`);

    // Verify room membership
    const userRoom = io!.sockets.adapter.rooms.get(`user:${userId}`);
    console.log(`[Socket] User ${userId} joined room user:${userId}, room now has ${userRoom?.size || 0} sockets`);
    console.log(`[Socket] Socket ${socket.id} rooms:`, Array.from(socket.rooms));

    // Update presence
    updatePresence(userId, 'ONLINE');

    // Handle authentication confirmation
    socket.emit(SocketEvents.AUTH_SUCCESS, { userId, orgId });

    // ==========================================================================
    // Presence
    // ==========================================================================

    socket.on(SocketEvents.PRESENCE_UPDATE, async (data) => {
      // Normalize status to uppercase for Prisma enum compatibility
      const normalizedStatus = normalizePresenceStatus(data.status);
      await updatePresence(userId, normalizedStatus, data.message);
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
      console.log(`[Socket] User ${userId} joining conversation:`, conversationId);
      socket.join(`conversation:${conversationId}`);
    });

    socket.on(SocketEvents.CONVERSATION_LEAVE, (conversationId) => {
      console.log(`[Socket] User ${userId} leaving conversation:`, conversationId);
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

      console.log(`[Socket] Sending test alert to user:${userId} room`);

      // Send to user's room (all their connected devices automatically join this room)
      // Using room-based broadcasting is more reliable than tracking socket IDs
      io!.to(`user:${userId}`).emit(SocketEvents.TEST_ALERT, alert);
    });

    socket.on(SocketEvents.TEST_ALERT_ACKNOWLEDGE, (data) => {
      console.log(`[Socket] Test alert acknowledged by user:${userId}`);

      // Notify all user's devices that the alert was acknowledged via user room
      io!.to(`user:${userId}`).emit(SocketEvents.TEST_ALERT_ACKNOWLEDGED, { id: data.id });
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

type PresenceStatus = 'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE';

/**
 * Normalize presence status string to Prisma enum format (uppercase)
 * Handles lowercase values from frontend and 'busy' -> 'DND' mapping
 */
function normalizePresenceStatus(status: string): PresenceStatus {
  const upperStatus = (status || 'offline').toUpperCase();

  // Map 'BUSY' to 'DND' (Do Not Disturb)
  if (upperStatus === 'BUSY') {
    return 'DND';
  }

  // Validate and return valid status
  if (['ONLINE', 'AWAY', 'DND', 'OFFLINE'].includes(upperStatus)) {
    return upperStatus as PresenceStatus;
  }

  // Default to OFFLINE for unknown values
  return 'OFFLINE';
}

/**
 * Get presence for multiple users
 */
async function getPresenceForUsers(
  userIds: string[]
): Promise<Array<{ userId: string; status: PresenceStatus; message?: string; lastActiveAt?: string }>> {
  const redis = getRedis();
  const results = [];

  for (const userId of userIds) {
    const presence = await redis.hgetall(`presence:${userId}`);
    if (presence.status) {
      results.push({
        userId,
        status: presence.status as PresenceStatus,
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
 * Send notification to user via direct socket emission
 * Uses the userSockets map for reliable delivery
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
  if (!io) {
    console.error(`[Socket] Cannot send notification to user ${userId}: io is null`);
    return;
  }

  const socketIds = userSockets.get(userId);
  const notificationPayload = {
    ...notification,
    body: notification.body ?? null,
    data: notification.data ?? null,
    createdAt: new Date().toISOString(),
  };

  if (socketIds && socketIds.size > 0) {
    console.log(`[Socket] Sending notification to user ${userId} (${socketIds.size} sockets)`);
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(SocketEvents.NOTIFICATION, notificationPayload);
      } else {
        socketIds.delete(socketId);
      }
    }
  } else {
    console.log(`[Socket] User ${userId} has no active sockets for notification`);
  }
}

/**
 * Broadcast to conversation room
 * This is for users who have actively joined the conversation room
 * (used as a secondary delivery mechanism)
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
  console.log(`[Socket] Broadcasting ${String(event)} to conversation room ${room} (${socketCount} sockets in room)`);

  if (socketCount > 0) {
    // Also emit directly to the sockets in the room for reliability
    for (const socketId of socketsInRoom!) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event as any, data as any);
        console.log(`[Socket] Emitted ${String(event)} directly to socket ${socketId} in conversation room`);
      }
    }
  }
}

/**
 * Broadcast to conversation participants using direct socket emission
 * This bypasses rooms and emits directly to tracked socket IDs for reliability
 */
export async function broadcastToConversationParticipants(
  conversationId: string,
  event: keyof ServerToClientEvents,
  data: unknown
): Promise<void> {
  console.log(`[Socket] broadcastToConversationParticipants called for conversation ${conversationId}, event: ${String(event)}`);
  console.log(`[Socket] io instance exists: ${!!io}`);

  if (!io) {
    console.error(`[Socket] ERROR: io is null! Cannot broadcast ${String(event)}`);
    return;
  }

  try {
    // Get all participants of the conversation
    const participants = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        leftAt: null,
      },
      select: { userId: true },
    });

    const participantIds = participants.map(p => p.userId);
    console.log(`[Socket] Found ${participantIds.length} participants:`, participantIds);

    let totalSocketsEmitted = 0;

    // Emit directly to each participant's socket IDs (bypass rooms for reliability)
    for (const participantUserId of participantIds) {
      const socketIds = userSockets.get(participantUserId);

      if (socketIds && socketIds.size > 0) {
        console.log(`[Socket] User ${participantUserId} has ${socketIds.size} active sockets`);

        // Emit directly to each socket ID
        for (const socketId of socketIds) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit(event as any, data as any);
            totalSocketsEmitted++;
            console.log(`[Socket] Emitted ${String(event)} directly to socket ${socketId} for user ${participantUserId}`);
          } else {
            console.log(`[Socket] Socket ${socketId} not found, removing from tracking`);
            socketIds.delete(socketId);
          }
        }
      } else {
        console.log(`[Socket] User ${participantUserId} has no active sockets`);
      }
    }

    console.log(`[Socket] Completed broadcasting ${String(event)} to ${totalSocketsEmitted} sockets for ${participantIds.length} participants`);
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
 * Uses direct socket emission for reliability
 */
export function broadcastToUser(
  userId: string,
  event: keyof ServerToClientEvents,
  data: unknown
): void {
  if (!io) {
    console.error(`[Socket] Cannot broadcast to user ${userId}: io is null`);
    return;
  }

  const socketIds = userSockets.get(userId);
  if (socketIds && socketIds.size > 0) {
    console.log(`[Socket] Broadcasting ${String(event)} to user ${userId} (${socketIds.size} sockets)`);
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event as any, data as any);
      } else {
        socketIds.delete(socketId);
      }
    }
  } else {
    console.log(`[Socket] User ${userId} has no active sockets for ${String(event)}`);
  }
}

/**
 * Broadcast to multiple users
 * Uses direct socket emission for reliability
 */
export function broadcastToUsers(
  userIds: string[],
  event: keyof ServerToClientEvents,
  data: unknown
): void {
  if (!io) {
    console.error(`[Socket] Cannot broadcast to users: io is null`);
    return;
  }

  for (const userId of userIds) {
    const socketIds = userSockets.get(userId);
    if (socketIds && socketIds.size > 0) {
      for (const socketId of socketIds) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit(event as any, data as any);
        } else {
          socketIds.delete(socketId);
        }
      }
    }
  }
  console.log(`[Socket] Broadcasted ${String(event)} to ${userIds.length} users`);
}
