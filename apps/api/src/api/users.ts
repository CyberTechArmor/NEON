/**
 * User Routes
 *
 * User CRUD, profile management, and directory
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma, notDeleted } from '@neon/database';
import { createUserSchema, updateUserSchema, updatePresenceSchema, paginationSchema } from '@neon/shared';
import { NotFoundError, ForbiddenError } from '@neon/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { AuditService } from '../services/audit';
import { hashPassword } from '../services/auth';
import { getUploadSignedUrlForOrg, getSignedUrlForOrg, deleteFileForOrg, headObjectForOrg } from '../services/s3';
import { v4 as uuidv4 } from 'uuid';

// Allowed avatar MIME types
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /users
 * List users in organization (directory)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = {
      orgId: req.orgId!,
      status: { not: 'DEACTIVATED' as const },
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          displayName: true,
          username: true,
          avatarUrl: true,
          presenceStatus: true,
          presenceMessage: true,
          department: { select: { id: true, name: true } },
          role: { select: { id: true, name: true } },
        },
        orderBy: { displayName: 'asc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: users,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: skip + users.length < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /users/:id
 * Get user by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        orgId: req.orgId!,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        presenceStatus: true,
        presenceMessage: true,
        status: true,
        timezone: true,
        locale: true,
        department: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        createdAt: true,
        lastActiveAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User', req.params.id);
    }

    res.json({
      success: true,
      data: user,
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
 * POST /users
 * Create new user (admin only)
 */
