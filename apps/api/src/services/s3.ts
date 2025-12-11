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
  HeadBucketCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
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

// Connection state
let isS3Connected = false;
let lastConnectionError: string | null = null;
let lastHealthCheckTime: Date | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;

// Heartbeat configuration
const HEARTBEAT_INTERVAL_MS = 60000; // 60 seconds
const HEALTH_CHECK_TIMEOUT_MS = 10000; // 10 seconds for health check

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
 * Initialize and validate S3 connection at startup
 * Returns true if connection is successful, throws an error otherwise
 */
export async function initializeS3(): Promise<boolean> {
  console.log('[S3] Initializing S3 storage connection...');
  console.log(`[S3] Endpoint: ${config.s3.endpoint}`);
  console.log(`[S3] Region: ${config.s3.region}`);
  console.log(`[S3] Bucket: ${config.s3.bucketMedia}`);
  console.log(`[S3] Force Path Style: ${config.s3.forcePathStyle}`);

  try {
    const client = getClient();

    // Test connection by checking if the media bucket exists
    await client.send(new HeadBucketCommand({ Bucket: config.s3.bucketMedia }));

    isS3Connected = true;
    lastConnectionError = null;
    console.log('[S3] Successfully connected to S3 storage');
    console.log(`[S3] Media bucket "${config.s3.bucketMedia}" is accessible`);

    return true;
  } catch (error: any) {
    isS3Connected = false;
    lastConnectionError = error.message || 'Unknown S3 connection error';

    // Log detailed error for debugging
    console.error('[S3] Failed to connect to S3 storage');
    console.error(`[S3] Error: ${error.name}: ${error.message}`);

    if (error.name === 'NoSuchBucket') {
      console.error(`[S3] Bucket "${config.s3.bucketMedia}" does not exist. Please create it first.`);
    } else if (error.name === 'AccessDenied' || error.name === 'InvalidAccessKeyId') {
      console.error('[S3] Access denied. Check your S3_ACCESS_KEY and S3_SECRET_KEY.');
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error(`[S3] Cannot reach S3 endpoint at ${config.s3.endpoint}. Check S3_ENDPOINT configuration.`);
    }

    // Don't throw - allow server to start but S3 features will be degraded
    console.warn('[S3] S3 storage is not available. File uploads will fail until connection is restored.');
    return false;
  }
}

/**
 * Check if S3 is currently connected
 */
export function isS3Available(): boolean {
  return isS3Connected;
}

/**
 * Get the last S3 connection error
 */
export function getS3ConnectionError(): string | null {
  return lastConnectionError;
}

/**
 * Get the last health check time
 */
export function getLastHealthCheckTime(): Date | null {
  return lastHealthCheckTime;
}

/**
 * Get comprehensive S3 status information
 */
export function getS3Status(): {
  connected: boolean;
  lastError: string | null;
  lastHealthCheck: Date | null;
  config: {
    endpoint: string;
    bucket: string;
    region: string;
    forcePathStyle: boolean;
  };
} {
  return {
    connected: isS3Connected,
    lastError: lastConnectionError,
    lastHealthCheck: lastHealthCheckTime,
    config: {
      endpoint: config.s3.endpoint,
      bucket: config.s3.bucketMedia,
      region: config.s3.region,
      forcePathStyle: config.s3.forcePathStyle,
    },
  };
}

/**
 * Perform a health check on the S3 connection
 * Uses a lightweight ListObjectsV2 request with max-keys=1
 */
export async function performHealthCheck(): Promise<{
  success: boolean;
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const client = getClient();

    // Create a promise that times out
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT_MS);
    });

    // Perform a lightweight list operation with max-keys=1
    const checkPromise = client.send(
      new ListObjectsV2Command({
        Bucket: config.s3.bucketMedia,
        MaxKeys: 1,
      })
    );

    await Promise.race([checkPromise, timeoutPromise]);

    const latencyMs = Date.now() - startTime;
    lastHealthCheckTime = new Date();
    isS3Connected = true;
    lastConnectionError = null;

    return {
      success: true,
      latencyMs,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    isS3Connected = false;
    lastConnectionError = error.message || 'Unknown error';
    lastHealthCheckTime = new Date();

    console.warn(`[S3] Health check failed: ${error.message}`);

    return {
      success: false,
      latencyMs,
      error: error.message,
    };
  }
}

