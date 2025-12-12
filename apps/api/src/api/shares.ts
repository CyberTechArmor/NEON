/**
 * File Sharing Routes
 *
 * Handles internal and external file sharing with access control.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import argon2 from 'argon2';
import { prisma } from '@neon/database';
import { NotFoundError, ForbiddenError } from '@neon/shared';
import { authenticate, optionalAuth } from '../middleware/auth';
import { getSignedUrlForOrg, getSignedUrl } from '../services/s3';
import { z } from 'zod';

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const createShareSchema = z.object({
  password: z.string().min(4).optional(),
  expiresAt: z.string().datetime().optional(),
  maxOpens: z.number().int().min(1).optional(),
  label: z.string().max(255).optional(),
});

const updateShareSchema = z.object({
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxOpens: z.number().int().min(1).nullable().optional(),
  label: z.string().max(255).nullable().optional(),
});

const verifyPasswordSchema = z.object({
  password: z.string(),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a secure random share token
 */
function generateShareToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a password for share protection
 */
async function hashSharePassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a share password using constant-time comparison
 */
async function verifySharePassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Check if a share is valid for access
 */
function isShareValid(share: {
  isActive: boolean;
  expiresAt: Date | null;
  maxOpens: number | null;
  openCount: number;
}): { valid: boolean; reason?: string } {
  if (!share.isActive) {
    return { valid: false, reason: 'Share has been disabled' };
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return { valid: false, reason: 'Share has expired' };
  }

  if (share.maxOpens !== null && share.openCount >= share.maxOpens) {
    return { valid: false, reason: 'Share has reached maximum opens' };
  }

  return { valid: true };
}

// =============================================================================
// Internal File Access (Authenticated)
// =============================================================================

/**
 * GET /files/:fileId/url
 * Get a fresh presigned URL for a file (internal, authenticated)
 */
