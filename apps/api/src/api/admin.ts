/**
 * Admin Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma, checkDatabaseHealth } from '@neon/database';
import { paginationSchema } from '@neon/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { AuditService } from '../services/audit';
import { checkRedisHealth } from '../services/redis';
import { getJobStatus, triggerJob } from '../jobs';

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
    const success = await triggerJob(req.params.name);

    res.json({
      success: true,
      data: { triggered: success },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

export { router as adminRouter };
