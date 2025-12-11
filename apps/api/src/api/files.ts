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

      // Check if S3 storage is available, try to reconnect if not
      if (!S3Service.isS3Available()) {
        const s3Status = S3Service.getS3Status();
        console.log('[files] S3 unavailable, attempting reconnection...');
        console.log('[files] S3 Config:', {
          endpoint: s3Status.config.endpoint,
          bucket: s3Status.config.bucket,
          region: s3Status.config.region,
          lastError: s3Status.lastError,
          lastHealthCheck: s3Status.lastHealthCheck,
        });

        // Try to reconnect before giving up
        const healthCheck = await S3Service.performHealthCheck();
        if (!healthCheck.success) {
          const errorMsg = S3Service.getS3ConnectionError();

          // Determine the type of error for better diagnostics
          let errorType = 'UNKNOWN';
          let suggestion = 'Check S3/MinIO service status';

          if (errorMsg?.includes('ECONNREFUSED')) {
            errorType = 'CONNECTION_REFUSED';
            suggestion = 'S3/MinIO service may not be running. Check if the service is started.';
          } else if (errorMsg?.includes('ENOTFOUND') || errorMsg?.includes('getaddrinfo')) {
            errorType = 'DNS_ERROR';
            suggestion = 'Cannot resolve S3 endpoint hostname. Check S3_ENDPOINT configuration.';
          } else if (errorMsg?.includes('timeout') || errorMsg?.includes('Timeout')) {
            errorType = 'TIMEOUT';
            suggestion = 'S3 service is not responding. Check network connectivity and firewall rules.';
          } else if (errorMsg?.includes('AccessDenied') || errorMsg?.includes('InvalidAccessKeyId')) {
            errorType = 'AUTH_ERROR';
            suggestion = 'Invalid S3 credentials. Check S3_ACCESS_KEY and S3_SECRET_KEY.';
          } else if (errorMsg?.includes('NoSuchBucket')) {
            errorType = 'BUCKET_NOT_FOUND';
            suggestion = `Bucket "${s3Status.config.bucket}" does not exist. Create it first.`;
          }

          console.error(`[files] S3 storage is not available after reconnection attempt`);
          console.error(`[files] Error Type: ${errorType}`);
          console.error(`[files] Error Message: ${errorMsg}`);
          console.error(`[files] Suggestion: ${suggestion}`);
          console.error(`[files] Endpoint: ${s3Status.config.endpoint}`);
          console.error(`[files] Bucket: ${s3Status.config.bucket}`);

          return res.status(503).json({
            success: false,
            error: {
              code: 'STORAGE_UNAVAILABLE',
              message: 'File storage is temporarily unavailable. Please try again later.',
              details: process.env.NODE_ENV === 'development' ? {
                errorType,
                errorMessage: errorMsg,
                suggestion,
                endpoint: s3Status.config.endpoint,
                bucket: s3Status.config.bucket,
              } : undefined,
            },
            meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
          });
        }
        console.log(`[files] S3 reconnection successful (latency: ${healthCheck.latencyMs}ms)`);
      }

      // Check user storage limit
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { storageUsed: true, storageLimit: true },
      });

      const org = await prisma.organization.findUnique({
        where: { id: req.orgId! },
        select: { storageUsed: true, storageLimit: true, maxFileSize: true, settings: true },
      });

      const maxFileSize = Number(org?.maxFileSize ?? config.files.maxFileSize);
      if (req.file.size > maxFileSize) {
        throw new FileTooLargeError(maxFileSize);
      }

      const effectiveLimit = user?.storageLimit ?? org?.storageLimit;
      if (effectiveLimit && (user?.storageUsed ?? 0n) + BigInt(req.file.size) > effectiveLimit) {
        throw new StorageLimitError();
      }

      // Upload to S3 (use org-specific storage if configured)
      const key = `${req.orgId}/${req.userId}/${Date.now()}-${req.file.originalname}`;

      // Try org-specific storage first, fall back to default
      let bucket: string;
      try {
        const result = await S3Service.uploadFileForOrg(req.orgId!, key, req.file.buffer, req.file.mimetype);
        bucket = result.bucket;
      } catch (s3Error: any) {
        // If org storage fails, try default storage
        console.warn(`[files] Org S3 upload failed, trying default: ${s3Error.message}`);
        try {
          await S3Service.uploadFile(config.s3.bucketMedia, key, req.file.buffer, req.file.mimetype);
          bucket = config.s3.bucketMedia;
        } catch (defaultError: any) {
          console.error(`[files] Default S3 upload also failed: ${defaultError.message}`);
          throw new Error(`Storage upload failed: ${defaultError.message}`);
        }
      }

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
          bucket,
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

      // Get signed URL for access (use org-specific if available)
      let url: string;
      try {
        url = await S3Service.getSignedUrlForOrg(req.orgId!, key);
      } catch {
        url = await S3Service.getSignedUrl(bucket, key);
      }

      return res.status(201).json({
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
      return next(error);
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
 * POST /files/presign
 * Generate a pre-signed URL for direct browser-to-S3 upload
 */
router.post('/presign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename, contentType, size, operation = 'put' } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'filename and contentType are required',
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Check if S3 storage is available, try to reconnect if not
    if (!S3Service.isS3Available()) {
      const s3Status = S3Service.getS3Status();
      console.log('[files/presign] S3 unavailable, attempting reconnection...');
      console.log('[files/presign] S3 Config:', {
        endpoint: s3Status.config.endpoint,
        bucket: s3Status.config.bucket,
        region: s3Status.config.region,
        lastError: s3Status.lastError,
      });

      const healthCheck = await S3Service.performHealthCheck();
      if (!healthCheck.success) {
        const errorMsg = S3Service.getS3ConnectionError();
        console.error(`[files/presign] S3 unavailable: ${errorMsg}`);
        return res.status(503).json({
          success: false,
          error: {
            code: 'STORAGE_UNAVAILABLE',
            message: 'File storage is temporarily unavailable. Please try again later.',
            details: process.env.NODE_ENV === 'development' ? {
              errorMessage: errorMsg,
              endpoint: s3Status.config.endpoint,
              bucket: s3Status.config.bucket,
            } : undefined,
          },
          meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
        });
      }
      console.log(`[files/presign] S3 reconnection successful (${healthCheck.latencyMs}ms)`);
    }

    // Check storage limits if size is provided
    if (size) {
      const org = await prisma.organization.findUnique({
        where: { id: req.orgId! },
        select: { maxFileSize: true, storageLimit: true, storageUsed: true },
      });

      const maxFileSize = Number(org?.maxFileSize ?? config.files.maxFileSize);
      if (size > maxFileSize) {
        throw new FileTooLargeError(maxFileSize);
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { storageLimit: true, storageUsed: true },
      });

      const effectiveLimit = user?.storageLimit ?? org?.storageLimit;
      if (effectiveLimit && (user?.storageUsed ?? 0n) + BigInt(size) > effectiveLimit) {
        throw new StorageLimitError();
      }
    }

    // Generate a unique key for the file
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${req.orgId}/${req.userId}/${Date.now()}-${sanitizedFilename}`;

    // Generate pre-signed URL based on operation
    let url: string;
    let bucket: string;

    if (operation === 'put') {
      const result = await S3Service.getUploadSignedUrlForOrg(req.orgId!, key, contentType, 900); // 15 min expiry
      url = result.url;
      bucket = result.bucket;
    } else if (operation === 'get') {
      url = await S3Service.getSignedUrlForOrg(req.orgId!, key, 3600); // 1 hour expiry
      bucket = config.s3.bucketMedia;
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OPERATION',
          message: 'operation must be "put" or "get"',
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    console.log(`[files/presign] Generated ${operation} URL for key: ${key}`);

    res.json({
      success: true,
      data: {
        url,
        key,
        bucket,
        expiresIn: operation === 'put' ? 900 : 3600,
      },
      meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /files/confirm
 * Confirm a direct upload and create the file record
 */
router.post('/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key, bucket, filename, contentType, size } = req.body;

    if (!key || !filename || !contentType || !size) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'key, filename, contentType, and size are required',
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Verify the file exists in S3
    const exists = await S3Service.fileExists(bucket || config.s3.bucketMedia, key);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found in storage. Upload may have failed.',
        },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    // Create file record
    const file = await prisma.file.create({
      data: {
        orgId: req.orgId!,
        uploadedBy: req.userId!,
        name: filename,
        mimeType: contentType,
        size: BigInt(size),
        bucket: bucket || config.s3.bucketMedia,
        key,
        thumbnailKey: null,
      },
    });

    // Update storage used
    await prisma.user.update({
      where: { id: req.userId! },
      data: { storageUsed: { increment: size } },
    });

    await prisma.organization.update({
      where: { id: req.orgId! },
      data: { storageUsed: { increment: size } },
    });

    // Get download URL
    let url: string;
    try {
      url = await S3Service.getSignedUrlForOrg(req.orgId!, key);
    } catch {
      url = await S3Service.getSignedUrl(bucket || config.s3.bucketMedia, key);
    }

    console.log(`[files/confirm] File confirmed: ${file.id} (${filename})`);

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