/**
 * Start the S3 heartbeat monitoring
 * Periodically checks S3 connection health
 */
export function startHeartbeat(): void {
  if (healthCheckInterval) {
    console.log('[S3] Heartbeat already running');
    return;
  }

  console.log(`[S3] Starting heartbeat with ${HEARTBEAT_INTERVAL_MS}ms interval`);

  // Perform initial health check
  performHealthCheck().then((result) => {
    if (result.success) {
      console.log(`[S3] Initial health check passed (${result.latencyMs}ms)`);
    } else {
      console.warn(`[S3] Initial health check failed: ${result.error}`);
    }
  });

  // Set up periodic health checks
  healthCheckInterval = setInterval(async () => {
    const result = await performHealthCheck();
    if (!result.success) {
      console.warn(`[S3] Heartbeat failed: ${result.error}`);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop the S3 heartbeat monitoring
 */
export function stopHeartbeat(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log('[S3] Heartbeat stopped');
  }
}

/**
 * Test connection to S3 with a specific configuration
 * Used for testing user-provided S3 settings before saving
 */
export async function testConnection(testConfig: S3Config): Promise<{
  success: boolean;
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const testClient = new S3Client({
      endpoint: testConfig.endpoint,
      region: testConfig.region,
      credentials: {
        accessKeyId: testConfig.accessKeyId,
        secretAccessKey: testConfig.secretAccessKey,
      },
      forcePathStyle: testConfig.forcePathStyle,
    });

    // Test with a lightweight operation
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection test timeout')), HEALTH_CHECK_TIMEOUT_MS);
    });

    const testPromise = testClient.send(
      new ListObjectsV2Command({
        Bucket: testConfig.bucket,
        MaxKeys: 1,
      })
    );

    await Promise.race([testPromise, timeoutPromise]);

    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      latencyMs,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;

    return {
      success: false,
      latencyMs,
      error: error.message || 'Connection failed',
    };
  }
}

/**
 * Retry an S3 operation with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Don't retry on client errors (4xx)
      if (error.$metadata?.httpStatusCode >= 400 && error.$metadata?.httpStatusCode < 500) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[S3] Operation failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Upload a file with retry logic
 */
export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string
): Promise<void> {
  if (!isS3Connected) {
    // Try to reconnect
    await initializeS3();
    if (!isS3Connected) {
      throw new Error(`S3 storage is not available: ${lastConnectionError || 'Unknown error'}`);
    }
  }

  const client = getClient();

  await withRetry(async () => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  });

  // Mark as connected after successful operation
  isS3Connected = true;
  lastConnectionError = null;
}

/**
 * Download a file with retry logic
 */
export async function downloadFile(
  bucket: string,
  key: string
): Promise<Buffer> {
  if (!isS3Connected) {
    // Try to reconnect
    await initializeS3();
    if (!isS3Connected) {
      throw new Error(`S3 storage is not available: ${lastConnectionError || 'Unknown error'}`);
    }
  }

  const client = getClient();

  return await withRetry(async () => {
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

    // Mark as connected after successful operation
    isS3Connected = true;
    lastConnectionError = null;

    return Buffer.concat(chunks);
  });
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
 * Copy a file using native S3 copy operation
 * The CopySource must be URL-encoded to handle special characters
 */
export async function copyFile(
  sourceBucket: string,
  sourceKey: string,
  destBucket: string,
  destKey: string
): Promise<void> {
  const client = getClient();

  // URL-encode the source key to handle special characters properly
  const encodedSourceKey = sourceKey.split('/').map(encodeURIComponent).join('/');

  await client.send(
    new CopyObjectCommand({
      Bucket: destBucket,
      Key: destKey,
      CopySource: `${sourceBucket}/${encodedSourceKey}`,
    })
  );
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
