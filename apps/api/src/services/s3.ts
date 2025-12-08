/**
 * S3 Service
 *
 * S3-compatible storage operations (Garage, MinIO, AWS S3)
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

const config = getConfig();

let s3Client: S3Client | null = null;
let s3PublicClient: S3Client | null = null;

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
