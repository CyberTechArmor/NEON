/**
 * Admin Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma, checkDatabaseHealth } from '@neon/database';
import { paginationSchema, createUserSchema, createRoleSchema, createDepartmentSchema } from '@neon/shared';
import { NotFoundError, DEFAULT_FEATURES, type FeatureKey, type FeatureState, type OrganizationFeatures } from '@neon/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { AuditService } from '../services/audit';
import { checkRedisHealth } from '../services/redis';
import { getJobStatus, triggerJob } from '../jobs';
import { hashPassword, generateSecureToken } from '../services/auth';
import { S3Client, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { clearOrgS3Cache, getOrgS3Config } from '../services/s3';
import { getConfig } from '@neon/config';

const config = getConfig();

const router = Router();
router.use(authenticate);

/**
 * Check S3 storage health
 */
async function checkStorageHealth(orgId: string): Promise<{ healthy: boolean; message: string; provider?: string }> {
  try {
    // First try org-specific storage
    const orgConfig = await getOrgS3Config(orgId);

    if (orgConfig && orgConfig.enabled) {
      const testClient = new S3Client({
        endpoint: orgConfig.endpoint,
        region: orgConfig.region,
        credentials: {
          accessKeyId: orgConfig.accessKeyId,
          secretAccessKey: orgConfig.secretAccessKey,
        },
        forcePathStyle: orgConfig.forcePathStyle,
      });

      try {
        await testClient.send(new HeadBucketCommand({ Bucket: orgConfig.bucket }));
        return {
          healthy: true,
          message: 'Organization storage connected',
          provider: orgConfig.provider || 'custom',
        };
      } catch (s3Error: any) {
        return {
          healthy: false,
          message: `Organization storage error: ${s3Error.message || 'Connection failed'}`,
          provider: orgConfig.provider || 'custom',
        };
      }
    }

    // Fall back to default storage config
    if (config.s3.endpoint && config.s3.accessKey && config.s3.secretKey) {
      const defaultClient = new S3Client({
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        credentials: {
          accessKeyId: config.s3.accessKey,
          secretAccessKey: config.s3.secretKey,
        },
        forcePathStyle: config.s3.forcePathStyle,
      });

      try {
        await defaultClient.send(new HeadBucketCommand({ Bucket: config.s3.bucketMedia }));
        return {
          healthy: true,
          message: 'Default storage connected',
          provider: 'default',
        };
      } catch (s3Error: any) {
        return {
          healthy: false,
          message: `Default storage error: ${s3Error.message || 'Connection failed'}`,
          provider: 'default',
        };
      }
    }

    return {
      healthy: false,
      message: 'No storage configured',
    };
  } catch (error: any) {
    return {
      healthy: false,
      message: `Storage check failed: ${error.message}`,
    };
  }
}

/**
 * Check LiveKit health (placeholder - implement based on your LiveKit setup)
 */
