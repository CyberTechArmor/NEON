/**
 * Error Utilities
 *
 * Custom error classes and error handling utilities
 */

import { ErrorCodes, ErrorCodeToStatus, type ErrorCode, type ApiError } from '../types/api';

// =============================================================================
// Base Application Error
// =============================================================================

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly field?: string;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      field?: string;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ErrorCodeToStatus[code] || 500;
    this.details = options?.details;
    this.field = options?.field;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      field: this.field,
    };
  }
}

// =============================================================================
// Specific Error Classes
// =============================================================================

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', options?: { details?: Record<string, unknown> }) {
    super(ErrorCodes.UNAUTHORIZED, message, options);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', options?: { details?: Record<string, unknown> }) {
    super(ErrorCodes.FORBIDDEN, message, options);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super(ErrorCodes.NOT_FOUND, message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    options?: { field?: string; details?: Record<string, unknown> }
  ) {
    super(ErrorCodes.VALIDATION_ERROR, message, options);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options?: { details?: Record<string, unknown> }) {
    super(ErrorCodes.CONFLICT, message, options);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfterSeconds: number) {
    super(ErrorCodes.RATE_LIMITED, 'Too many requests', {
      details: { retryAfter: retryAfterSeconds },
    });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfterSeconds;
  }
}

export class MfaRequiredError extends AppError {
  public readonly mfaMethods: string[];

  constructor(mfaMethods: string[]) {
    super(ErrorCodes.MFA_REQUIRED, 'Multi-factor authentication required', {
      details: { mfaMethods },
    });
    this.name = 'MfaRequiredError';
    this.mfaMethods = mfaMethods;
  }
}

export class ApprovalRequiredError extends AppError {
  constructor(message = 'Conversation request approval required') {
    super(ErrorCodes.APPROVAL_REQUIRED, message);
    this.name = 'ApprovalRequiredError';
  }
}

export class FrozenConversationError extends AppError {
  constructor() {
    super(ErrorCodes.FROZEN_CONVERSATION, 'This conversation is frozen');
    this.name = 'FrozenConversationError';
  }
}

export class StorageLimitError extends AppError {
  constructor(message = 'Storage limit exceeded') {
    super(ErrorCodes.STORAGE_LIMIT_EXCEEDED, message);
    this.name = 'StorageLimitError';
  }
}

export class FileTooLargeError extends AppError {
  constructor(maxSize: number) {
    super(ErrorCodes.FILE_TOO_LARGE, `File exceeds maximum size of ${formatBytes(maxSize)}`);
    this.name = 'FileTooLargeError';
  }
}

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Check if an error is an operational error (expected/handled)
 */
export function isOperationalError(error: unknown): error is AppError {
  return error instanceof AppError && error.isOperational;
}

/**
 * Wrap unknown errors into AppError
 */
export function wrapError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(ErrorCodes.INTERNAL_ERROR, error.message, { cause: error });
  }

  return new AppError(ErrorCodes.INTERNAL_ERROR, 'An unexpected error occurred');
}

/**
 * Create error from API error response
 */
export function fromApiError(apiError: ApiError): AppError {
  return new AppError(apiError.code as ErrorCode, apiError.message, {
    details: apiError.details,
    field: apiError.field,
  });
}

// Helper function (duplicated here to avoid circular deps)
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
