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
import { hashPassword, resolveAvatarUrl } from '../services/auth';

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

    // Resolve avatar URLs to fresh presigned URLs
    const usersWithResolvedAvatars = await Promise.all(
      users.map(async (user) => ({
        ...user,
        avatarUrl: await resolveAvatarUrl(user.avatarUrl, req.orgId!),
      }))
    );

    res.json({
      success: true,
      data: usersWithResolvedAvatars,
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

    // Resolve avatar URL to fresh presigned URL
    const resolvedAvatarUrl = await resolveAvatarUrl(user.avatarUrl, req.orgId!);

    res.json({
      success: true,
      data: { ...user, avatarUrl: resolvedAvatarUrl },
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
 * Update user (supports 'me' alias for own profile)
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Handle 'me' alias for own profile
    const targetUserId = req.params.id === 'me' ? req.userId! : req.params.id;
    const isOwnProfile = targetUserId === req.userId;
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
      where: { id: targetUserId },
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

    // Resolve avatar URL to fresh presigned URL
    const resolvedAvatarUrl = await resolveAvatarUrl(user.avatarUrl, req.orgId!);

    res.json({
      success: true,
      data: { ...user, avatarUrl: resolvedAvatarUrl },
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

export { router as usersRouter };