router.post(
  '/',
  requirePermission('users:create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createUserSchema.parse(req.body);

      const passwordHash = data.password ? await hashPassword(data.password) : null;

      const user = await prisma.user.create({
        data: {
          orgId: req.orgId!,
          email: data.email,
          username: data.username,
          displayName: data.displayName,
          passwordHash,
          departmentId: data.departmentId,
          roleId: data.roleId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          status: true,
          departmentId: true,
          roleId: true,
        },
      });

      await AuditService.log({
        action: 'user.created',
        resourceType: 'user',
        resourceId: user.id,
        actorId: req.userId,
        orgId: req.orgId,
        details: { email: user.email },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(201).json({
        success: true,
        data: user,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /users/:id
 * Update user
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isOwnProfile = req.params.id === req.userId;
    const canEditOthers = req.user?.permissions.includes('users:edit');

    if (!isOwnProfile && !canEditOthers) {
      throw new ForbiddenError('Cannot edit other users');
    }

    const data = updateUserSchema.parse(req.body);

    // Non-admins can only update certain fields
    if (!canEditOthers) {
      delete (data as any).departmentId;
      delete (data as any).roleId;
      delete (data as any).tagIds;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...data,
        departmentId: data.departmentId,
        roleId: data.roleId,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        timezone: true,
        locale: true,
      },
    });

    await AuditService.log({
      action: 'user.updated',
      resourceType: 'user',
      resourceId: user.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { fields: Object.keys(data) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      data: user,
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
 * PATCH /users/:id/presence
 * Update presence status
 */
router.patch('/:id/presence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id !== req.userId) {
      throw new ForbiddenError('Can only update own presence');
    }

    const data = updatePresenceSchema.parse(req.body);

    await prisma.user.update({
      where: { id: req.userId! },
      data: {
        presenceStatus: data.status,
        presenceMessage: data.message,
        lastActiveAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: { status: data.status, message: data.message },
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
 * POST /users/:id/deactivate
 * Deactivate user (soft delete)
 */
router.post(
  '/:id/deactivate',
  requirePermission('users:deactivate'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.params.id === req.userId) {
        throw new ForbiddenError('Cannot deactivate yourself');
      }

      await prisma.user.update({
        where: { id: req.params.id },
        data: {
          status: 'DEACTIVATED',
          deactivatedAt: new Date(),
          deactivatedBy: req.userId,
        },
      });

      await AuditService.log({
        action: 'user.deactivated',
        resourceType: 'user',
        resourceId: req.params.id,
        actorId: req.userId,
        orgId: req.orgId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        data: { message: 'User deactivated' },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================================================
// Avatar Upload
// ==========================================================================

/**
 * POST /users/me/avatar/presign
 * Get presigned URL for avatar upload
 */
router.post('/me/avatar/presign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contentType, filename } = req.body;

    // Validate content type
    if (!contentType || !ALLOWED_AVATAR_TYPES.includes(contentType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: `Invalid file type. Allowed types: ${ALLOWED_AVATAR_TYPES.join(', ')}`,
        },
      });
    }

    // Generate unique key for avatar
    const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1];
    const avatarKey = `avatars/${req.orgId}/${req.userId}/${uuidv4()}.${ext}`;

    // Generate presigned upload URL
    const uploadUrl = await getUploadSignedUrlForOrg(req.orgId!, avatarKey, contentType, 900); // 15 min expiry

    if (!uploadUrl) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'STORAGE_UNAVAILABLE',
          message: 'File storage is temporarily unavailable',
        },
      });
    }

    return res.json({
      success: true,
      data: {
        uploadUrl,
        key: avatarKey,
        expiresIn: 900,
        maxSize: MAX_AVATAR_SIZE,
        allowedTypes: ALLOWED_AVATAR_TYPES,
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
 * POST /users/me/avatar/confirm
 * Confirm avatar upload and update user profile
 */
router.post('/me/avatar/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_KEY',
          message: 'Avatar key is required',
        },
      });
    }

    // Validate the key belongs to this user's avatar path
    const expectedPrefix = `avatars/${req.orgId}/${req.userId}/`;
    if (!key.startsWith(expectedPrefix)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INVALID_KEY',
          message: 'Invalid avatar key',
        },
      });
    }

    // Verify the file exists in S3
    const headResult = await headObjectForOrg(req.orgId!, key);
    if (!headResult) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'Avatar file not found in storage',
        },
      });
    }

    // Validate MIME type from S3 metadata
    const contentType = headResult.ContentType || '';
    if (!ALLOWED_AVATAR_TYPES.includes(contentType)) {
      // Delete the invalid file
      await deleteFileForOrg(req.orgId!, key);
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Invalid file type uploaded',
        },
      });
    }

    // Check file size
    const fileSize = headResult.ContentLength || 0;
    if (fileSize > MAX_AVATAR_SIZE) {
      // Delete the oversized file
      await deleteFileForOrg(req.orgId!, key);
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `File size exceeds maximum of ${MAX_AVATAR_SIZE / 1024 / 1024}MB`,
        },
      });
    }

    // Get old avatar key to delete later
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { avatarUrl: true },
    });

    // Update user with new avatar key (store key, not URL)
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        avatarUrl: key, // Store the key, generate signed URLs on demand
      },
      select: {
        id: true,
        avatarUrl: true,
      },
    });

    // Delete old avatar if it exists and is different
    if (currentUser?.avatarUrl && currentUser.avatarUrl !== key && currentUser.avatarUrl.startsWith('avatars/')) {
      try {
        await deleteFileForOrg(req.orgId!, currentUser.avatarUrl);
      } catch (e) {
        // Ignore errors deleting old avatar
        console.warn('[Avatar] Failed to delete old avatar:', e);
      }
    }

    // Generate signed URL for immediate display
    const signedUrl = await getSignedUrlForOrg(req.orgId!, key, 3600);

    await AuditService.log({
      action: 'user.avatar_updated',
      resourceType: 'user',
      resourceId: req.userId!,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: {
        avatarUrl: signedUrl,
        avatarKey: key,
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
 * DELETE /users/me/avatar
 * Remove user avatar
 */
router.delete('/me/avatar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { avatarUrl: true },
    });

    if (user?.avatarUrl && user.avatarUrl.startsWith('avatars/')) {
      try {
        await deleteFileForOrg(req.orgId!, user.avatarUrl);
      } catch (e) {
        // Ignore errors deleting avatar
        console.warn('[Avatar] Failed to delete avatar:', e);
      }
    }

    await prisma.user.update({
      where: { id: req.userId! },
      data: { avatarUrl: null },
    });

    await AuditService.log({
      action: 'user.avatar_removed',
      resourceType: 'user',
      resourceId: req.userId!,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: 'Avatar removed' },
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
 * GET /users/me/avatar-url
 * Get fresh signed URL for current user's avatar
 */
router.get('/me/avatar-url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { avatarUrl: true },
    });

    if (!user?.avatarUrl) {
      return res.json({
        success: true,
        data: { avatarUrl: null },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // If it's a key (stored locally), generate signed URL
    if (user.avatarUrl.startsWith('avatars/')) {
      const signedUrl = await getSignedUrlForOrg(req.orgId!, user.avatarUrl, 3600);
      return res.json({
        success: true,
        data: {
          avatarUrl: signedUrl,
          expiresIn: 3600,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // If it's already a URL (legacy), return as-is
    return res.json({
      success: true,
      data: { avatarUrl: user.avatarUrl },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as usersRouter };
