/**
 * Feature Flags Routes
 *
 * Public (authenticated) endpoints for clients to fetch feature flags.
 * Admin endpoints are in admin.ts
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { getAllFeatureFlags } from '../services/featureFlags';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /features
 * Get all feature flags for the authenticated user's organization
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const flags = await getAllFeatureFlags(req.orgId!);

    res.json({
      success: true,
      data: { flags },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as featuresRouter };
