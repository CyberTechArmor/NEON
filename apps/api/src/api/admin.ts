/**
 * Admin Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma, checkDatabaseHealth } from '@neon/database';
import { paginationSchema, createUserSchema, createRoleSchema, createDepartmentSchema } from '@neon/shared';
import { NotFoundError } from '@neon/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { AuditService } from '../services/audit';
import { checkRedisHealth } from '../services/redis';
import { getJobStatus, triggerJob } from '../jobs';
import { hashPassword, generateSecureToken } from '../services/auth';
import { S3Client, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, _Object, CommonPrefix } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { clearOrgS3Cache, getOrgS3Config } from '../services/s3';
import { getConfig } from '@neon/config';
import {
  getAllFeatureFlags,
  setFeatureFlags,
  getAvailableFeatureKeys,
} from '../services/featureFlags';
import { broadcastToOrg } from '../socket';

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
// Feature Flags Management Routes
// ============================================================================

/**
 * GET /admin/features
 * Get all feature flags for the organization
 */
router.get('/features', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const flags = await getAllFeatureFlags(req.orgId!);
    const availableFeatures = getAvailableFeatureKeys();

    res.json({
      success: true,
      data: {
        flags,
        availableFeatures,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/features
 * Update feature flags for the organization
 */
router.post('/features', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { flags } = req.body;

    if (!flags || typeof flags !== 'object') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Flags object is required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    await setFeatureFlags(req.orgId!, flags);

    // Log the action
    await AuditService.log({
      action: 'feature_flags.updated',
      resourceType: 'organization',
      resourceId: req.orgId!,
      actorId: req.userId,
      orgId: req.orgId,
      details: { flags: Object.keys(flags) },
      ipAddress: req.ip,
    });

    // Broadcast the change to all connected clients in the org
    broadcastToOrg(req.orgId!, 'feature_flags:updated' as any, { flags });

    const updatedFlags = await getAllFeatureFlags(req.orgId!);

    return res.json({
      success: true,
      data: { flags: updatedFlags },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
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

// ============================================================
// Storage Browser Endpoints
// ============================================================

/**
 * Helper function to get S3 client for storage browsing
 */
async function getStorageClient(orgId: string): Promise<{ client: S3Client; bucket: string } | null> {
  const orgConfig = await getOrgS3Config(orgId);

  if (orgConfig && orgConfig.enabled) {
    return {
      client: new S3Client({
        endpoint: orgConfig.endpoint,
        region: orgConfig.region,
        credentials: {
          accessKeyId: orgConfig.accessKeyId,
          secretAccessKey: orgConfig.secretAccessKey,
        },
        forcePathStyle: orgConfig.forcePathStyle,
      }),
      bucket: orgConfig.bucket,
    };
  }

  // Fall back to default storage config
  if (config.s3.endpoint && config.s3.accessKey && config.s3.secretKey) {
    return {
      client: new S3Client({
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        credentials: {
          accessKeyId: config.s3.accessKey,
          secretAccessKey: config.s3.secretKey,
        },
        forcePathStyle: config.s3.forcePathStyle,
      }),
      bucket: config.s3.bucketMedia,
    };
  }

  return null;
}

/**
 * GET /admin/storage/browse
 * Browse storage objects with optional prefix (folder-like navigation)
 */
router.get('/storage/browse', requirePermission('storage:browse'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prefix = (req.query.prefix as string) || '';
    const delimiter = req.query.flat === 'true' ? undefined : '/'; // Use delimiter for folder-like browsing
    const maxKeys = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const continuationToken = req.query.cursor as string | undefined;

    const storage = await getStorageClient(req.orgId!);
    if (!storage) {
      return res.status(503).json({
        success: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Storage is not configured' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const command = new ListObjectsV2Command({
      Bucket: storage.bucket,
      Prefix: prefix,
      Delimiter: delimiter,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    });

    const response = await storage.client.send(command);

    // Format objects (files)
    const objects = (response.Contents || []).map((obj: _Object) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified?.toISOString(),
      etag: obj.ETag?.replace(/"/g, ''),
      storageClass: obj.StorageClass,
    }));

    // Format common prefixes (folders)
    const folders = (response.CommonPrefixes || []).map((p: CommonPrefix) => ({
      prefix: p.Prefix,
      name: p.Prefix?.replace(prefix, '').replace(/\/$/, ''),
    }));

    return res.json({
      success: true,
      data: {
        objects,
        folders,
        prefix,
        isTruncated: response.IsTruncated,
        nextCursor: response.NextContinuationToken,
        keyCount: response.KeyCount,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[Admin] Storage browse error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'STORAGE_ERROR', message: error.message || 'Failed to browse storage' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * GET /admin/storage/object
 * Get object metadata and signed download URL
 */
router.get('/storage/object', requirePermission('storage:browse'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.query.key as string;
    if (!key) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Object key is required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const storage = await getStorageClient(req.orgId!);
    if (!storage) {
      return res.status(503).json({
        success: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Storage is not configured' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Get object metadata
    const headCommand = new HeadObjectCommand({
      Bucket: storage.bucket,
      Key: key,
    });

    const metadata = await storage.client.send(headCommand);

    // Generate signed download URL (valid for 1 hour)
    const getCommand = new GetObjectCommand({
      Bucket: storage.bucket,
      Key: key,
    });
    const downloadUrl = await getSignedUrl(storage.client, getCommand, { expiresIn: 3600 });

    return res.json({
      success: true,
      data: {
        key,
        size: metadata.ContentLength,
        contentType: metadata.ContentType,
        lastModified: metadata.LastModified?.toISOString(),
        etag: metadata.ETag?.replace(/"/g, ''),
        metadata: metadata.Metadata,
        downloadUrl,
        expiresIn: 3600,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Object not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }
    console.error('[Admin] Storage object error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'STORAGE_ERROR', message: error.message || 'Failed to get object' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * DELETE /admin/storage/object
 * Delete a storage object
 */
router.delete('/storage/object', requirePermission('storage:browse'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = req.query.key as string;
    if (!key) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Object key is required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const storage = await getStorageClient(req.orgId!);
    if (!storage) {
      return res.status(503).json({
        success: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Storage is not configured' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Delete the object
    const deleteCommand = new DeleteObjectCommand({
      Bucket: storage.bucket,
      Key: key,
    });

    await storage.client.send(deleteCommand);

    // Log the deletion
    await AuditService.log({
      action: 'storage.object_deleted',
      resourceType: 'storage_object',
      resourceId: key,
      actorId: req.userId,
      orgId: req.orgId,
      details: { key },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({
      success: true,
      data: { message: 'Object deleted successfully', key },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[Admin] Storage delete error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'STORAGE_ERROR', message: error.message || 'Failed to delete object' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * GET /admin/storage/stats
 * Get storage statistics
 */
router.get('/storage/stats', requirePermission('storage:browse'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storage = await getStorageClient(req.orgId!);
    if (!storage) {
      return res.status(503).json({
        success: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Storage is not configured' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Get org storage stats from database
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId! },
      select: { storageUsed: true, storageLimit: true },
    });

    // Count objects (up to 1000 for performance)
    const listCommand = new ListObjectsV2Command({
      Bucket: storage.bucket,
      MaxKeys: 1000,
    });
    const listResponse = await storage.client.send(listCommand);

    const objectCount = listResponse.KeyCount || 0;
    const hasMore = listResponse.IsTruncated || false;

    return res.json({
      success: true,
      data: {
        storageUsed: org?.storageUsed ? Number(org.storageUsed) : 0,
        storageLimit: org?.storageLimit ? Number(org.storageLimit) : null,
        objectCount,
        hasMoreObjects: hasMore,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[Admin] Storage stats error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'STORAGE_ERROR', message: error.message || 'Failed to get storage stats' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

// =============================================================================
// MEET INTEGRATION ENDPOINTS
// =============================================================================

/**
 * GET /admin/integrations/meet
 * Get MEET integration configuration
 */
router.get('/integrations/meet', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const integration = await prisma.meetIntegration.findUnique({
      where: { orgId: req.orgId! },
    });

    if (!integration) {
      return res.json({
        success: true,
        data: {
          configured: false,
          baseUrl: '',
          isConnected: false,
          enabled: false,
          options: {},
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    return res.json({
      success: true,
      data: {
        configured: true,
        baseUrl: integration.baseUrl,
        isConnected: integration.isConnected,
        enabled: integration.enabled,
        autoJoin: integration.autoJoin,
        defaultQuality: integration.defaultQuality,
        options: integration.options,
        lastCheckedAt: integration.lastCheckedAt?.toISOString(),
        lastError: integration.lastError,
        // Don't expose the actual API key, just show if it's set
        hasApiKey: !!integration.apiKey,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[Admin] MEET integration get error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to get MEET integration' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * POST /admin/integrations/meet
 * Create or update MEET integration configuration
 */
router.post('/integrations/meet', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baseUrl, apiKey, enabled, autoJoin, defaultQuality } = req.body;

    if (!baseUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Base URL is required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Check if integration already exists
    const existing = await prisma.meetIntegration.findUnique({
      where: { orgId: req.orgId! },
    });

    const integrationData: any = {
      baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
      enabled: enabled ?? true,
      autoJoin: autoJoin ?? true,
      defaultQuality: defaultQuality || 'auto',
      updatedAt: new Date(),
    };

    // Only update apiKey if provided (allows updating other fields without changing key)
    if (apiKey) {
      integrationData.apiKey = apiKey;
    }

    let integration;
    if (existing) {
      integration = await prisma.meetIntegration.update({
        where: { orgId: req.orgId! },
        data: integrationData,
      });
    } else {
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'API key is required for initial setup' },
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
      }

      integration = await prisma.meetIntegration.create({
        data: {
          orgId: req.orgId!,
          ...integrationData,
          apiKey: apiKey,
          createdBy: req.userId!,
        },
      });
    }

    // Log the action
    await AuditService.log({
      action: existing ? 'integration.meet.updated' : 'integration.meet.created',
      resourceType: 'meet_integration',
      resourceId: integration.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { baseUrl: integration.baseUrl, enabled: integration.enabled },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({
      success: true,
      data: {
        configured: true,
        baseUrl: integration.baseUrl,
        isConnected: integration.isConnected,
        enabled: integration.enabled,
        autoJoin: integration.autoJoin,
        defaultQuality: integration.defaultQuality,
        options: integration.options,
        hasApiKey: true,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[Admin] MEET integration save error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to save MEET integration' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * POST /admin/integrations/meet/test
 * Test MEET connection and fetch available options
 */
router.post('/integrations/meet/test', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baseUrl, apiKey } = req.body;

    // Get existing integration if no credentials provided
    let testUrl = baseUrl;
    let testKey = apiKey;

    if (!testUrl || !testKey) {
      const existing = await prisma.meetIntegration.findUnique({
        where: { orgId: req.orgId! },
      });

      if (existing) {
        testUrl = testUrl || existing.baseUrl;
        testKey = testKey || existing.apiKey;
      }
    }

    if (!testUrl || !testKey) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Base URL and API key are required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Clean URL
    const cleanUrl = testUrl.replace(/\/$/, '');

    // Test connection by calling the /health endpoint
    const startTime = Date.now();
    let healthResponse;
    try {
      healthResponse = await fetch(`${cleanUrl}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
    } catch (fetchError: any) {
      // Update integration status
      await prisma.meetIntegration.updateMany({
        where: { orgId: req.orgId! },
        data: {
          isConnected: false,
          lastCheckedAt: new Date(),
          lastError: `Connection failed: ${fetchError.message}`,
        },
      });

      return res.json({
        success: true,
        data: {
          connected: false,
          error: `Connection failed: ${fetchError.message}`,
          latency: null,
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const latency = Date.now() - startTime;

    if (!healthResponse.ok) {
      await prisma.meetIntegration.updateMany({
        where: { orgId: req.orgId! },
        data: {
          isConnected: false,
          lastCheckedAt: new Date(),
          lastError: `Health check failed with status ${healthResponse.status}`,
        },
      });

      return res.json({
        success: true,
        data: {
          connected: false,
          error: `Health check failed with status ${healthResponse.status}`,
          latency,
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Now test the API key by fetching stats (requires auth)
    let statsResponse;
    try {
      statsResponse = await fetch(`${cleanUrl}/api/admin/stats`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': testKey,
        },
      });
    } catch (fetchError: any) {
      await prisma.meetIntegration.updateMany({
        where: { orgId: req.orgId! },
        data: {
          isConnected: false,
          lastCheckedAt: new Date(),
          lastError: `API key validation failed: ${fetchError.message}`,
        },
      });

      return res.json({
        success: true,
        data: {
          connected: false,
          error: `API key validation failed: ${fetchError.message}`,
          latency,
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    if (!statsResponse.ok) {
      const errorText = await statsResponse.text();
      await prisma.meetIntegration.updateMany({
        where: { orgId: req.orgId! },
        data: {
          isConnected: false,
          lastCheckedAt: new Date(),
          lastError: `API key invalid or unauthorized (${statsResponse.status})`,
        },
      });

      return res.json({
        success: true,
        data: {
          connected: false,
          error: `API key invalid or unauthorized (${statsResponse.status})`,
          latency,
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const statsData: any = await statsResponse.json();

    // Fetch settings to get customizable options
    let settingsData: any = {};
    try {
      const settingsResponse = await fetch(`${cleanUrl}/api/admin/settings`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': testKey,
        },
      });
      if (settingsResponse.ok) {
        settingsData = await settingsResponse.json();
      }
    } catch {
      // Settings fetch is optional
    }

    // Update integration with connection status and options
    await prisma.meetIntegration.updateMany({
      where: { orgId: req.orgId! },
      data: {
        isConnected: true,
        lastCheckedAt: new Date(),
        lastError: null,
        options: {
          serverVersion: statsData.version || 'unknown',
          activeRooms: statsData.activeRooms || 0,
          totalParticipants: statsData.totalParticipants || 0,
          settings: settingsData.settings || {},
          recommendations: settingsData.recommendations || {},
        },
      },
    });

    return res.json({
      success: true,
      data: {
        connected: true,
        latency,
        serverInfo: {
          version: statsData.version || 'unknown',
          activeRooms: statsData.activeRooms || 0,
          totalParticipants: statsData.totalParticipants || 0,
        },
        settings: settingsData.settings || {},
        recommendations: settingsData.recommendations || {},
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[Admin] MEET integration test error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to test MEET connection' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * DELETE /admin/integrations/meet
 * Remove MEET integration
 */
router.delete('/integrations/meet', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.meetIntegration.findUnique({
      where: { orgId: req.orgId! },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'MEET integration not found' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    await prisma.meetIntegration.delete({
      where: { orgId: req.orgId! },
    });

    // Log the action
    await AuditService.log({
      action: 'integration.meet.deleted',
      resourceType: 'meet_integration',
      resourceId: existing.id,
      actorId: req.userId,
      orgId: req.orgId,
      details: { baseUrl: existing.baseUrl },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({
      success: true,
      data: { message: 'MEET integration removed successfully' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[Admin] MEET integration delete error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to delete MEET integration' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * GET /admin/integrations/meet/join-url
 * Get a join URL for a MEET room
 */
router.get('/integrations/meet/join-url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomName, displayName, quality } = req.query;

    if (!roomName) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Room name is required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const integration = await prisma.meetIntegration.findUnique({
      where: { orgId: req.orgId! },
    });

    if (!integration || !integration.enabled) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'MEET integration is not configured or disabled' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Build the join URL
    const params = new URLSearchParams();
    params.set('room', roomName as string);
    if (displayName) params.set('name', displayName as string);
    if (integration.autoJoin && displayName) params.set('autojoin', 'true');
    const effectiveQuality = (quality as string) || integration.defaultQuality;
    if (effectiveQuality && effectiveQuality !== 'auto') {
      params.set('quality', effectiveQuality);
    }

    const joinUrl = `${integration.baseUrl}/?${params.toString()}`;

    return res.json({
      success: true,
      data: {
        joinUrl,
        roomName,
        baseUrl: integration.baseUrl,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[Admin] MEET join URL error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to generate join URL' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

/**
 * POST /admin/integrations/meet/create-room
 * Create a room on the MEET server
 */
router.post('/integrations/meet/create-room', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomName, displayName, maxParticipants } = req.body;

    if (!roomName) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Room name is required' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const integration = await prisma.meetIntegration.findUnique({
      where: { orgId: req.orgId! },
    });

    if (!integration || !integration.enabled) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'MEET integration is not configured or disabled' },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Create room on MEET server
    const response = await fetch(`${integration.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': integration.apiKey,
      },
      body: JSON.stringify({
        roomName,
        displayName: displayName || roomName,
        maxParticipants: maxParticipants || 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: { code: 'MEET_ERROR', message: `Failed to create room: ${errorText}` },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    const roomData: any = await response.json();

    // Build join URL
    const params = new URLSearchParams();
    params.set('room', roomName);
    if (integration.autoJoin) params.set('autojoin', 'true');

    return res.json({
      success: true,
      data: {
        room: roomData.room,
        joinUrl: `${integration.baseUrl}/?${params.toString()}`,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[Admin] MEET create room error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to create room' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  }
});

export { router as adminRouter };
