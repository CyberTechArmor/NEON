/**
 * Events API Routes
 *
 * REST API endpoints for publishing real-time events.
 * This enables external systems to trigger events via webhooks/API keys.
 *
 * Authentication:
 * - API Key: For external integrations (webhook-style)
 * - JWT: For internal use
 *
 * Usage:
 * - POST /api/events/message - Trigger message events
 * - POST /api/events/notification - Send notifications
 * - POST /api/events/broadcast - Broadcast to users/org
 * - GET /api/events/status - Check EventBus health
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@neon/database';
import { publishEvent, eventBus } from '../services/eventbus';
import { broadcastToUser, broadcastToUsers, broadcastToOrg, sendNotification, getConnectedUserCount, getTotalSocketCount } from '../socket';
import { SocketEvents } from '@neon/shared';
import { authenticate } from '../middleware/auth';
import { authenticateApiKey, ApiKeyRequest } from '../middleware/apiKey';

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const messageEventSchema = z.object({
  conversationId: z.string().uuid(),
  event: z.enum(['message:received', 'message:edited', 'message:deleted']),
  data: z.object({
    id: z.string().uuid().optional(),
    messageId: z.string().uuid().optional(),
    content: z.string().optional(),
    senderId: z.string().uuid().optional(),
    editedAt: z.string().optional(),
    deletedBy: z.string().uuid().optional(),
  }),
});

const notificationEventSchema = z.object({
  userId: z.string().uuid(),
  notification: z.object({
    type: z.string(),
    title: z.string(),
    body: z.string().optional(),
    data: z.record(z.unknown()).optional(),
  }),
});

const broadcastEventSchema = z.object({
  target: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('user'),
      userId: z.string().uuid(),
    }),
    z.object({
      type: z.literal('users'),
      userIds: z.array(z.string().uuid()),
    }),
    z.object({
      type: z.literal('org'),
      orgId: z.string().uuid(),
    }),
  ]),
  event: z.string(),
  data: z.record(z.unknown()),
});

const customEventSchema = z.object({
  event: z.string(),
  payload: z.record(z.unknown()),
  options: z.object({
    correlationId: z.string().optional(),
    source: z.string().optional(),
  }).optional(),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/events/status
 * Get EventBus and WebSocket status
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = {
      eventBus: {
        adapter: eventBus.getAdapterName(),
        healthy: eventBus.isHealthy(),
      },
      websocket: {
        connectedUsers: getConnectedUserCount(),
        totalSockets: getTotalSocketCount(),
      },
      timestamp: new Date().toISOString(),
    };

    return res.json({
      success: true,
      data: status,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/events/message
 * Publish a message event (for internal use or trusted integrations)
 * Requires JWT authentication
 */
