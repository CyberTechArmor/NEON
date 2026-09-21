/**
 * Set CORS on the NEON buckets so the browser can PUT/GET pre-signed URLs
 * against the public S3 host. Run inside the API image, which already carries
 * the AWS SDK and the S3 credentials:
 *
 *   docker compose run --rm -T api node - < scripts/put-bucket-cors.cjs
 *
 * Garage has no CLI verb for CORS; this goes through the S3 API instead.
 */
const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3');

const origin = process.env.NEON_PUBLIC_ORIGIN;
if (!origin) {
  console.error('NEON_PUBLIC_ORIGIN is not set');
  process.exit(1);
}

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'garage',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

const buckets = [
  process.env.S3_BUCKET_MEDIA,
  process.env.S3_BUCKET_RECORDINGS,
].filter(Boolean);

(async () => {
  for (const Bucket of buckets) {
    await client.send(
      new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [origin],
              AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      })
    );
    console.log(`[cors] ${Bucket} <- ${origin}`);
  }
})().catch((err) => {
  console.error(`[cors] failed: ${err.message}`);
  process.exit(1);
});
