/**
 * Express Application Configuration
 *
 * Sets up middleware, routes, and error handling
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { getConfig } from '@neon/config';
import { AppError, ErrorCodes } from '@neon/shared';
import { prisma } from '@neon/database';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './api/auth';
import { usersRouter } from './api/users';
import { organizationsRouter } from './api/organizations';
import { departmentsRouter } from './api/departments';
import { rolesRouter } from './api/roles';
import { conversationsRouter } from './api/conversations';
import { messagesRouter } from './api/messages';
import { meetingsRouter } from './api/meetings';
import { callsRouter } from './api/calls';
import { filesRouter } from './api/files';
import { notificationsRouter } from './api/notifications';
import { adminRouter } from './api/admin';
import { webhooksRouter } from './api/webhooks';

const config = getConfig();

export function createApp(): Express {
  const app = express();

  // Trust proxy when behind reverse proxy
  if (config.api.trustProxy) {
    app.set('trust proxy', 1);
  }

  // ==========================================================================
  // Security Middleware
  // ==========================================================================

  // Helmet security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", config.livekit.url],
          mediaSrc: ["'self'", 'blob:'],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Required for LiveKit
    })
  );

  // CORS
  app.use(
    cors({
      origin: config.api.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      error: {
        code: ErrorCodes.RATE_LIMITED,
        message: 'Too many requests, please try again later',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return (req as Request & { userId?: string }).userId || req.ip || 'anonymous';
    },
  });
  app.use(limiter);

  // ==========================================================================
  // Request Processing
  // ==========================================================================

  // Request ID
  app.use(requestId);

  // Request logging
  app.use(requestLogger);

  // Body parsing
  app.use(express.json({ limit: config.files.maxBodySize }));
  app.use(express.urlencoded({ extended: true, limit: config.files.maxBodySize }));

  // Cookie parsing
  app.use(cookieParser(config.auth.sessionSecret));

  // ==========================================================================
  // Health & Status Routes
  // ==========================================================================

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    });
  });

  // Also expose health at /api/health for consistency with proxy config
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    });
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    // TODO: Check database and Redis connectivity
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  });

  // System initialization status (public, no auth required)
  app.get('/api/status/init', async (_req: Request, res: Response) => {
    try {
      // Check if any users exist in the database
      const userCount = await prisma.user.count();
      const orgCount = await prisma.organization.count();

      const isInitialized = userCount > 0 && orgCount > 0;

      res.json({
        success: true,
        data: {
          initialized: isInitialized,
          hasUsers: userCount > 0,
          hasOrganization: orgCount > 0,
        },
      });
    } catch (error) {
      // Database might not be ready yet
      res.json({
        success: true,
        data: {
          initialized: false,
          hasUsers: false,
          hasOrganization: false,
          error: 'Database not ready',
        },
      });
    }
  });

  // ==========================================================================
  // API Routes
  // ==========================================================================

  const apiRouter = express.Router();

  // Authentication
  apiRouter.use('/auth', authRouter);

  // Users
  apiRouter.use('/users', usersRouter);

  // Organizations
  apiRouter.use('/organizations', organizationsRouter);

  // Departments
  apiRouter.use('/departments', departmentsRouter);

  // Roles
  apiRouter.use('/roles', rolesRouter);

  // Conversations
  apiRouter.use('/conversations', conversationsRouter);

  // Messages
  apiRouter.use('/messages', messagesRouter);

  // Meetings
  apiRouter.use('/meetings', meetingsRouter);

  // Calls
  apiRouter.use('/calls', callsRouter);

  // Files
  apiRouter.use('/files', filesRouter);

  // Notifications
  apiRouter.use('/notifications', notificationsRouter);

  // Admin
  apiRouter.use('/admin', adminRouter);

  // Webhooks (for LiveKit, etc.)
  apiRouter.use('/webhooks', webhooksRouter);

  // Mount API router at /api (not /api/v1 to match frontend expectations)
  app.use('/api', apiRouter);

  // ==========================================================================
  // 404 Handler
  // ==========================================================================

  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(ErrorCodes.NOT_FOUND, 'Endpoint not found'));
  });

  // ==========================================================================
  // Error Handler
  // ==========================================================================

  app.use(errorHandler);

  return app;
}
