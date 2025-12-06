/**
 * API Response Types
 *
 * Standard response formats for all API endpoints
 */

// =============================================================================
// Base Response Types
// =============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  field?: string; // For validation errors
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CursorPaginationMeta {
  cursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Success Response Helpers
// =============================================================================

export interface SuccessResponse<T> extends ApiResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse extends ApiResponse<never> {
  success: false;
  error: ApiError;
}

export interface PaginatedResponse<T> extends SuccessResponse<T[]> {
  meta: ResponseMeta & {
    pagination: PaginationMeta;
  };
}

export interface CursorPaginatedResponse<T> extends SuccessResponse<T[]> {
  meta: ResponseMeta & {
    pagination: CursorPaginationMeta;
  };
}

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCodes = {
  // Authentication (1xxx)
  UNAUTHORIZED: 'AUTH_001',
  INVALID_CREDENTIALS: 'AUTH_002',
  SESSION_EXPIRED: 'AUTH_003',
  MFA_REQUIRED: 'AUTH_004',
  MFA_INVALID: 'AUTH_005',
  ACCOUNT_LOCKED: 'AUTH_006',
  ACCOUNT_DEACTIVATED: 'AUTH_007',
  PASSWORD_EXPIRED: 'AUTH_008',

  // Authorization (2xxx)
  FORBIDDEN: 'AUTHZ_001',
  INSUFFICIENT_PERMISSIONS: 'AUTHZ_002',
  CROSS_ORG_ACCESS_DENIED: 'AUTHZ_003',
  APPROVAL_REQUIRED: 'AUTHZ_004',
  FROZEN_CONVERSATION: 'AUTHZ_005',

  // Validation (3xxx)
  VALIDATION_ERROR: 'VAL_001',
  INVALID_INPUT: 'VAL_002',
  MISSING_REQUIRED_FIELD: 'VAL_003',
  INVALID_FORMAT: 'VAL_004',

  // Resource (4xxx)
  NOT_FOUND: 'RES_001',
  ALREADY_EXISTS: 'RES_002',
  CONFLICT: 'RES_003',
  GONE: 'RES_004',

  // Rate Limiting (5xxx)
  RATE_LIMITED: 'RATE_001',
  TOO_MANY_REQUESTS: 'RATE_002',

  // File/Storage (6xxx)
  FILE_TOO_LARGE: 'FILE_001',
  STORAGE_LIMIT_EXCEEDED: 'FILE_002',
  INVALID_FILE_TYPE: 'FILE_003',
  UPLOAD_FAILED: 'FILE_004',

  // Server (9xxx)
  INTERNAL_ERROR: 'SRV_001',
  SERVICE_UNAVAILABLE: 'SRV_002',
  DATABASE_ERROR: 'SRV_003',
  EXTERNAL_SERVICE_ERROR: 'SRV_004',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// =============================================================================
// HTTP Status Mapping
// =============================================================================

export const ErrorCodeToStatus: Record<ErrorCode, number> = {
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.INVALID_CREDENTIALS]: 401,
  [ErrorCodes.SESSION_EXPIRED]: 401,
  [ErrorCodes.MFA_REQUIRED]: 401,
  [ErrorCodes.MFA_INVALID]: 401,
  [ErrorCodes.ACCOUNT_LOCKED]: 403,
  [ErrorCodes.ACCOUNT_DEACTIVATED]: 403,
  [ErrorCodes.PASSWORD_EXPIRED]: 403,

  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCodes.CROSS_ORG_ACCESS_DENIED]: 403,
  [ErrorCodes.APPROVAL_REQUIRED]: 403,
  [ErrorCodes.FROZEN_CONVERSATION]: 403,

  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.INVALID_INPUT]: 400,
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 400,
  [ErrorCodes.INVALID_FORMAT]: 400,

  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.ALREADY_EXISTS]: 409,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.GONE]: 410,

  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.TOO_MANY_REQUESTS]: 429,

  [ErrorCodes.FILE_TOO_LARGE]: 413,
  [ErrorCodes.STORAGE_LIMIT_EXCEEDED]: 507,
  [ErrorCodes.INVALID_FILE_TYPE]: 415,
  [ErrorCodes.UPLOAD_FAILED]: 500,

  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.EXTERNAL_SERVICE_ERROR]: 502,
};
