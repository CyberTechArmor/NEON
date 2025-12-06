/**
 * Request Logger Middleware
 *
 * Logs all incoming HTTP requests
 */

import { Request, Response, NextFunction } from 'express';
import { getConfig } from '@neon/config';

const config = getConfig();

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    if (config.logLevel === 'debug' || (config.logLevel === 'info' && logLevel === 'info')) {
      console.log(
        `[${logLevel.toUpperCase()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
      );

      if (config.logLevel === 'debug') {
        console.log(JSON.stringify(logData, null, 2));
      }
    }
  });

  next();
}
