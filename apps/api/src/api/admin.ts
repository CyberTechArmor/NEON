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
import { S3Client, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const router = Router();
router.use(authenticate);

/**
 * GET /admin/health
 */
router.get('/health', requirePermission('org:view_settings'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [dbHealth, redisHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    res.json({
      success: true,
      data: {
        status: dbHealth.healthy && redisHealth.healthy ? 'healthy' : 'degraded',
        database: dbHealth,
        redis: redisHealth,
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
    const [users, messages, meetings, storage, activeToday] = await Promise.all([
      prisma.user.count({ where: { orgId: req.orgId!, status: 'ACTIVE' } }),
      prisma.message.count({ where: { conversation: { orgId: req.orgId! } } }),
      prisma.meeting.count({ where: { orgId: req.orgId! } }),
      prisma.organization.findUnique({ where: { id: req.orgId! }, select: { storageUsed: true, storageLimit: true } }),
      prisma.user.count({ where: { orgId: req.orgId!, lastActiveAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);

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

    res.json({
      success: true,
      data: { message: 'User deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
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

// ============================================================================
// Role Management Routes
// ============================================================================

/**
 * GET /admin/roles
 * List roles
 */
router.get('/roles', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
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
    await prisma.role.delete({ where: { id: req.params.id } });

    await AuditService.log({
      action: 'role.deleted',
      resourceType: 'role',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: 'Role deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
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
 * List departments
 */
router.get('/departments', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
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
    await prisma.department.delete({ where: { id: req.params.id } });

    await AuditService.log({
      action: 'department.deleted',
      resourceType: 'department',
      resourceId: req.params.id,
      actorId: req.userId,
      orgId: req.orgId,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: 'Department deleted' },
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
 * Test S3-compatible storage connection
 */
router.post('/organization/test-storage', requirePermission('org:manage_settings'), async (req: Request, res: Response, next: NextFunction) => {
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

    try {
      // Try to head the bucket to verify access
      await testClient.send(new HeadBucketCommand({ Bucket: bucket }));

      // Also try to list objects (limited to 1) to verify read access
      await testClient.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));

      return res.json({
        success: true,
        data: {
          success: true,
          message: 'Connection successful! Bucket is accessible.'
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
          message: `Connection failed: ${errorCode} - ${errorMessage}`
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }
  } catch (error) {
    return next(error);
  }
});

export { router as adminRouter };
