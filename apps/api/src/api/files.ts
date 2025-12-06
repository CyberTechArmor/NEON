/**
 * File Routes
 *
 * File upload, download, and management
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { prisma } from '@neon/database';
import { getConfig } from '@neon/config';
import { NotFoundError, FileTooLargeError, StorageLimitError } from '@neon/shared';
import { authenticate } from '../middleware/auth';
import * as S3Service from '../services/s3';

const config = getConfig();
const router = Router();
router.use(authenticate);

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.files.maxFileSize,
  },
});

/**
 * POST /files/upload
 * Upload a file
 */
router.post(
  '/upload',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new Error('No file provided');
      }

      // Check user storage limit
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { storageUsed: true, storageLimit: true },
      });

      const org = await prisma.organization.findUnique({
        where: { id: req.orgId! },
        select: { storageUsed: true, storageLimit: true, maxFileSize: true },
      });

      if (req.file.size > (org?.maxFileSize ?? config.files.maxFileSize)) {
        throw new FileTooLargeError(org?.maxFileSize ?? config.files.maxFileSize);
      }

      const effectiveLimit = user?.storageLimit ?? org?.storageLimit;
      if (effectiveLimit && (user?.storageUsed ?? 0n) + BigInt(req.file.size) > effectiveLimit) {
        throw new StorageLimitError();
      }

      // Upload to S3
      const key = `${req.orgId}/${req.userId}/${Date.now()}-${req.file.originalname}`;
      await S3Service.uploadFile(config.s3.bucketMedia, key, req.file.buffer, req.file.mimetype);

      // Generate thumbnail for images
      let thumbnailKey: string | null = null;
      if (req.file.mimetype.startsWith('image/')) {
        // TODO: Generate thumbnail
      }

      // Create file record
      const file = await prisma.file.create({
        data: {
          orgId: req.orgId!,
          uploadedBy: req.userId!,
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          size: BigInt(req.file.size),
          bucket: config.s3.bucketMedia,
          key,
          thumbnailKey,
        },
      });

      // Update storage used
      await prisma.user.update({
        where: { id: req.userId! },
        data: { storageUsed: { increment: req.file.size } },
      });

      await prisma.organization.update({
        where: { id: req.orgId! },
        data: { storageUsed: { increment: req.file.size } },
      });

      // Get signed URL for access
      const url = await S3Service.getSignedUrl(config.s3.bucketMedia, key);

      res.status(201).json({
        success: true,
        data: {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: Number(file.size),
          url,
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /files/:id
 * Get file info
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.file.findFirst({
      where: {
        id: req.params.id,
        orgId: req.orgId!,
        deletedAt: null,
      },
    });

    if (!file) {
      throw new NotFoundError('File', req.params.id);
    }

    const url = await S3Service.getSignedUrl(file.bucket, file.key);
    const thumbnailUrl = file.thumbnailKey
      ? await S3Service.getSignedUrl(file.bucket, file.thumbnailKey)
      : null;

    res.json({
      success: true,
      data: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: Number(file.size),
        url,
        thumbnailUrl,
        createdAt: file.createdAt,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /files/:id
 * Delete file (soft delete)
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.file.findFirst({
      where: {
        id: req.params.id,
        uploadedBy: req.userId!,
        deletedAt: null,
      },
    });

    if (!file) {
      throw new NotFoundError('File', req.params.id);
    }

    await prisma.file.update({
      where: { id: req.params.id },
      data: {
        deletedAt: new Date(),
        deletedBy: req.userId,
      },
    });

    // Update storage used
    await prisma.user.update({
      where: { id: req.userId! },
      data: { storageUsed: { decrement: file.size } },
    });

    await prisma.organization.update({
      where: { id: req.orgId! },
      data: { storageUsed: { decrement: file.size } },
    });

    res.json({
      success: true,
      data: { message: 'File deleted' },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

export { router as filesRouter };
