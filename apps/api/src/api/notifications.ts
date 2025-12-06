/**
 * Notification Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@neon/database';
import { paginationSchema } from '@neon/shared';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

/**
 * GET /notifications
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId: req.userId! } }),
      prisma.notification.count({ where: { userId: req.userId!, read: false } }),
    ]);

    res.json({
      success: true,
      data: notifications,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: skip + notifications.length < total, hasPrev: page > 1 },
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /notifications/:id/read
 */
router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true, readAt: new Date() },
    });

    res.json({ success: true, data: { message: 'Marked as read' }, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /notifications/read-all
 */
router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId!, read: false },
      data: { read: true, readAt: new Date() },
    });

    res.json({ success: true, data: { message: 'All marked as read' }, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /notifications/push-subscription
 */
router.post('/push-subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint, p256dh, auth } = req.body;

    await prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId: req.userId!, endpoint } },
      create: { userId: req.userId!, endpoint, p256dh, auth, userAgent: req.get('user-agent') },
      update: { p256dh, auth, userAgent: req.get('user-agent') },
    });

    res.json({ success: true, data: { message: 'Subscription saved' }, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
  } catch (error) {
    next(error);
  }
});

export { router as notificationsRouter };