async function checkLiveKitHealth(): Promise<{ healthy: boolean; message: string }> {
  try {
    // Check if LiveKit is configured
    if (!config.livekit?.apiUrl || !config.livekit?.apiKey) {
      return {
        healthy: false,
        message: 'LiveKit not configured',
      };
    }

    // Simple connectivity check - ping the LiveKit server
    const response = await fetch(`${config.livekit.apiUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (response && response.ok) {
      return {
        healthy: true,
        message: 'LiveKit server connected',
      };
    }

    return {
      healthy: false,
      message: 'LiveKit server not reachable',
    };
  } catch (error: any) {
    return {
      healthy: false,
      message: `LiveKit check failed: ${error.message}`,
    };
  }
}

/**
 * GET /admin/health
 */
router.get('/health', requirePermission('org:view_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [dbHealth, redisHealth, storageHealth, livekitHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkStorageHealth(req.orgId!),
      checkLiveKitHealth(),
    ]);

    const allHealthy = dbHealth.healthy && redisHealth.healthy && storageHealth.healthy && livekitHealth.healthy;
    const coreHealthy = dbHealth.healthy && redisHealth.healthy;

    res.json({
      success: true,
      data: {
        status: allHealthy ? 'healthy' : (coreHealthy ? 'degraded' : 'unhealthy'),
        database: dbHealth,
        redis: redisHealth,
        storage: storageHealth,
        livekit: livekitHealth,
        jobs: getJobStatus(),
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/audit
 */
router.get('/audit', requirePermission('audit:view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const { action, resourceType, startDate, endDate } = req.query;

    const result = await AuditService.query({
      orgId: req.orgId,
      action: action as string,
      resourceType: resourceType as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit,
      offset: (page - 1) * limit,
    });

    res.json({
      success: true,
      data: result.entries,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit), hasNext: page * limit < result.total, hasPrev: page > 1 },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/audit/export
 */
router.post('/audit/export', requirePermission('audit:export'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, format = 'json' } = req.body;

    const data = await AuditService.export({
      orgId: req.orgId!,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      format,
    });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=audit-log.${format}`);
    res.send(data);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/audit/verify
 */
router.post('/audit/verify', requirePermission('audit:view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuditService.verifyIntegrity();

    res.json({
      success: true,
      data: result,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/stats
 */
router.get('/stats', requirePermission('org:view_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [users, messages, meetings, storageData, activeToday] = await Promise.all([
      prisma.user.count({ where: { orgId: req.orgId!, status: 'ACTIVE' } }),
      prisma.message.count({ where: { conversation: { orgId: req.orgId! } } }),
      prisma.meeting.count({ where: { orgId: req.orgId! } }),
      prisma.organization.findUnique({ where: { id: req.orgId! }, select: { storageUsed: true, storageLimit: true } }),
      prisma.user.count({ where: { orgId: req.orgId!, lastActiveAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);

    // Convert BigInt to Number for JSON serialization
    const storage = storageData ? {
      storageUsed: Number(storageData.storageUsed),
      storageLimit: storageData.storageLimit ? Number(storageData.storageLimit) : null,
    } : null;

    res.json({
      success: true,
      data: { users, messages, meetings, storage, activeToday },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/jobs/:name/trigger
 */
router.post('/jobs/:name/trigger', requirePermission('super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await triggerJob(req.params.name!);

    res.json({
      success: true,
      data: { triggered: success },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// User Management Routes
// ============================================================================

/**
 * GET /admin/users
 * List users with filtering
 */
router.get('/users', requirePermission('users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const { search, roleId, departmentId, status } = req.query;
    const skip = (page - 1) * limit;

    const where: any = { orgId: req.orgId! };

    if (search) {
      where.OR = [
        { displayName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { username: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (roleId) where.roleId = roleId;
    if (departmentId) where.departmentId = departmentId;
    if (status) where.status = status;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          status: true,
          presenceStatus: true,
          mfaEnabled: true,
          department: { select: { id: true, name: true } },
          role: { select: { id: true, name: true } },
          createdAt: true,
          lastActiveAt: true,
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
 * GET /admin/users/:id
 * Get user by ID
 */
router.get('/users/:id', requirePermission('users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        presenceStatus: true,
        presenceMessage: true,
        timezone: true,
        locale: true,
        mfaEnabled: true,
        department: { select: { id: true, name: true } },
        role: { select: { id: true, name: true, permissions: true } },
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
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/users
 * Create new user
 */
router.post('/users', requirePermission('users:manage'), async (req: Request, res: Response, next: NextFunction) => {
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
        department: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
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
    });

    res.status(201).json({
      success: true,
      data: user,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /admin/users/:id
 * Update user
 */
router.patch('/users/:id', requirePermission('users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, displayName, roleId, departmentId, isActive, status } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.displayName = name;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (email !== undefined) updateData.email = email;
    if (roleId !== undefined) updateData.roleId = roleId;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (isActive !== undefined) updateData.status = isActive ? 'ACTIVE' : 'DEACTIVATED';
    if (status !== undefined) updateData.status = status;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        status: true,
        department: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
      },
    });

    await AuditService.log({
      action: 'user.updated',
      resourceType: 'user',
      resourceId: user.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { fields: Object.keys(updateData) },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: user,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /admin/users/:id
 * Delete user (deactivate)
 */
router.delete('/users/:id', requirePermission('users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if the user being deleted has super_admin permission
    const userToDelete = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: { select: { permissions: true, name: true } } },
    });

    if (!userToDelete) {
      throw new NotFoundError('User', req.params.id);
    }

    // Prevent deletion of super admin users
    if (userToDelete.role?.permissions?.includes('super_admin') ||
        userToDelete.role?.name?.toLowerCase() === 'super admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CANNOT_DELETE_SUPER_ADMIN',
          message: 'Super Admin users cannot be deleted',
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
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
      action: 'user.deleted',
      resourceType: 'user',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: { message: 'User deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /admin/users/:id/reset-password
 * Reset user password
 */
router.post('/users/:id/reset-password', requirePermission('users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const temporaryPassword = generateSecureToken(16);
    const passwordHash = await hashPassword(temporaryPassword);

    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash },
    });

    await AuditService.log({
      action: 'user.password_reset',
      resourceType: 'user',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { temporaryPassword },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/users/:id/disable-mfa
 * Disable MFA for user
 */
router.post('/users/:id/disable-mfa', requirePermission('users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
      },
    });

    await AuditService.log({
      action: 'user.mfa_disabled',
      resourceType: 'user',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: 'MFA disabled' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/users/:id/permissions
 * Get user-specific permissions
 */
router.get('/users/:id/permissions', requirePermission('users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
      select: { settings: true },
    });

    if (!user) {
      throw new NotFoundError('User', req.params.id);
    }

    // User-specific permissions are stored in settings.permissions array
    const settings = user.settings as Record<string, any> || {};
    const permissions = settings.permissions || [];

    res.json({
      success: true,
      data: permissions,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /admin/users/:id/permissions
 * Set user-specific permissions
 */
router.put('/users/:id/permissions', requirePermission('users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { permissions } = req.body;

    // Get existing user
    const existingUser = await prisma.user.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
      select: { settings: true },
    });

    if (!existingUser) {
      throw new NotFoundError('User', req.params.id);
    }

    // Convert from array of {permission, granted} to array of permission strings
    const permissionStrings = Array.isArray(permissions)
      ? permissions.filter((p: any) => p.granted).map((p: any) => p.permission)
      : [];

    // Merge with existing settings
    const existingSettings = existingUser.settings as Record<string, any> || {};
    const updatedSettings = {
      ...existingSettings,
      permissions: permissionStrings,
    };

    await prisma.user.update({
      where: { id: req.params.id },
      data: { settings: updatedSettings },
    });

    await AuditService.log({
      action: 'user.permissions_updated',
      resourceType: 'user',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { permissions: permissionStrings },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: permissionStrings,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Role Management Routes
// ============================================================================

/**
 * GET /admin/roles
 * List roles - accessible by users with roles:manage OR users:manage permission
 */
router.get('/roles', requirePermission('roles:manage', 'users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [roles, total] = await Promise.all([
      prisma.role.findMany({
        where: { orgId: req.orgId! },
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { users: true } },
        },
        orderBy: [{ department: { rank: 'desc' } }, { rank: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.role.count({ where: { orgId: req.orgId! } }),
    ]);

    res.json({
      success: true,
      data: roles,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: skip + roles.length < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/roles/:id
 * Get role by ID
 */
router.get('/roles/:id', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = await prisma.role.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      throw new NotFoundError('Role', req.params.id);
    }

    res.json({
      success: true,
      data: role,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/roles
 * Create new role
 */
router.post('/roles', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createRoleSchema.parse(req.body);

    const role = await prisma.role.create({
      data: { ...data, orgId: req.orgId! },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    await AuditService.log({
      action: 'role.created',
      resourceType: 'role',
      resourceId: role.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: role,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /admin/roles/:id
 * Update role
 */
router.patch('/roles/:id', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, permissions, rank, departmentId } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (rank !== undefined) updateData.rank = rank;
    if (departmentId !== undefined) updateData.departmentId = departmentId;

    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    await AuditService.log({
      action: 'role.updated',
      resourceType: 'role',
      resourceId: role.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { fields: Object.keys(updateData) },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: role,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /admin/roles/:id
 * Delete role
 */
router.delete('/roles/:id', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if this is the Super Admin role
    const roleToDelete = await prisma.role.findUnique({
      where: { id: req.params.id },
      select: { name: true, permissions: true },
    });

    if (!roleToDelete) {
      throw new NotFoundError('Role', req.params.id);
    }

    // Prevent deletion of Super Admin role
    if (roleToDelete.permissions?.includes('super_admin') ||
        roleToDelete.name?.toLowerCase() === 'super admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CANNOT_DELETE_SUPER_ADMIN_ROLE',
          message: 'Super Admin role cannot be deleted',
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    await prisma.role.delete({ where: { id: req.params.id } });

    await AuditService.log({
      action: 'role.deleted',
      resourceType: 'role',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: { message: 'Role deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /admin/roles/:id/permissions
 * Get role permissions
 */
router.get('/roles/:id/permissions', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = await prisma.role.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
      select: { permissions: true },
    });

    if (!role) {
      throw new NotFoundError('Role', req.params.id);
    }

    res.json({
      success: true,
      data: role.permissions,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /admin/roles/:id/permissions
 * Set role permissions
 */
router.put('/roles/:id/permissions', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { permissions } = req.body;

    // Convert from array of {permission, granted} to array of permission strings
    const permissionStrings = Array.isArray(permissions)
      ? permissions.filter((p: any) => p.granted).map((p: any) => p.permission)
      : [];

    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: { permissions: permissionStrings },
      select: { permissions: true },
    });

    await AuditService.log({
      action: 'role.permissions_updated',
      resourceType: 'role',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { permissions: permissionStrings },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: role.permissions,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Department Management Routes
// ============================================================================

/**
 * GET /admin/departments
 * List departments - accessible by users with departments:manage OR users:manage permission
 */
router.get('/departments', requirePermission('departments:manage', 'users:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [departments, total] = await Promise.all([
      prisma.department.findMany({
        where: { orgId: req.orgId! },
        include: {
          roles: { select: { id: true, name: true, rank: true } },
          _count: { select: { users: true } },
        },
        orderBy: { rank: 'desc' },
        skip,
        take: limit,
      }),
      prisma.department.count({ where: { orgId: req.orgId! } }),
    ]);

    res.json({
      success: true,
      data: departments,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: skip + departments.length < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/departments/:id
 * Get department by ID
 */
router.get('/departments/:id', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const department = await prisma.department.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
      include: {
        roles: { select: { id: true, name: true, rank: true, permissions: true } },
        _count: { select: { users: true } },
      },
    });

    if (!department) {
      throw new NotFoundError('Department', req.params.id);
    }

    res.json({
      success: true,
      data: department,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/departments
 * Create new department
 */
router.post('/departments', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createDepartmentSchema.parse(req.body);

    const department = await prisma.department.create({
      data: { ...data, orgId: req.orgId! },
      include: {
        roles: { select: { id: true, name: true } },
      },
    });

    await AuditService.log({
      action: 'department.created',
      resourceType: 'department',
      resourceId: department.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: department,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /admin/departments/:id
 * Update department
 */
router.patch('/departments/:id', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, rank, parentId } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (rank !== undefined) updateData.rank = rank;
    if (parentId !== undefined) updateData.parentId = parentId;

    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        roles: { select: { id: true, name: true } },
      },
    });

    await AuditService.log({
      action: 'department.updated',
      resourceType: 'department',
      resourceId: department.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { fields: Object.keys(updateData) },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: department,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /admin/departments/:id
 * Delete department
 */
router.delete('/departments/:id', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if this is the Super Admin department
    const deptToDelete = await prisma.department.findUnique({
      where: { id: req.params.id },
      select: { name: true },
    });

    if (!deptToDelete) {
      throw new NotFoundError('Department', req.params.id);
    }

    // Prevent deletion of Super Admin department
    if (deptToDelete.name?.toLowerCase() === 'super admin' ||
        deptToDelete.name?.toLowerCase() === 'superadmin' ||
        deptToDelete.name?.toLowerCase() === 'administration') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CANNOT_DELETE_SUPER_ADMIN_DEPARTMENT',
          message: 'Super Admin department cannot be deleted',
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    await prisma.department.delete({ where: { id: req.params.id } });

    await AuditService.log({
      action: 'department.deleted',
      resourceType: 'department',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: { message: 'Department deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /admin/departments/:id/permissions
 * Get department permissions
 */
router.get('/departments/:id/permissions', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const department = await prisma.department.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
      select: { settings: true },
    });

    if (!department) {
      throw new NotFoundError('Department', req.params.id);
    }

    // Department permissions are stored in settings.permissions array
    const settings = department.settings as Record<string, any> || {};
    const permissions = settings.permissions || [];

    res.json({
      success: true,
      data: permissions,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /admin/departments/:id/permissions
 * Set department permissions
 */
router.put('/departments/:id/permissions', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { permissions } = req.body;

    // Get existing department
    const existingDept = await prisma.department.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
      select: { settings: true },
    });

    if (!existingDept) {
      throw new NotFoundError('Department', req.params.id);
    }

    // Convert from array of {permission, granted} to array of permission strings
    const permissionStrings = Array.isArray(permissions)
      ? permissions.filter((p: any) => p.granted).map((p: any) => p.permission)
      : [];

    // Merge with existing settings
    const existingSettings = existingDept.settings as Record<string, any> || {};
    const updatedSettings = {
      ...existingSettings,
      permissions: permissionStrings,
    };

    await prisma.department.update({
      where: { id: req.params.id },
      data: { settings: updatedSettings },
    });

    await AuditService.log({
      action: 'department.permissions_updated',
      resourceType: 'department',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { permissions: permissionStrings },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: permissionStrings,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Organization Settings Routes
// ============================================================================

/**
 * GET /admin/organization
 * Get organization details
 */
router.get('/organization', requirePermission('org:view_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: {
        id: true,
        name: true,
        slug: true,
        complianceMode: true,
        logoUrl: true,
        primaryColor: true,
        storageLimit: true,
        storageUsed: true,
        maxFileSize: true,
        settings: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: org,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /admin/organization
 * Update organization
 */
router.patch('/organization', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, domain, logoUrl, primaryColor, settings } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (domain !== undefined) updateData.slug = domain;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
    if (settings !== undefined) updateData.settings = settings;

    const org = await prisma.organization.update({
      where: { id: req.orgId! },
      data: updateData,
    });

    await AuditService.log({
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: org.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { fields: Object.keys(updateData) },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: org,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/organization/settings
 * Get organization settings
 */
router.get('/organization/settings', requirePermission('org:view_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { settings: true },
    });

    res.json({
      success: true,
      data: org?.settings || {},
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /admin/organization/settings
 * Update organization settings
 */
router.patch('/organization/settings', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existingOrg = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { settings: true },
    });

    const mergedSettings = {
      ...(existingOrg?.settings as object || {}),
      ...req.body,
    };

    const org = await prisma.organization.update({
      where: { id: req.orgId! },
      data: { settings: mergedSettings },
      select: { settings: true },
    });

    // Clear S3 cache if storage settings were updated
    if (req.body.storage) {
      clearOrgS3Cache(req.orgId!);
    }

    await AuditService.log({
      action: 'organization.settings_updated',
      resourceType: 'organization',
      resourceId: req.orgId!,
      actorId: req.userId,
      orgId: req.orgId,
      details: { keys: Object.keys(req.body) },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: org.settings,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================================================
// Feature Toggles
// ==========================================================================

/**
 * GET /admin/features
 * Get organization feature toggles
 */
router.get('/features', requirePermission('org:view_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { settings: true },
    });

    const settings = org?.settings as { features?: Partial<OrganizationFeatures> } | null;
    const features = { ...DEFAULT_FEATURES, ...settings?.features };

    res.json({
      success: true,
      data: features,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /admin/features
 * Update organization feature toggles
 */
router.patch('/features', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = req.body as Partial<Record<FeatureKey, FeatureState>>;

    // Validate feature keys and states
    const validStates: FeatureState[] = ['enabled', 'disabled', 'coming_soon'];
    const validKeys = Object.keys(DEFAULT_FEATURES) as FeatureKey[];

    for (const [key, state] of Object.entries(updates)) {
      if (!validKeys.includes(key as FeatureKey)) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid feature key: ${key}`, code: 'INVALID_FEATURE_KEY' },
        });
      }
      if (!validStates.includes(state as FeatureState)) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid state for ${key}: ${state}`, code: 'INVALID_FEATURE_STATE' },
        });
      }
    }

    // Get existing settings
    const existingOrg = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { settings: true },
    });

    const existingSettings = existingOrg?.settings as { features?: Partial<OrganizationFeatures> } | null || {};
    const existingFeatures = existingSettings.features || {};

    // Merge features
    const mergedFeatures = { ...existingFeatures, ...updates };
    const mergedSettings = { ...existingSettings, features: mergedFeatures };

    // Update organization
    const org = await prisma.organization.update({
      where: { id: req.orgId! },
      data: { settings: mergedSettings },
      select: { settings: true },
    });

    // Audit log
    await AuditService.log({
      action: 'organization.features_updated',
      resourceType: 'organization',
      resourceId: req.orgId!,
      actorId: req.userId,
      orgId: req.orgId,
      details: { features: updates },
      ipAddress: req.ip,
    });

    // Broadcast feature toggle updates via WebSocket (import broadcastToOrg from socket)
    // This will be handled by the socket module - emit event for each changed feature
    const { broadcastToOrg } = await import('../socket');
    for (const [feature, state] of Object.entries(updates)) {
      broadcastToOrg(req.orgId!, 'feature:toggled', {
        feature,
        state,
        orgId: req.orgId,
        updatedBy: req.userId,
        updatedAt: new Date().toISOString(),
      });
    }

    const finalFeatures = { ...DEFAULT_FEATURES, ...(org.settings as any)?.features };

    res.json({
      success: true,
      data: finalFeatures,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /admin/features/:feature
 * Toggle a single feature
 */
router.patch('/features/:feature', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const featureKey = req.params.feature as FeatureKey;
    const { state } = req.body as { state: FeatureState };

    // Validate feature key
    const validKeys = Object.keys(DEFAULT_FEATURES) as FeatureKey[];
    if (!validKeys.includes(featureKey)) {
      return res.status(400).json({
        success: false,
        error: { message: `Invalid feature key: ${featureKey}`, code: 'INVALID_FEATURE_KEY' },
      });
    }

    // Validate state
    const validStates: FeatureState[] = ['enabled', 'disabled', 'coming_soon'];
    if (!validStates.includes(state)) {
      return res.status(400).json({
        success: false,
        error: { message: `Invalid state: ${state}`, code: 'INVALID_FEATURE_STATE' },
      });
    }

    // Get existing settings
    const existingOrg = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { settings: true },
    });

    const existingSettings = existingOrg?.settings as { features?: Partial<OrganizationFeatures> } | null || {};
    const existingFeatures = existingSettings.features || {};

    // Update feature
    const mergedFeatures = { ...existingFeatures, [featureKey]: state };
    const mergedSettings = { ...existingSettings, features: mergedFeatures };

    // Update organization
    const org = await prisma.organization.update({
      where: { id: req.orgId! },
      data: { settings: mergedSettings },
      select: { settings: true },
    });

    // Audit log
    await AuditService.log({
      action: 'organization.feature_toggled',
      resourceType: 'organization',
      resourceId: req.orgId!,
      actorId: req.userId,
      orgId: req.orgId,
      details: { feature: featureKey, state },
      ipAddress: req.ip,
    });

    // Broadcast via WebSocket
    const { broadcastToOrg } = await import('../socket');
    broadcastToOrg(req.orgId!, 'feature:toggled', {
      feature: featureKey,
      state,
      orgId: req.orgId,
      updatedBy: req.userId,
      updatedAt: new Date().toISOString(),
    });

    const finalFeatures = { ...DEFAULT_FEATURES, ...(org.settings as any)?.features };

    res.json({
      success: true,
      data: { feature: featureKey, state, features: finalFeatures },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/organization/test-storage
 * Test S3-compatible storage connection by actually connecting to the service
 */
router.post('/organization/test-storage', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint, bucket, region, accessKeyId, secretAccessKey, forcePathStyle, provider } = req.body;

    // Validate required fields
    const missingFields: string[] = [];
    if (!endpoint) missingFields.push('endpoint');
    if (!bucket) missingFields.push('bucket');
    if (!accessKeyId) missingFields.push('accessKeyId');
    if (!secretAccessKey) missingFields.push('secretAccessKey');

    if (missingFields.length > 0) {
      return res.json({
        success: true,
        data: {
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields,
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Create a temporary S3 client with the provided config
    const testClient = new S3Client({
      endpoint,
      region: region || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: forcePathStyle !== false,
    });

    try {
      // Try to head the bucket to verify access
      await testClient.send(new HeadBucketCommand({ Bucket: bucket }));

      // Also try to list objects (limited to 1) to verify read access
      await testClient.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));

      return res.json({
        success: true,
        data: {
          success: true,
          message: 'Connection successful! Bucket is accessible.',
          config: {
            provider: provider || 'custom',
            endpoint,
            bucket,
            region: region || 'us-east-1',
          },
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    } catch (s3Error: any) {
      const errorMessage = s3Error.message || 'Unknown error';
      const errorCode = s3Error.Code || s3Error.name || 'UNKNOWN';

      return res.json({
        success: true,
        data: {
          success: false,
          message: `Connection failed: ${errorCode} - ${errorMessage}`,
          error: {
            code: errorCode,
            message: errorMessage,
          },
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /admin/organization/test-storage-file
 * Test S3 storage by uploading, reading, and deleting a test file
 */
router.post('/organization/test-storage-file', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint, bucket, region, accessKeyId, secretAccessKey, forcePathStyle } = req.body;

    if (!endpoint || !bucket) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CONFIG',
          message: 'Endpoint and bucket are required',
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Create a temporary S3 client with the provided config
    const testClient = new S3Client({
      endpoint,
      region: region || 'us-east-1',
      credentials: accessKeyId && secretAccessKey ? {
        accessKeyId,
        secretAccessKey,
      } : undefined,
      forcePathStyle: forcePathStyle !== false,
    });

    const testKey = `neon-test-file-${Date.now()}.txt`;
    const testContent = `NEON Storage Test File\nCreated: ${new Date().toISOString()}\nOrganization: ${req.orgId}\nThis file was created to test S3 connectivity and can be safely deleted.`;

    const steps: { step: string; success: boolean; message: string }[] = [];

    try {
      // Step 1: Upload test file
      await testClient.send(new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: testContent,
        ContentType: 'text/plain',
      }));
      steps.push({ step: 'upload', success: true, message: 'Test file uploaded successfully' });

      // Step 2: Read test file back
      const getResponse = await testClient.send(new GetObjectCommand({
        Bucket: bucket,
        Key: testKey,
      }));

      const readContent = await getResponse.Body?.transformToString();
      const contentMatches = readContent === testContent;
      steps.push({
        step: 'read',
        success: contentMatches,
        message: contentMatches ? 'Test file read successfully and content verified' : 'Test file read but content mismatch'
      });

      // Step 3: Delete test file
      await testClient.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: testKey,
      }));
      steps.push({ step: 'delete', success: true, message: 'Test file deleted successfully' });

      const allSuccessful = steps.every(s => s.success);

      return res.json({
        success: true,
        data: {
          success: allSuccessful,
          message: allSuccessful
            ? 'All storage tests passed! Upload, read, and delete operations work correctly.'
            : 'Some storage tests failed. Check the steps for details.',
          steps,
          testFile: {
            key: testKey,
            size: testContent.length,
          },
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    } catch (s3Error: any) {
      const errorMessage = s3Error.message || 'Unknown error';
      const errorCode = s3Error.Code || s3Error.name || 'UNKNOWN';

      // Try to clean up the test file if it exists
      try {
        await testClient.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: testKey,
        }));
      } catch {
        // Ignore cleanup errors
      }

      return res.json({
        success: true,
        data: {
          success: false,
          message: `Storage test failed: ${errorCode} - ${errorMessage}`,
          steps,
          error: {
            code: errorCode,
            message: errorMessage,
          },
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /admin/organization/test-and-save-storage
 * Test S3 storage connection and automatically save settings if successful
 * This is the recommended endpoint for the settings UI
 */
router.post('/organization/test-and-save-storage', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint, bucket, region, accessKeyId, secretAccessKey, forcePathStyle, provider, publicUrl, enabled } = req.body;

    // Validate required fields
    const missingFields: string[] = [];
    if (!endpoint) missingFields.push('endpoint');
    if (!bucket) missingFields.push('bucket');
    if (!accessKeyId) missingFields.push('accessKeyId');
    if (!secretAccessKey) missingFields.push('secretAccessKey');

    if (missingFields.length > 0) {
      return res.json({
        success: true,
        data: {
          testSuccess: false,
          saved: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields,
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Create a temporary S3 client with the provided config
    const testClient = new S3Client({
      endpoint,
      region: region || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: forcePathStyle !== false,
    });

    // Test the connection
    try {
      // Try to head the bucket to verify access
      await testClient.send(new HeadBucketCommand({ Bucket: bucket }));

      // Also try to list objects (limited to 1) to verify read access
      await testClient.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));

      // Connection successful - now save the settings
      const org = await prisma.organization.findUnique({
        where: { id: req.orgId! },
        select: { settings: true },
      });

      const existingSettings = (org?.settings as Record<string, any>) || {};

      // Merge storage settings
      const storageSettings = {
        enabled: enabled !== false,
        provider: provider || 'custom',
        endpoint,
        bucket,
        region: region || 'us-east-1',
        accessKeyId,
        secretAccessKey,
        forcePathStyle: forcePathStyle !== false,
        publicUrl: publicUrl || '',
      };

      const updatedSettings = {
        ...existingSettings,
        storage: storageSettings,
      };

      // Save to database
      await prisma.organization.update({
        where: { id: req.orgId! },
        data: { settings: updatedSettings },
      });

      // Clear S3 cache for this org
      clearOrgS3Cache(req.orgId!);

      // Log the action
      await AuditService.log({
        action: 'organization.storage_settings_updated',
        resourceType: 'organization',
        resourceId: req.orgId!,
        actorId: req.userId,
        orgId: req.orgId,
        details: { provider: provider || 'custom', bucket, endpoint },
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        data: {
          testSuccess: true,
          saved: true,
          message: 'Connection successful and settings saved!',
          config: {
            provider: provider || 'custom',
            endpoint,
            bucket,
            region: region || 'us-east-1',
            enabled: enabled !== false,
          },
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    } catch (s3Error: any) {
      const errorMessage = s3Error.message || 'Unknown error';
      const errorCode = s3Error.Code || s3Error.name || 'UNKNOWN';

      // Provide helpful error messages
      let suggestion = '';
      if (errorCode === 'InvalidAccessKeyId' || errorCode === 'SignatureDoesNotMatch') {
        suggestion = 'Check your Access Key ID and Secret Access Key.';
      } else if (errorCode === 'NoSuchBucket') {
        suggestion = `Bucket "${bucket}" does not exist. Create it first.`;
      } else if (errorMessage.includes('ECONNREFUSED')) {
        suggestion = 'Cannot connect to the endpoint. Check if the S3 service is running.';
      } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
        suggestion = 'Cannot resolve the endpoint hostname. Check the URL.';
      }

      return res.json({
        success: true,
        data: {
          testSuccess: false,
          saved: false,
          message: `Connection failed: ${errorCode} - ${errorMessage}`,
          suggestion,
          error: {
            code: errorCode,
            message: errorMessage,
          },
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// Demo User Management Routes
// ============================================================================

/**
 * GET /admin/demo-user
 * Get demo user configuration
 */
router.get('/demo-user', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { settings: true },
    });

    const settings = org?.settings as Record<string, any> || {};
    const demoUserConfig = settings.demoUser || { enabled: false, email: null, password: null, userId: null };

    res.json({
      success: true,
      data: demoUserConfig,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/demo-user/enable
 * Enable demo user - creates a demo account that can only receive/respond to chats
 */
router.post('/demo-user/enable', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Find or create the demo department and role
    let demoDept = await prisma.department.findFirst({
      where: { orgId: req.orgId!, name: 'Demo' },
    });

    if (!demoDept) {
      demoDept = await prisma.department.create({
        data: {
          orgId: req.orgId!,
          name: 'Demo',
          description: 'Demo users department',
          rank: 0,
        },
      });
    }

    let demoRole = await prisma.role.findFirst({
      where: { departmentId: demoDept.id, name: 'Demo User' },
    });

    if (!demoRole) {
      demoRole = await prisma.role.create({
        data: {
          orgId: req.orgId!,
          departmentId: demoDept.id,
          name: 'Demo User',
          description: 'Demo user role - can only receive and respond to chats',
          rank: 0,
          permissions: ['chat:respond'], // Limited permission - can only respond
        },
      });
    }

    // Generate demo user credentials
    const demoEmail = `demo@${req.orgId}.demo.local`;
    const demoPassword = generateSecureToken(12);
    const passwordHash = await hashPassword(demoPassword);

    // Find existing demo user or create one
    let demoUser = await prisma.user.findFirst({
      where: { orgId: req.orgId!, email: demoEmail },
    });

    if (!demoUser) {
      demoUser = await prisma.user.create({
        data: {
          orgId: req.orgId!,
          email: demoEmail,
          username: 'demo_user',
          displayName: 'Demo User',
          passwordHash,
          departmentId: demoDept.id,
          roleId: demoRole.id,
          status: 'ACTIVE',
        },
      });
    } else {
      // Update password
      demoUser = await prisma.user.update({
        where: { id: demoUser.id },
        data: { passwordHash, status: 'ACTIVE' },
      });
    }

    // Store demo user config in org settings
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { settings: true },
    });

    const existingSettings = org?.settings as Record<string, any> || {};
    const updatedSettings = {
      ...existingSettings,
      demoUser: {
        enabled: true,
        email: demoEmail,
        password: demoPassword,
        userId: demoUser.id,
      },
    };

    await prisma.organization.update({
      where: { id: req.orgId! },
      data: { settings: updatedSettings },
    });

    await AuditService.log({
      action: 'demo_user.enabled',
      resourceType: 'organization',
      resourceId: req.orgId!,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        enabled: true,
        email: demoEmail,
        password: demoPassword,
        userId: demoUser.id,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/demo-user/disable
 * Disable demo user
 */
router.post('/demo-user/disable', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get current settings
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { settings: true },
    });

    const existingSettings = org?.settings as Record<string, any> || {};
    const demoUserId = existingSettings.demoUser?.userId;

    // Deactivate the demo user if it exists
    if (demoUserId) {
      await prisma.user.update({
        where: { id: demoUserId },
        data: { status: 'DEACTIVATED' },
      });
    }

    // Update settings
    const updatedSettings = {
      ...existingSettings,
      demoUser: {
        enabled: false,
        email: existingSettings.demoUser?.email || null,
        password: null,
        userId: demoUserId,
      },
    };

    await prisma.organization.update({
      where: { id: req.orgId! },
      data: { settings: updatedSettings },
    });

    await AuditService.log({
      action: 'demo_user.disabled',
      resourceType: 'organization',
      resourceId: req.orgId!,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { enabled: false },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/demo-user/regenerate
 * Regenerate demo user password
 */
router.post('/demo-user/regenerate', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get current settings
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { settings: true },
    });

    const existingSettings = org?.settings as Record<string, any> || {};
    const demoUserConfig = existingSettings.demoUser;

    if (!demoUserConfig?.enabled || !demoUserConfig?.userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'DEMO_USER_NOT_ENABLED', message: 'Demo user is not enabled' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Generate new password
    const newPassword = generateSecureToken(12);
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    await prisma.user.update({
      where: { id: demoUserConfig.userId },
      data: { passwordHash },
    });

    // Update settings with new password
    const updatedSettings = {
      ...existingSettings,
      demoUser: {
        ...demoUserConfig,
        password: newPassword,
      },
    };

    await prisma.organization.update({
      where: { id: req.orgId! },
      data: { settings: updatedSettings },
    });

    return res.json({
      success: true,
      data: {
        enabled: true,
        email: demoUserConfig.email,
        password: newPassword,
        userId: demoUserConfig.userId,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// Developer Tools Routes (API Keys & Webhooks)
// ============================================================================

// Available webhook events
const WEBHOOK_EVENTS = [
  { id: 'message.created', name: 'Message Created', description: 'When a new message is sent' },
  { id: 'message.updated', name: 'Message Updated', description: 'When a message is edited' },
  { id: 'message.deleted', name: 'Message Deleted', description: 'When a message is deleted' },
  { id: 'user.created', name: 'User Created', description: 'When a new user is created' },
  { id: 'user.updated', name: 'User Updated', description: 'When a user profile is updated' },
  { id: 'user.deleted', name: 'User Deleted', description: 'When a user is deactivated' },
  { id: 'user.online', name: 'User Online', description: 'When a user comes online' },
  { id: 'user.offline', name: 'User Offline', description: 'When a user goes offline' },
  { id: 'meeting.scheduled', name: 'Meeting Scheduled', description: 'When a meeting is scheduled' },
  { id: 'meeting.started', name: 'Meeting Started', description: 'When a meeting starts' },
  { id: 'meeting.ended', name: 'Meeting Ended', description: 'When a meeting ends' },
  { id: 'meeting.participant_joined', name: 'Participant Joined', description: 'When someone joins a meeting' },
  { id: 'meeting.participant_left', name: 'Participant Left', description: 'When someone leaves a meeting' },
  { id: 'call.started', name: 'Call Started', description: 'When a call is initiated' },
  { id: 'call.ended', name: 'Call Ended', description: 'When a call ends' },
  { id: 'conversation.created', name: 'Conversation Created', description: 'When a new conversation is created' },
  { id: 'file.uploaded', name: 'File Uploaded', description: 'When a file is uploaded' },
];

// Available API scopes
const API_SCOPES = [
  { id: 'read:users', name: 'Read Users', description: 'Read user information' },
  { id: 'write:users', name: 'Write Users', description: 'Create and update users' },
  { id: 'read:messages', name: 'Read Messages', description: 'Read messages' },
  { id: 'write:messages', name: 'Write Messages', description: 'Send messages' },
  { id: 'read:conversations', name: 'Read Conversations', description: 'Read conversations' },
  { id: 'write:conversations', name: 'Write Conversations', description: 'Create conversations' },
  { id: 'read:meetings', name: 'Read Meetings', description: 'Read meeting information' },
  { id: 'write:meetings', name: 'Write Meetings', description: 'Create and manage meetings' },
  { id: 'read:files', name: 'Read Files', description: 'Download files' },
  { id: 'write:files', name: 'Write Files', description: 'Upload files' },
  { id: 'admin', name: 'Admin Access', description: 'Full administrative access' },
];

/**
 * GET /admin/developers/events
 * List available webhook events
 */
router.get('/developers/events', requirePermission('org:manage_settings'), async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: WEBHOOK_EVENTS,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  });
});

/**
 * GET /admin/developers/scopes
 * List available API scopes
 */
router.get('/developers/scopes', requirePermission('org:manage_settings'), async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: API_SCOPES,
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ============================================================================
// API Key Management
// ============================================================================

/**
 * GET /admin/developers/api-keys
 * List all API keys for the organization
 */
router.get('/developers/api-keys', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [apiKeys, total] = await Promise.all([
      prisma.apiKey.findMany({
        where: { orgId: req.orgId!, revokedAt: null },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          rateLimit: true,
          createdAt: true,
          createdBy: true,
          lastUsedAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.apiKey.count({ where: { orgId: req.orgId!, revokedAt: null } }),
    ]);

    res.json({
      success: true,
      data: apiKeys,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: skip + apiKeys.length < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/developers/api-keys
 * Create a new API key
 */
router.post('/developers/api-keys', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, scopes, rateLimit, expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name is required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Generate a secure API key
    const rawKey = `neon_${generateSecureToken(32)}`;
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = await hashPassword(rawKey);

    const apiKey = await prisma.apiKey.create({
      data: {
        orgId: req.orgId!,
        name,
        keyHash,
        keyPrefix,
        scopes: scopes || [],
        rateLimit: rateLimit || null,
        createdBy: req.userId!,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        rateLimit: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    await AuditService.log({
      action: 'api_key.created',
      resourceType: 'api_key',
      resourceId: apiKey.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { name, scopes },
      ipAddress: req.ip,
    });

    // Return the raw key only once - it cannot be retrieved again
    return res.status(201).json({
      success: true,
      data: {
        ...apiKey,
        key: rawKey, // Only returned on creation
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /admin/developers/api-keys/:id
 * Revoke an API key
 */
router.delete('/developers/api-keys/:id', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = await prisma.apiKey.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'API key not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    await prisma.apiKey.update({
      where: { id: req.params.id },
      data: {
        revokedAt: new Date(),
        revokedBy: req.userId,
      },
    });

    await AuditService.log({
      action: 'api_key.revoked',
      resourceType: 'api_key',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: { message: 'API key revoked' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// Webhook Management
// ============================================================================

/**
 * GET /admin/developers/webhooks
 * List all webhooks for the organization
 */
router.get('/developers/webhooks', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [webhooks, total] = await Promise.all([
      prisma.webhook.findMany({
        where: { orgId: req.orgId! },
        select: {
          id: true,
          name: true,
          url: true,
          events: true,
          enabled: true,
          lastTriggeredAt: true,
          lastSuccessAt: true,
          lastFailureAt: true,
          failureCount: true,
          successCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.webhook.count({ where: { orgId: req.orgId! } }),
    ]);

    res.json({
      success: true,
      data: webhooks,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: skip + webhooks.length < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/developers/webhooks/:id
 * Get a specific webhook
 */
router.get('/developers/webhooks/:id', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Webhook not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    return res.json({
      success: true,
      data: webhook,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /admin/developers/webhooks
 * Create a new webhook
 */
router.post('/developers/webhooks', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, url, events, enabled } = req.body;

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name and URL are required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    if (!events || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'At least one event must be selected' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Generate a secret for webhook signature verification
    const secret = generateSecureToken(32);

    const webhook = await prisma.webhook.create({
      data: {
        orgId: req.orgId!,
        name,
        url,
        secret,
        events,
        enabled: enabled !== false,
        createdBy: req.userId!,
      },
    });

    await AuditService.log({
      action: 'webhook.created',
      resourceType: 'webhook',
      resourceId: webhook.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { name, url, events },
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      data: {
        ...webhook,
        secret, // Only returned on creation
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /admin/developers/webhooks/:id
 * Update a webhook
 */
router.patch('/developers/webhooks/:id', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, url, events, enabled } = req.body;

    const existing = await prisma.webhook.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Webhook not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (events !== undefined) updateData.events = events;
    if (enabled !== undefined) updateData.enabled = enabled;

    const webhook = await prisma.webhook.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await AuditService.log({
      action: 'webhook.updated',
      resourceType: 'webhook',
      resourceId: webhook.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { fields: Object.keys(updateData) },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: webhook,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /admin/developers/webhooks/:id
 * Delete a webhook
 */
router.delete('/developers/webhooks/:id', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Webhook not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    await prisma.webhook.delete({
      where: { id: req.params.id },
    });

    await AuditService.log({
      action: 'webhook.deleted',
      resourceType: 'webhook',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: { message: 'Webhook deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /admin/developers/webhooks/:id/test
 * Test a webhook by sending a test payload
 */
router.post('/developers/webhooks/:id/test', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Webhook not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Create test payload
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from NEON',
        webhookId: webhook.id,
        webhookName: webhook.name,
      },
    };

    // Send test request
    const startTime = Date.now();
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhook.secret,
          'X-Webhook-Event': 'test',
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        return res.json({
          success: true,
          data: {
            success: true,
            statusCode: response.status,
            latency,
            message: 'Webhook test successful',
          },
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
      } else {
        return res.json({
          success: true,
          data: {
            success: false,
            statusCode: response.status,
            latency,
            message: `Webhook returned status ${response.status}`,
          },
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
      }
    } catch (fetchError: any) {
      const latency = Date.now() - startTime;
      return res.json({
        success: true,
        data: {
          success: false,
          latency,
          message: `Failed to reach webhook: ${fetchError.message}`,
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /admin/developers/webhooks/:id/regenerate-secret
 * Regenerate webhook secret
 */
router.post('/developers/webhooks/:id/regenerate-secret', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.webhook.findFirst({
      where: { id: req.params.id, orgId: req.orgId! },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Webhook not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const newSecret = generateSecureToken(32);

    const webhook = await prisma.webhook.update({
      where: { id: req.params.id },
      data: { secret: newSecret },
    });

    await AuditService.log({
      action: 'webhook.secret_regenerated',
      resourceType: 'webhook',
      resourceId: webhook.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: { secret: newSecret },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(error);
  }
});

// ==========================================================================
// Storage Browser (Super Admin Only)
// ==========================================================================

// Helper to check if user is Super Admin
async function isSuperAdmin(userId: string, orgId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  return user?.role?.name === 'Super Admin' || user?.role?.name === 'Super Administrator';
}

/**
 * GET /admin/storage-browser/list
 * List files in a directory (Super Admin only)
 */
router.get('/storage-browser/list', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is Super Admin
    const isSuper = await isSuperAdmin(req.userId!, req.orgId!);
    if (!isSuper) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Storage browser is only available to Super Administrators' },
      });
    }

    const { prefix = '', continuationToken, maxKeys = 100 } = req.query;

    // Get org S3 config
    const orgConfig = await getOrgS3Config(req.orgId!);

    if (!orgConfig?.enabled && !config.s3.endpoint) {
      return res.status(503).json({
        success: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Storage is not configured' },
      });
    }

    const s3Client = orgConfig?.enabled
      ? new S3Client({
          endpoint: orgConfig.endpoint,
          region: orgConfig.region,
          credentials: {
            accessKeyId: orgConfig.accessKeyId,
            secretAccessKey: orgConfig.secretAccessKey,
          },
          forcePathStyle: orgConfig.forcePathStyle,
        })
      : new S3Client({
          endpoint: config.s3.endpoint,
          region: config.s3.region,
          credentials: {
            accessKeyId: config.s3.accessKey,
            secretAccessKey: config.s3.secretKey,
          },
          forcePathStyle: config.s3.forcePathStyle,
        });

    const bucket = orgConfig?.enabled ? orgConfig.bucket : config.s3.bucketMedia;

    // List objects
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix as string,
      Delimiter: '/',
      MaxKeys: Math.min(Number(maxKeys), 1000),
      ContinuationToken: continuationToken as string | undefined,
    }));

    // Get folder prefixes (directories)
    const folders = (response.CommonPrefixes || []).map((cp) => ({
      name: cp.Prefix?.replace(prefix as string, '').replace(/\/$/, '') || '',
      path: cp.Prefix || '',
      type: 'folder' as const,
    }));

    // Get files
    const files = (response.Contents || [])
      .filter((obj) => obj.Key !== prefix) // Filter out the directory itself
      .map((obj) => ({
        name: obj.Key?.replace(prefix as string, '') || '',
        path: obj.Key || '',
        type: 'file' as const,
        size: obj.Size || 0,
        lastModified: obj.LastModified?.toISOString(),
        etag: obj.ETag?.replace(/"/g, ''),
      }));

    await AuditService.log({
      action: 'storage.browse',
      resourceType: 'storage',
      resourceId: prefix as string || '/',
      actorId: req.userId,
      orgId: req.orgId,
      details: { prefix, maxKeys },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        bucket,
        prefix,
        folders,
        files,
        isTruncated: response.IsTruncated,
        nextContinuationToken: response.NextContinuationToken,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/storage-browser/download-url
 * Get presigned download URL for a file (Super Admin only)
 */
router.get('/storage-browser/download-url', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isSuper = await isSuperAdmin(req.userId!, req.orgId!);
    if (!isSuper) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Storage browser is only available to Super Administrators' },
      });
    }

    const { key } = req.query;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_KEY', message: 'File key is required' },
      });
    }

    // Prevent path traversal
    if (key.includes('..')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_KEY', message: 'Invalid file key' },
      });
    }

    const { getSignedUrlForOrg } = await import('../services/s3');
    const signedUrl = await getSignedUrlForOrg(req.orgId!, key, 3600);

    await AuditService.log({
      action: 'storage.download_url_generated',
      resourceType: 'storage',
      resourceId: key,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { url: signedUrl, expiresIn: 3600 },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/storage-browser/file-info
 * Get file metadata (Super Admin only)
 */
router.get('/storage-browser/file-info', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isSuper = await isSuperAdmin(req.userId!, req.orgId!);
    if (!isSuper) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Storage browser is only available to Super Administrators' },
      });
    }

    const { key } = req.query;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_KEY', message: 'File key is required' },
      });
    }

    if (key.includes('..')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_KEY', message: 'Invalid file key' },
      });
    }

    const { headObjectForOrg } = await import('../services/s3');
    const metadata = await headObjectForOrg(req.orgId!, key);

    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'File not found' },
      });
    }

    res.json({
      success: true,
      data: {
        key,
        contentType: metadata.ContentType,
        size: metadata.ContentLength,
        lastModified: metadata.LastModified?.toISOString(),
        etag: metadata.ETag?.replace(/"/g, ''),
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /admin/storage-browser/file
 * Delete a file (Super Admin only)
 */
router.delete('/storage-browser/file', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isSuper = await isSuperAdmin(req.userId!, req.orgId!);
    if (!isSuper) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Storage browser is only available to Super Administrators' },
      });
    }

    const { key } = req.query;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_KEY', message: 'File key is required' },
      });
    }

    if (key.includes('..')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_KEY', message: 'Invalid file key' },
      });
    }

    const { deleteFileForOrg } = await import('../services/s3');
    await deleteFileForOrg(req.orgId!, key);

    await AuditService.log({
      action: 'storage.file_deleted',
      resourceType: 'storage',
      resourceId: key,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: 'File deleted successfully' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/storage-browser/stats
 * Get storage statistics (Super Admin only)
 */
router.get('/storage-browser/stats', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isSuper = await isSuperAdmin(req.userId!, req.orgId!);
    if (!isSuper) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Storage browser is only available to Super Administrators' },
      });
    }

    // Get storage usage from database
    const [orgStats, userStats] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: req.orgId! },
        select: {
          storageUsed: true,
          storageLimit: true,
        },
      }),
      prisma.user.groupBy({
        by: ['id'],
        where: { orgId: req.orgId! },
        _sum: { storageUsed: true },
      }),
    ]);

    // Get file count from database
    const fileCount = await prisma.file.count({
      where: { orgId: req.orgId! },
    });

    res.json({
      success: true,
      data: {
        totalUsed: Number(orgStats?.storageUsed || 0),
        storageLimit: Number(orgStats?.storageLimit || 0),
        fileCount,
        usagePercentage: orgStats?.storageLimit
          ? (Number(orgStats.storageUsed) / Number(orgStats.storageLimit)) * 100
          : 0,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

export { router as adminRouter };