router.post('/message', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = messageEventSchema.parse(req.body);

    // Verify user is participant (if authenticated)
    const participant = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: data.conversationId,
        userId: req.userId!,
        leftAt: null,
      },
    });

    if (!participant) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not a participant in this conversation' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Publish event to EventBus
    await publishEvent(data.event, {
      ...data.data,
      conversationId: data.conversationId,
    });

    return res.json({
      success: true,
      data: { published: true, event: data.event },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/events/notification
 * Send a notification to a user
 * Requires JWT or API Key authentication
 */
router.post('/notification', authenticateApiKey, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const data = notificationEventSchema.parse(req.body);

    // Verify target user exists
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, orgId: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // If using API key, verify org access
    if (req.apiKey && req.apiKey.orgId !== user.orgId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'API key does not have access to this user' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Create notification in database
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.notification.type,
        title: data.notification.title,
        body: data.notification.body,
        data: data.notification.data,
      },
    });

    // Send real-time notification
    await sendNotification(data.userId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: data.notification.data,
    });

    return res.status(201).json({
      success: true,
      data: { notificationId: notification.id, delivered: true },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/events/broadcast
 * Broadcast an event to users or organization
 * Requires API Key authentication
 */
router.post('/broadcast', authenticateApiKey, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const data = broadcastEventSchema.parse(req.body);

    // Verify org access for API key
    if (req.apiKey) {
      if (data.target.type === 'org' && req.apiKey.orgId !== data.target.orgId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'API key does not have access to this organization' },
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
      }

      if (data.target.type === 'user') {
        const user = await prisma.user.findUnique({
          where: { id: data.target.userId },
          select: { orgId: true },
        });
        if (!user || user.orgId !== req.apiKey.orgId) {
          return res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'API key does not have access to this user' },
            meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
          });
        }
      }

      if (data.target.type === 'users') {
        const users = await prisma.user.findMany({
          where: { id: { in: data.target.userIds } },
          select: { orgId: true },
        });
        const hasUnauthorized = users.some((u: { orgId: string }) => u.orgId !== req.apiKey!.orgId);
        if (hasUnauthorized) {
          return res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'API key does not have access to all specified users' },
            meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
          });
        }
      }
    }

    // Broadcast based on target type
    let recipientCount = 0;
    switch (data.target.type) {
      case 'user':
        broadcastToUser(data.target.userId, data.event as any, data.data);
        recipientCount = 1;
        break;
      case 'users':
        broadcastToUsers(data.target.userIds, data.event as any, data.data);
        recipientCount = data.target.userIds.length;
        break;
      case 'org':
        broadcastToOrg(data.target.orgId, data.event as any, data.data);
        // Get approximate count
        const orgUsers = await prisma.user.count({ where: { orgId: data.target.orgId, status: 'ACTIVE' } });
        recipientCount = orgUsers;
        break;
    }

    return res.json({
      success: true,
      data: {
        broadcast: true,
        event: data.event,
        targetType: data.target.type,
        recipientCount,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/events/publish
 * Publish a custom event to the EventBus
 * Requires API Key authentication
 *
 * This is the most flexible endpoint - allows publishing any event type
 * Useful for integrations that need to trigger custom workflows
 */
router.post('/publish', authenticateApiKey, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const data = customEventSchema.parse(req.body);

    // Add source information if API key is used
    const options = {
      ...data.options,
      source: req.apiKey ? `api_key:${req.apiKey.id}` : (data.options?.source || 'api'),
    };

    await publishEvent(data.event, data.payload, options);

    return res.json({
      success: true,
      data: {
        published: true,
        event: data.event,
        source: options.source,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/events/webhook
 * Generic webhook endpoint for external services
 * Requires API Key authentication
 *
 * This endpoint accepts a flexible payload and routes it to the appropriate handler
 */
router.post('/webhook', authenticateApiKey, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { type, data } = req.body;

    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Request must include type and data fields' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Log webhook receipt
    console.log(`[Events] Webhook received: type=${type}, apiKey=${req.apiKey?.id}`);

    // Route based on webhook type
    switch (type) {
      case 'message':
        // External system wants to inject a message event
        await publishEvent(SocketEvents.MESSAGE_RECEIVED, data, {
          source: `webhook:${req.apiKey?.id}`,
        });
        break;

      case 'notification':
        // External system wants to send a notification
        if (data.userId && data.title) {
          const notification = await prisma.notification.create({
            data: {
              userId: data.userId,
              type: data.type || 'webhook',
              title: data.title,
              body: data.body,
              data: data.metadata,
            },
          });
          await sendNotification(data.userId, {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            data: data.metadata,
          });
        }
        break;

      case 'alert':
        // External system wants to broadcast an alert
        if (data.userIds) {
          broadcastToUsers(data.userIds, 'custom:alert' as any, data);
        } else if (data.orgId) {
          broadcastToOrg(data.orgId, 'custom:alert' as any, data);
        }
        break;

      case 'custom':
        // Generic custom event
        if (data.event && data.payload) {
          await publishEvent(data.event, data.payload, {
            source: `webhook:${req.apiKey?.id}`,
          });
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: `Unknown webhook type: ${type}` },
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
    }

    return res.json({
      success: true,
      data: { received: true, type },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

export { router as eventsRouter };
