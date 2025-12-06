/**
 * Database Utilities
 *
 * Helper functions for database operations, transactions, and common patterns.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './client';
import type { PaginationParams, PaginatedResult, CursorPaginatedResult } from './types';

// =============================================================================
// Transaction Helpers
// =============================================================================

/**
 * Execute operations in a transaction with automatic retry on deadlock
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxRetries?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  const { maxRetries = 3, timeout = 10000, isolationLevel } = options ?? {};

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        timeout,
        isolationLevel,
      });
    } catch (error) {
      lastError = error as Error;

      // Check if it's a retryable error (deadlock, serialization failure)
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const retryableCodes = ['P2034']; // Transaction failed due to concurrent edit
        if (retryableCodes.includes(error.code) && attempt < maxRetries) {
          // Exponential backoff
          await sleep(Math.pow(2, attempt) * 100);
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError;
}

// =============================================================================
// Pagination Helpers
// =============================================================================

/**
 * Apply pagination to a query and return paginated result
 */
export function applyPagination(
  params: PaginationParams
): { skip: number; take: number } {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));

  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

/**
 * Create paginated result from data and count
 */
export function createPaginatedResult<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Create cursor-paginated result
 */
export function createCursorPaginatedResult<T extends { id: string }>(
  data: T[],
  limit: number
): CursorPaginatedResult<T> {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, -1) : data;
  const cursor = items.length > 0 ? items[items.length - 1]?.id ?? null : null;

  return {
    data: items,
    pagination: {
      cursor,
      hasMore,
    },
  };
}

// =============================================================================
// Soft Delete Helpers
// =============================================================================

/**
 * Soft delete filter - excludes soft-deleted records
 */
export const notDeleted = {
  deletedAt: null,
} as const;

/**
 * Include soft-deleted records filter
 */
export const includeDeleted = {} as const;

/**
 * Only soft-deleted records filter
 */
export const onlyDeleted = {
  deletedAt: { not: null },
} as const;

// =============================================================================
// Search Helpers
// =============================================================================

/**
 * Create full-text search filter for PostgreSQL
 */
export function createSearchFilter(
  query: string,
  fields: string[]
): Prisma.Sql {
  const sanitizedQuery = query
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((word) => word.length > 0)
    .join(' & ');

  if (!sanitizedQuery) {
    return Prisma.sql`TRUE`;
  }

  // Build search vector from fields
  const searchVector = fields
    .map((field) => `coalesce(${field}, '')`)
    .join(" || ' ' || ");

  return Prisma.sql`to_tsvector('english', ${Prisma.raw(searchVector)}) @@ to_tsquery('english', ${sanitizedQuery})`;
}

/**
 * Create ILIKE search filter for simple text matching
 */
export function createILikeFilter(
  query: string,
  field: string
): Record<string, { contains: string; mode: 'insensitive' }> {
  return {
    [field]: {
      contains: query.trim(),
      mode: 'insensitive' as const,
    },
  };
}

// =============================================================================
// Date Helpers
// =============================================================================

/**
 * Get date range filter
 */
export function dateRangeFilter(
  field: string,
  start?: Date,
  end?: Date
): Record<string, { gte?: Date; lte?: Date }> | undefined {
  if (!start && !end) return undefined;

  const filter: { gte?: Date; lte?: Date } = {};
  if (start) filter.gte = start;
  if (end) filter.lte = end;

  return { [field]: filter };
}

// =============================================================================
// UUID Helpers
// =============================================================================

/**
 * Validate UUID format
 */
export function isValidUuid(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Parse UUID or return null
 */
export function parseUuid(value: string | undefined | null): string | null {
  if (!value) return null;
  return isValidUuid(value) ? value : null;
}

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Check if error is a unique constraint violation
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Check if error is a foreign key constraint violation
 */
export function isForeignKeyError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
}

/**
 * Check if error is a record not found error
 */
export function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

/**
 * Get constraint name from unique constraint error
 */
export function getConstraintName(error: unknown): string | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const meta = error.meta as { target?: string[] };
    return meta?.target?.join('_') ?? null;
  }
  return null;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Execute operations in batches
 */
export async function batchOperation<T, R>(
  items: T[],
  operation: (batch: T[]) => Promise<R[]>,
  batchSize = 100
): Promise<R[]> {
  const batches = chunk(items, batchSize);
  const results: R[] = [];

  for (const batch of batches) {
    const batchResults = await operation(batch);
    results.push(...batchResults);
  }

  return results;
}
