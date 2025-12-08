/**
 * S3 Service
 *
 * S3-compatible storage operations (Garage, MinIO, AWS S3)
 * Supports both environment-based config and per-org database config
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from '@neon/config';
import { prisma } from '@neon/database';

const config = getConfig();

// Cache for per-org S3 clients
const orgS3Clients = new Map<string, { client: S3Client; publicClient: S3Client; bucket: string }>();

// Default clients for environment-based config
let s3Client: S3Client | null = null;
let s3PublicClient: S3Client | null = null;

// S3 configuration interface for organization storage settings
export interface S3Config {
  enabled: boolean;
  provider?: string;
  endpoint: string;
  publicEndpoint?: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * Get S3 configuration for an organization from database settings
 * Falls back to environment config if not configured
 */
export async function getOrgS3Config(orgId: string): Promise<S3Config | null> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = org?.settings as Record<string, any> | undefined;
    const storage = settings?.storage;

    if (storage?.enabled && storage?.endpoint && storage?.bucket && storage?.accessKeyId && storage?.secretAccessKey) {
      return {
        enabled: true,
        provider: storage.provider || 'custom',
        endpoint: storage.endpoint,
        publicEndpoint: storage.publicUrl || storage.publicEndpoint,
        bucket: storage.bucket,
        region: storage.region || 'us-east-1',
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
        forcePathStyle: storage.forcePathStyle !== false,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get or create S3 client for an organization
 * Uses organization-specific settings if available, otherwise falls back to default
 */
export async function getOrgS3Client(orgId: string): Promise<{ client: S3Client; publicClient: S3Client; bucket: string } | null> {
  // Check cache first
  if (orgS3Clients.has(orgId)) {
    return orgS3Clients.get(orgId)!;
  }

  // Try to get org-specific config
  const orgConfig = await getOrgS3Config(orgId);

  if (orgConfig) {
    const client = new S3Client({
      endpoint: orgConfig.endpoint,
      region: orgConfig.region,
      credentials: {
        accessKeyId: orgConfig.accessKeyId,
        secretAccessKey: orgConfig.secretAccessKey,
      },
      forcePathStyle: orgConfig.forcePathStyle,
    });

    const publicEndpoint = orgConfig.publicEndpoint || orgConfig.endpoint;
    const publicClient = new S3Client({
      endpoint: publicEndpoint,
      region: orgConfig.region,
      credentials: {
        accessKeyId: orgConfig.accessKeyId,
        secretAccessKey: orgConfig.secretAccessKey,
      },
      forcePathStyle: orgConfig.forcePathStyle,
    });

    const result = { client, publicClient, bucket: orgConfig.bucket };
    orgS3Clients.set(orgId, result);
    return result;
  }

  return null;
}

/**
 * Clear cached S3 clients for an organization (call when settings change)
 */
export function clearOrgS3Cache(orgId: string): void {
  orgS3Clients.delete(orgId);
}

/**
 * Clear all org S3 caches
 */
export function clearAllOrgS3Cache(): void {
  orgS3Clients.clear();
}

/**
 * Get S3 client for internal API operations
 */
function getClient(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
      forcePathStyle: config.s3.forcePathStyle,
    });
  }
  return s3Client;
}

/**
 * Get S3 client configured for generating public pre-signed URLs
 * Uses publicEndpoint if configured, otherwise falls back to internal endpoint
 */
function getPublicClient(): S3Client {
  if (!s3PublicClient) {
    const publicEndpoint = config.s3.publicEndpoint || config.s3.endpoint;
    s3PublicClient = new S3Client({
      endpoint: publicEndpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
      forcePathStyle: config.s3.forcePathStyle,
    });
  }
  return s3PublicClient;
}

/**
 * Upload a file
 */
export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string
): Promise<void> {
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Download a file
 */
export async function downloadFile(
  bucket: string,
  key: string
): Promise<Buffer> {
  const client = getClient();

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Delete a file
 */
export async function deleteFile(bucket: string, key: string): Promise<void> {
  const client = getClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

/**
 * Check if a file exists
 */
export async function fileExists(bucket: string, key: string): Promise<boolean> {
  const client = getClient();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  bucket: string,
  key: string
): Promise<{
  size: number;
  contentType?: string;
  lastModified?: Date;
} | null> {
  const client = getClient();

  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    return {
      size: response.ContentLength ?? 0,
      contentType: response.ContentType,
      lastModified: response.LastModified,
    };
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'NotFound') {
      return null;
    }
    throw error;
  }
}

/**
 * List files in a prefix
 */
export async function listFiles(
  bucket: string,
  prefix: string,
  maxKeys = 1000
): Promise<
  Array<{
    key: string;
    size: number;
    lastModified?: Date;
  }>
> {
  const client = getClient();

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    })
  );

  return (response.Contents ?? []).map((item) => ({
    key: item.Key ?? '',
    size: item.Size ?? 0,
    lastModified: item.LastModified,
  }));
}

/**
 * Get a signed URL for downloading
 * Uses public endpoint for client-accessible URLs
 */
export async function getSignedUrl(
  bucket: string,
  key: string,
  expiresIn = 3600
): Promise<string> {
  const client = getPublicClient();

  return awsGetSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn }
  );
}

/**
 * Get a signed URL for uploading
 * Uses public endpoint for client-accessible URLs
 */
export async function getUploadSignedUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const client = getPublicClient();

  return awsGetSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

/**
 * Copy a file
 */
export async function copyFile(
  sourceBucket: string,
  sourceKey: string,
  destBucket: string,
  destKey: string
): Promise<void> {
  const data = await downloadFile(sourceBucket, sourceKey);
  const metadata = await getFileMetadata(sourceBucket, sourceKey);
  await uploadFile(destBucket, destKey, data, metadata?.contentType);
}

// =============================================================================
// Organization-aware S3 operations
// =============================================================================

/**
 * Upload a file using organization-specific S3 config if available
 */
export async function uploadFileForOrg(
  orgId: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string
): Promise<{ bucket: string }> {
  const orgClient = await getOrgS3Client(orgId);

  if (orgClient) {
    await orgClient.client.send(
      new PutObjectCommand({
        Bucket: orgClient.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return { bucket: orgClient.bucket };
  }

  // Fall back to default config
  await uploadFile(config.s3.bucketMedia, key, body, contentType);
  return { bucket: config.s3.bucketMedia };
}

/**
 * Get a signed URL for downloading using organization-specific S3 config
 */
export async function getSignedUrlForOrg(
  orgId: string,
  key: string,
  expiresIn = 3600
): Promise<string> {
  const orgClient = await getOrgS3Client(orgId);

  if (orgClient) {
    return awsGetSignedUrl(
      orgClient.publicClient,
      new GetObjectCommand({
        Bucket: orgClient.bucket,
        Key: key,
      }),
      { expiresIn }
    );
  }

  // Fall back to default config
  return getSignedUrl(config.s3.bucketMedia, key, expiresIn);
}

/**
 * Get a signed URL for uploading using organization-specific S3 config
 */
export async function getUploadSignedUrlForOrg(
  orgId: string,
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<{ url: string; bucket: string }> {
  const orgClient = await getOrgS3Client(orgId);

  if (orgClient) {
    const url = await awsGetSignedUrl(
      orgClient.publicClient,
      new PutObjectCommand({
        Bucket: orgClient.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn }
    );
    return { url, bucket: orgClient.bucket };
  }

  // Fall back to default config
  const url = await getUploadSignedUrl(config.s3.bucketMedia, key, contentType, expiresIn);
  return { url, bucket: config.s3.bucketMedia };
}
