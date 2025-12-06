/**
 * Role Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { createRoleSchema } from '@neon/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { AuditService } from '../services/audit';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = await prisma.role.findMany({
      where: { orgId: req.orgId! },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ department: { rank: 'desc' } }, { rank: 'desc' }],
    });

    res.json({
      success: true,
      data: roles,
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createRoleSchema.parse(req.body);
    const role = await prisma.role.create({
      data: { ...data, orgId: req.orgId! },
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

router.patch('/:id', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: req.body,
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

router.delete('/:id', requirePermission('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.role.delete({ where: { id: req.params.id } });

    res.json({
      success: true,
      data: { message: 'Role deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

export { router as rolesRouter };
