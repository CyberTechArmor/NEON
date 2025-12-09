/**
 * API Key Authentication Middleware
 *
 * Authenticates requests using API keys for external integrations.
 * API keys are tied to organizations and have configurable permissions.
 *
 * Usage:
 * - Header: X-API-Key: your_api_key
 * - Query: ?apiKey=your_api_key
 *
 * API keys support:
 * - Organization scoping (can only access resources within their org)
 * - Permission-based access control
 * - Rate limiting (configurable per key)
 * - Audit logging
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import crypto from 'crypto';

export interface ApiKeyData {
  id: string;
  orgId: string;
  name: string;
  permissions: string[];
  rateLimit?: number;
}

export interface ApiKeyRequest extends Request {
  apiKey?: ApiKeyData;
}

/**
 * Authenticate request using API key
 * Falls back to JWT authentication if no API key is provided
 */
export async function authenticateApiKey(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Get API key from header or query
  const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string;

  if (!apiKey) {
    // No API key provided - check for JWT authentication
    if (req.headers.authorization?.startsWith('Bearer ')) {
      // JWT is present, defer to regular auth middleware
      return next();
    }

    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key or authentication token required',
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    // Hash the API key for lookup (we store hashed keys)
    const hashedKey = hashApiKey(apiKey);

    // Look up the API key
    const keyRecord = await prisma.apiKey.findUnique({
      where: { keyHash: hashedKey },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    if (!keyRecord) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key',
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if key has been revoked
    if (keyRecord.revokedAt) {
      res.status(401).json({
        success: false,
        error: {
          code: 'API_KEY_REVOKED',
          message: 'API key has been revoked',
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check if key has expired
    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      res.status(401).json({
        success: false,
        error: {
          code: 'API_KEY_EXPIRED',
          message: 'API key has expired',
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    // Attach API key data to request
    req.apiKey = {
      id: keyRecord.id,
      orgId: keyRecord.orgId,
      name: keyRecord.name,
      permissions: keyRecord.scopes as string[],
      rateLimit: keyRecord.rateLimit ?? undefined,
    };

    // Set org context for consistency with JWT auth
    req.orgId = keyRecord.orgId;

    next();
  } catch (error) {
    console.error('[ApiKey] Authentication error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Require specific permissions for API key access
 */
export function requireApiKeyPermission(...permissions: string[]) {
  return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      // No API key, might be using JWT auth
      next();
      return;
    }

    const hasPermission = permissions.some(p => req.apiKey!.permissions.includes(p));
    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `API key does not have required permission: ${permissions.join(' or ')}`,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
}

/**
 * Hash an API key for storage/lookup
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key
 * Returns both the raw key (to give to user once) and the hash (to store)
 */
export function generateApiKey(): { key: string; hash: string } {
  // Generate a random 32-byte key, encode as base64url
  const randomBytes = crypto.randomBytes(32);
  const key = `neon_${randomBytes.toString('base64url')}`;
  const hash = hashApiKey(key);
  return { key, hash };
}
