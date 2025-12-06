/**
 * Organization Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { authenticate, requirePermission } from '../middleware/auth';

const router = Router();

router.use(authenticate);

/**
 * GET /organizations/current
 * Get current organization
 */
router.get('/current', async (req: Request, res: Response, next: NextFunction) => {
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
 * PATCH /organizations/current
 * Update current organization
 */
router.patch(
  '/current',
  requirePermission('org:edit_settings'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, logoUrl, primaryColor, maxFileSize, storageLimit } = req.body;

      const org = await prisma.organization.update({
        where: { id: req.orgId! },
        data: {
          name,
          logoUrl,
          primaryColor,
          maxFileSize,
          storageLimit,
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
  }
);

/**
 * GET /organizations/current/stats
 * Get organization statistics
 */
router.get(
  '/current/stats',
  requirePermission('org:view_settings'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [userCount, messageCount, meetingCount, storageUsed] = await Promise.all([
        prisma.user.count({ where: { orgId: req.orgId!, status: 'ACTIVE' } }),
        prisma.message.count({ where: { conversation: { orgId: req.orgId! } } }),
        prisma.meeting.count({ where: { orgId: req.orgId! } }),
        prisma.organization.findUnique({
          where: { id: req.orgId! },
          select: { storageUsed: true },
        }),
      ]);

      res.json({
        success: true,
        data: {
          users: userCount,
          messages: messageCount,
          meetings: meetingCount,
          storageUsed: storageUsed?.storageUsed ?? 0,
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as organizationsRouter };