router.get('/files/:fileId/url', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fileId } = req.params;

    // Find the file and verify access
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        orgId: req.orgId!,
        deletedAt: null,
      },
    });

    if (!file) {
      throw new NotFoundError('File', fileId);
    }

    // Generate fresh presigned URL
    let url: string;
    try {
      url = await getSignedUrlForOrg(req.orgId!, file.key);
    } catch {
      url = await getSignedUrl(file.bucket, file.key);
    }

    res.json({
      success: true,
      data: {
        url,
        expiresIn: 3600, // 1 hour
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// Share Management (Authenticated)
// =============================================================================

/**
 * POST /files/:fileId/shares
 * Create a new share for a file
 */
router.post('/files/:fileId/shares', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fileId } = req.params;
    const data = createShareSchema.parse(req.body);

    // Find the file and verify ownership/access
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        orgId: req.orgId!,
        deletedAt: null,
      },
    });

    if (!file) {
      throw new NotFoundError('File', fileId);
    }

    // Only file owner or admins can create shares
    if (file.uploadedBy !== req.userId && !req.user?.permissions.includes('files:share_any')) {
      throw new ForbiddenError('Only file owner can create shares');
    }

    // Generate secure token
    const token = generateShareToken();

    // Hash password if provided
    const passwordHash = data.password ? await hashSharePassword(data.password) : null;

    // Create the share
    const share = await prisma.fileShare.create({
      data: {
        fileId: fileId!,
        createdById: req.userId!,
        token,
        passwordHash,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        maxOpens: data.maxOpens ?? null,
        label: data.label ?? null,
      },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        maxOpens: true,
        openCount: true,
        isActive: true,
        label: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...share,
        hasPassword: !!passwordHash,
        shareUrl: `/s/${share.token}`,
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /files/:fileId/shares
 * List all shares for a file
 */
router.get('/files/:fileId/shares', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fileId } = req.params;

    // Find the file and verify access
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        orgId: req.orgId!,
        deletedAt: null,
      },
    });

    if (!file) {
      throw new NotFoundError('File', fileId);
    }

    // Only file owner or admins can view shares
    if (file.uploadedBy !== req.userId && !req.user?.permissions.includes('files:share_any')) {
      throw new ForbiddenError('Only file owner can view shares');
    }

    const shares = await prisma.fileShare.findMany({
      where: { fileId },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        maxOpens: true,
        openCount: true,
        isActive: true,
        label: true,
        createdAt: true,
        passwordHash: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: shares.map((share) => ({
        ...share,
        hasPassword: !!share.passwordHash,
        passwordHash: undefined, // Don't expose hash
        shareUrl: `/s/${share.token}`,
      })),
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /shares/:shareId
 * Update a share
 */
router.patch('/shares/:shareId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;
    const data = updateShareSchema.parse(req.body);

    // Find the share with file info
    const share = await prisma.fileShare.findUnique({
      where: { id: shareId },
      include: {
        file: {
          select: { uploadedBy: true, orgId: true },
        },
      },
    });

    if (!share) {
      throw new NotFoundError('Share', shareId);
    }

    // Verify ownership/access
    if (share.file.orgId !== req.orgId) {
      throw new NotFoundError('Share', shareId);
    }

    if (share.createdById !== req.userId && !req.user?.permissions.includes('files:share_any')) {
      throw new ForbiddenError('Only share creator can modify');
    }

    // Update the share
    const updated = await prisma.fileShare.update({
      where: { id: shareId },
      data: {
        isActive: data.isActive,
        expiresAt: data.expiresAt === null ? null : data.expiresAt ? new Date(data.expiresAt) : undefined,
        maxOpens: data.maxOpens,
        label: data.label,
      },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        maxOpens: true,
        openCount: true,
        isActive: true,
        label: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        ...updated,
        shareUrl: `/s/${updated.token}`,
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /shares/:shareId
 * Delete a share
 */
router.delete('/shares/:shareId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;

    // Find the share with file info
    const share = await prisma.fileShare.findUnique({
      where: { id: shareId },
      include: {
        file: {
          select: { uploadedBy: true, orgId: true },
        },
      },
    });

    if (!share) {
      throw new NotFoundError('Share', shareId);
    }

    // Verify ownership/access
    if (share.file.orgId !== req.orgId) {
      throw new NotFoundError('Share', shareId);
    }

    if (share.createdById !== req.userId && !req.user?.permissions.includes('files:share_any')) {
      throw new ForbiddenError('Only share creator can delete');
    }

    // Delete the share (cascades to access logs)
    await prisma.fileShare.delete({
      where: { id: shareId },
    });

    res.json({
      success: true,
      data: { message: 'Share deleted' },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /shares/:shareId/analytics
 * Get access analytics for a share
 */
router.get('/shares/:shareId/analytics', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;

    // Find the share with file info
    const share = await prisma.fileShare.findUnique({
      where: { id: shareId },
      include: {
        file: {
          select: { uploadedBy: true, orgId: true, name: true },
        },
        accessLogs: {
          orderBy: { accessedAt: 'desc' },
          take: 100, // Limit to last 100 entries
        },
      },
    });

    if (!share) {
      throw new NotFoundError('Share', shareId);
    }

    // Verify ownership/access
    if (share.file.orgId !== req.orgId) {
      throw new NotFoundError('Share', shareId);
    }

    if (share.createdById !== req.userId && !req.user?.permissions.includes('files:share_any')) {
      throw new ForbiddenError('Only share creator can view analytics');
    }

    // Aggregate stats
    const stats = {
      totalViews: share.accessLogs.filter((l) => l.actionType === 'view').length,
      totalDownloads: share.accessLogs.filter((l) => l.actionType === 'download').length,
      failedAttempts: share.accessLogs.filter((l) => l.actionType === 'password_fail').length,
      uniqueCountries: [...new Set(share.accessLogs.map((l) => l.geoCountry).filter(Boolean))].length,
    };

    res.json({
      success: true,
      data: {
        share: {
          id: share.id,
          label: share.label,
          fileName: share.file.name,
          openCount: share.openCount,
          maxOpens: share.maxOpens,
          isActive: share.isActive,
          expiresAt: share.expiresAt,
          createdAt: share.createdAt,
        },
        stats,
        recentAccess: share.accessLogs.slice(0, 20),
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// External Share Access (Public)
// =============================================================================

/**
 * GET /s/:token
 * Access a shared file (public, no auth required)
 */
router.get('/s/:token', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const providedPassword = req.headers['x-share-password'] as string | undefined;

    // Find the share with file info
    const share = await prisma.fileShare.findUnique({
      where: { token },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            bucket: true,
            key: true,
            orgId: true,
          },
        },
      },
    });

    if (!share) {
      return res.status(404).json({
        success: false,
        error: { code: 'SHARE_NOT_FOUND', message: 'Share link not found or expired' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Check if share is valid
    const validity = isShareValid(share);
    if (!validity.valid) {
      // Log failed access attempt
      await prisma.shareAccessLog.create({
        data: {
          shareId: share.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          actionType: 'view',
        },
      });

      return res.status(410).json({
        success: false,
        error: { code: 'SHARE_EXPIRED', message: validity.reason },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Check password if required
    if (share.passwordHash) {
      if (!providedPassword) {
        return res.status(401).json({
          success: false,
          error: { code: 'PASSWORD_REQUIRED', message: 'This share requires a password' },
          data: {
            fileName: share.file.name,
            fileSize: Number(share.file.size),
            mimeType: share.file.mimeType,
            requiresPassword: true,
          },
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
      }

      const passwordValid = await verifySharePassword(providedPassword, share.passwordHash);
      if (!passwordValid) {
        // Log failed password attempt
        await prisma.shareAccessLog.create({
          data: {
            shareId: share.id,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            actionType: 'password_fail',
          },
        });

        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Incorrect password' },
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
      }
    }

    // Atomically increment open count and get updated share
    const updatedShare = await prisma.fileShare.update({
      where: { id: share.id },
      data: { openCount: { increment: 1 } },
    });

    // Check if this was the last allowed open
    if (updatedShare.maxOpens !== null && updatedShare.openCount > updatedShare.maxOpens) {
      // Rollback the increment (race condition protection)
      await prisma.fileShare.update({
        where: { id: share.id },
        data: { openCount: { decrement: 1 } },
      });

      return res.status(410).json({
        success: false,
        error: { code: 'SHARE_EXHAUSTED', message: 'Share has reached maximum opens' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Log successful access
    await prisma.shareAccessLog.create({
      data: {
        shareId: share.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        actionType: 'view',
      },
    });

    // Generate presigned URL
    let url: string;
    try {
      url = await getSignedUrlForOrg(share.file.orgId, share.file.key);
    } catch {
      url = await getSignedUrl(share.file.bucket, share.file.key);
    }

    return res.json({
      success: true,
      data: {
        url,
        fileName: share.file.name,
        fileSize: Number(share.file.size),
        mimeType: share.file.mimeType,
        expiresIn: 300, // 5 minutes (short for external shares)
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /s/:token/verify-password
 * Verify password for a protected share (rate limited)
 */
router.post('/s/:token/verify-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const { password } = verifyPasswordSchema.parse(req.body);

    // Find the share
    const share = await prisma.fileShare.findUnique({
      where: { token },
      include: {
        file: {
          select: { name: true, mimeType: true, size: true },
        },
      },
    });

    if (!share || !share.passwordHash) {
      return res.status(404).json({
        success: false,
        error: { code: 'SHARE_NOT_FOUND', message: 'Share not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Verify password
    const valid = await verifySharePassword(password, share.passwordHash);

    if (!valid) {
      // Log failed attempt
      await prisma.shareAccessLog.create({
        data: {
          shareId: share.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          actionType: 'password_fail',
        },
      });

      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Incorrect password' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    return res.json({
      success: true,
      data: {
        valid: true,
        fileName: share.file.name,
        fileSize: Number(share.file.size),
        mimeType: share.file.mimeType,
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return next(error);
  }
});

export { router as sharesRouter };
