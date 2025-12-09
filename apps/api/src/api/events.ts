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
// API Documentation
// =============================================================================

const apiDocumentation = {
  openapi: '3.0.3',
  info: {
    title: 'NEON Events API',
    version: '1.0.0',
    description: `
Real-time event publishing API for NEON. This API enables external systems
to trigger real-time events, send notifications, and broadcast messages to
connected clients via WebSocket.

## Authentication

All endpoints (except /docs and /status) require authentication via one of:
- **API Key**: Pass in header \`X-API-Key: your_api_key\`
- **JWT Token**: Pass in header \`Authorization: Bearer your_token\`

## Rate Limiting

API keys have configurable rate limits. Default: 100 requests/minute.

## Event Types

The following built-in event types are supported:
- \`message:received\` - New message in conversation
- \`message:edited\` - Message was edited
- \`message:deleted\` - Message was deleted
- \`notification\` - User notification
- \`conversation:created\` - New conversation
- \`conversation:updated\` - Conversation updated

Custom event types can be published using the /publish endpoint.
    `.trim(),
    contact: {
      name: 'NEON Support',
    },
  },
  servers: [
    {
      url: '/api/events',
      description: 'Events API',
    },
  ],
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for external integrations',
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'BAD_REQUEST' },
              message: { type: 'string', example: 'Invalid request' },
            },
          },
          meta: {
            type: 'object',
            properties: {
              requestId: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      NotificationPayload: {
        type: 'object',
        required: ['userId', 'notification'],
        properties: {
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'Target user ID',
          },
          notification: {
            type: 'object',
            required: ['type', 'title'],
            properties: {
              type: {
                type: 'string',
                description: 'Notification type (e.g., "alert", "info", "warning")',
                example: 'alert',
              },
              title: {
                type: 'string',
                description: 'Notification title',
                example: 'New Message',
              },
              body: {
                type: 'string',
                description: 'Notification body text',
                example: 'You have a new message from John',
              },
              data: {
                type: 'object',
                description: 'Additional data payload',
                additionalProperties: true,
              },
            },
          },
        },
      },
      BroadcastPayload: {
        type: 'object',
        required: ['target', 'event', 'data'],
        properties: {
          target: {
            oneOf: [
              {
                type: 'object',
                required: ['type', 'userId'],
                properties: {
                  type: { type: 'string', enum: ['user'] },
                  userId: { type: 'string', format: 'uuid' },
                },
              },
              {
                type: 'object',
                required: ['type', 'userIds'],
                properties: {
                  type: { type: 'string', enum: ['users'] },
                  userIds: {
                    type: 'array',
                    items: { type: 'string', format: 'uuid' },
                  },
                },
              },
              {
                type: 'object',
                required: ['type', 'orgId'],
                properties: {
                  type: { type: 'string', enum: ['org'] },
                  orgId: { type: 'string', format: 'uuid' },
                },
              },
            ],
          },
          event: {
            type: 'string',
            description: 'Event name to broadcast',
            example: 'custom:update',
          },
          data: {
            type: 'object',
            description: 'Event payload data',
            additionalProperties: true,
          },
        },
      },
      PublishPayload: {
        type: 'object',
        required: ['event', 'payload'],
        properties: {
          event: {
            type: 'string',
            description: 'Event name',
            example: 'custom:workflow:started',
          },
          payload: {
            type: 'object',
            description: 'Event payload',
            additionalProperties: true,
          },
          options: {
            type: 'object',
            properties: {
              correlationId: {
                type: 'string',
                description: 'Correlation ID for tracking',
              },
              source: {
                type: 'string',
                description: 'Event source identifier',
              },
            },
          },
        },
      },
      WebhookPayload: {
        type: 'object',
        required: ['type', 'data'],
        properties: {
          type: {
            type: 'string',
            enum: ['message', 'notification', 'alert', 'custom'],
            description: 'Webhook type',
          },
          data: {
            type: 'object',
            description: 'Webhook data (varies by type)',
            additionalProperties: true,
          },
        },
      },
    },
  },
  paths: {
    '/docs': {
      get: {
        summary: 'Get API Documentation',
        description: 'Returns OpenAPI 3.0 specification for the Events API',
        tags: ['Documentation'],
        security: [],
        responses: {
          '200': {
            description: 'API documentation',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      },
    },
    '/status': {
      get: {
        summary: 'Get System Status',
        description: 'Returns EventBus and WebSocket connection status',
        tags: ['Health'],
        security: [],
        responses: {
          '200': {
            description: 'System status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        eventBus: {
                          type: 'object',
                          properties: {
                            adapter: { type: 'string', example: 'inmemory' },
                            healthy: { type: 'boolean' },
                          },
                        },
                        websocket: {
                          type: 'object',
                          properties: {
                            connectedUsers: { type: 'integer' },
                            totalSockets: { type: 'integer' },
                          },
                        },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/notification': {
      post: {
        summary: 'Send Notification',
        description: 'Send a real-time notification to a specific user. The notification is persisted to the database and delivered via WebSocket.',
        tags: ['Notifications'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NotificationPayload' },
              examples: {
                basic: {
                  summary: 'Basic notification',
                  value: {
                    userId: '123e4567-e89b-12d3-a456-426614174000',
                    notification: {
                      type: 'info',
                      title: 'Update Available',
                      body: 'A new version is available',
                    },
                  },
                },
                withData: {
                  summary: 'Notification with data',
                  value: {
                    userId: '123e4567-e89b-12d3-a456-426614174000',
                    notification: {
                      type: 'alert',
                      title: 'Action Required',
                      body: 'Please review the pending request',
                      data: {
                        action: 'review',
                        resourceId: 'req-456',
                        url: '/requests/req-456',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Notification sent successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        notificationId: { type: 'string', format: 'uuid' },
                        delivered: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': {
            description: 'Forbidden - API key does not have access to user',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
          '404': {
            description: 'User not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/broadcast': {
      post: {
        summary: 'Broadcast Event',
        description: 'Broadcast a custom event to a user, multiple users, or an entire organization.',
        tags: ['Broadcasting'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BroadcastPayload' },
              examples: {
                singleUser: {
                  summary: 'Broadcast to single user',
                  value: {
                    target: {
                      type: 'user',
                      userId: '123e4567-e89b-12d3-a456-426614174000',
                    },
                    event: 'custom:refresh',
                    data: { resource: 'dashboard' },
                  },
                },
                multipleUsers: {
                  summary: 'Broadcast to multiple users',
                  value: {
                    target: {
                      type: 'users',
                      userIds: [
                        '123e4567-e89b-12d3-a456-426614174000',
                        '123e4567-e89b-12d3-a456-426614174001',
                      ],
                    },
                    event: 'team:update',
                    data: { message: 'Team settings updated' },
                  },
                },
                organization: {
                  summary: 'Broadcast to organization',
                  value: {
                    target: {
                      type: 'org',
                      orgId: '123e4567-e89b-12d3-a456-426614174000',
                    },
                    event: 'announcement',
                    data: {
                      title: 'System Maintenance',
                      message: 'Scheduled maintenance in 1 hour',
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Event broadcast successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        broadcast: { type: 'boolean' },
                        event: { type: 'string' },
                        targetType: { type: 'string' },
                        recipientCount: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': {
            description: 'Forbidden - API key does not have access',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/publish': {
      post: {
        summary: 'Publish Custom Event',
        description: 'Publish a custom event to the EventBus. This is the most flexible endpoint for triggering custom workflows and integrations.',
        tags: ['Events'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PublishPayload' },
              examples: {
                basic: {
                  summary: 'Basic event',
                  value: {
                    event: 'workflow:started',
                    payload: {
                      workflowId: 'wf-123',
                      triggeredBy: 'api',
                    },
                  },
                },
                withOptions: {
                  summary: 'Event with tracking options',
                  value: {
                    event: 'order:created',
                    payload: {
                      orderId: 'ord-456',
                      total: 99.99,
                    },
                    options: {
                      correlationId: 'req-789',
                      source: 'ecommerce-webhook',
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Event published successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        published: { type: 'boolean' },
                        event: { type: 'string' },
                        source: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/webhook': {
      post: {
        summary: 'Generic Webhook',
        description: `
Generic webhook endpoint for external services. Supports multiple webhook types:
- **message**: Inject a message event
- **notification**: Send a notification to a user
- **alert**: Broadcast an alert to users or organization
- **custom**: Publish a custom event
        `.trim(),
        tags: ['Webhooks'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebhookPayload' },
              examples: {
                notification: {
                  summary: 'Send notification webhook',
                  value: {
                    type: 'notification',
                    data: {
                      userId: '123e4567-e89b-12d3-a456-426614174000',
                      title: 'External Alert',
                      body: 'Alert from external system',
                      type: 'external',
                      metadata: { source: 'monitoring' },
                    },
                  },
                },
                alert: {
                  summary: 'Broadcast alert webhook',
                  value: {
                    type: 'alert',
                    data: {
                      orgId: '123e4567-e89b-12d3-a456-426614174000',
                      title: 'System Alert',
                      severity: 'warning',
                      message: 'High CPU usage detected',
                    },
                  },
                },
                custom: {
                  summary: 'Custom event webhook',
                  value: {
                    type: 'custom',
                    data: {
                      event: 'integration:sync:completed',
                      payload: {
                        integrationId: 'int-123',
                        recordsProcessed: 150,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Webhook processed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        received: { type: 'boolean' },
                        type: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad request - Invalid webhook type or missing fields',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/message': {
      post: {
        summary: 'Publish Message Event',
        description: 'Publish a message event to a conversation. Requires JWT authentication and the user must be a participant in the conversation.',
        tags: ['Messages'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['conversationId', 'event', 'data'],
                properties: {
                  conversationId: { type: 'string', format: 'uuid' },
                  event: {
                    type: 'string',
                    enum: ['message:received', 'message:edited', 'message:deleted'],
                  },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      messageId: { type: 'string', format: 'uuid' },
                      content: { type: 'string' },
                      senderId: { type: 'string', format: 'uuid' },
                      editedAt: { type: 'string', format: 'date-time' },
                      deletedBy: { type: 'string', format: 'uuid' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Message event published',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        published: { type: 'boolean' },
                        event: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': {
            description: 'Not a participant in conversation',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
  },
  tags: [
    {
      name: 'Documentation',
      description: 'API documentation endpoints',
    },
    {
      name: 'Health',
      description: 'System health and status',
    },
    {
      name: 'Notifications',
      description: 'Send real-time notifications to users',
    },
    {
      name: 'Broadcasting',
      description: 'Broadcast events to users or organizations',
    },
    {
      name: 'Events',
      description: 'Publish custom events to the EventBus',
    },
    {
      name: 'Webhooks',
      description: 'Generic webhook endpoints for external integrations',
    },
    {
      name: 'Messages',
      description: 'Message-related events (requires JWT)',
    },
  ],
};

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/events/docs
 * Get API documentation (OpenAPI 3.0 spec)
 */
router.get('/docs', (_req: Request, res: Response) => {
  res.json(apiDocumentation);
});

/**
 * GET /api/events/docs/html
 * Get API documentation as HTML (Swagger UI redirect)
 */
router.get('/docs/html', (_req: Request, res: Response) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NEON Events API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/api/events/docs',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        deepLinking: true,
        showExtensions: true,
        showCommonExtensions: true
      });
    };
  </script>
</body>
</html>
  `.trim();
  res.type('html').send(html);
});

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
