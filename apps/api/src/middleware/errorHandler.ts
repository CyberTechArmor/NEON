/**
 * Error Handler Middleware
 *
 * Centralized error handling for all API errors
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@neon/database';
import { AppError, ErrorCodes, isOperationalError, type ApiResponse, type ApiError } from '@neon/shared';
import { getConfig } from '@neon/config';

const config = getConfig();

/**
 * Format Zod validation errors
 */
function formatZodError(error: ZodError): ApiError {
  const firstError = error.errors[0];
  const field = firstError?.path.join('.');
  const message = firstError?.message || 'Validation error';

  return {
    code: ErrorCodes.VALIDATION_ERROR,
    message,
    field: field || undefined,
    details: {
      errors: error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    },
  };
}

/**
 * Format Prisma errors
 */
function formatPrismaError(error: Prisma.PrismaClientKnownRequestError): ApiError {
  switch (error.code) {
    case 'P2002': {
      const field = (error.meta?.target as string[])?.join(', ') || 'field';
      return {
        code: ErrorCodes.ALREADY_EXISTS,
        message: `A record with this ${field} already exists`,
        field,
      };
    }
    case 'P2003':
      return {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Invalid reference to related record',
      };
    case 'P2025':
      return {
        code: ErrorCodes.NOT_FOUND,
        message: 'Record not found',
      };
    default:
      return {
        code: ErrorCodes.DATABASE_ERROR,
        message: config.nodeEnv === 'development' ? error.message : 'Database error',
      };
  }
}

/**
 * Main error handler middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  console.error(`[Error] ${req.method} ${req.path}:`, {
    requestId: req.requestId,
    error: error.message,
    stack: config.nodeEnv === 'development' ? error.stack : undefined,
  });

  let statusCode = 500;
  let apiError: ApiError;

  // Handle different error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    apiError = error.toJSON();
  } else if (error instanceof ZodError) {
    statusCode = 400;
    apiError = formatZodError(error);
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    apiError = formatPrismaError(error);
    statusCode = apiError.code === ErrorCodes.NOT_FOUND ? 404 :
                 apiError.code === ErrorCodes.ALREADY_EXISTS ? 409 : 500;
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    apiError = {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Invalid data provided',
    };
  } else if (error.name === 'SyntaxError' && 'body' in error) {
    // JSON parsing error
    statusCode = 400;
    apiError = {
      code: ErrorCodes.INVALID_INPUT,
      message: 'Invalid JSON in request body',
    };
  } else {
    // Unknown error - don't leak details in production
    apiError = {
      code: ErrorCodes.INTERNAL_ERROR,
      message: config.nodeEnv === 'development' ? error.message : 'An unexpected error occurred',
    };
  }

  // Include stack trace in development
  if (config.nodeEnv === 'development' && !isOperationalError(error)) {
    apiError.details = {
      ...apiError.details,
      stack: error.stack,
    };
  }

  const response: ApiResponse = {
    success: false,
    error: apiError,
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(statusCode).json(response);
}
