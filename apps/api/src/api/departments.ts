/**
 * Department Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { createDepartmentSchema } from '@neon/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { AuditService } from '../services/audit';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const departments = await prisma.department.findMany({
      where: { orgId: req.orgId! },
      include: {
        roles: { select: { id: true, name: true, rank: true } },
        _count: { select: { users: true } },
      },
      orderBy: { rank: 'desc' },
    });

    res.json({
      success: true,
      data: departments,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createDepartmentSchema.parse(req.body);
    const department = await prisma.department.create({
      data: { ...data, orgId: req.orgId! },
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

router.patch('/:id', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: req.body,
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

router.delete('/:id', requirePermission('departments:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.department.delete({ where: { id: req.params.id } });

    res.json({
      success: true,
      data: { message: 'Department deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

export { router as departmentsRouter };
