/**
 * Request ID Middleware
 *
 * Generates and attaches a unique request ID for tracing
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate new one
  const id = (req.headers['x-request-id'] as string) || randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-ID', id);

  next();
}
