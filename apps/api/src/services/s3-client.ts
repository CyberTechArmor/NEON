/**
 * The one place an S3Client is constructed.
 *
 * NEON talks to S3-compatible stores (Garage by default, and whatever an
 * organisation configures under Admin → Storage: MinIO, SeaweedFS, …), not
 * only AWS. Since @aws-sdk/client-s3 3.729 the SDK enables "flexible
 * checksums" by default (`requestChecksumCalculation: 'WHEN_REQUIRED'`).
 * For PutObject that means:
 *
 *   - a server-side upload is sent with an `x-amz-checksum-crc32` trailer /
 *     aws-chunked body, and
 *   - a PRESIGNED PUT URL gets `x-amz-checksum-crc32=…` and
 *     `x-amz-sdk-checksum-algorithm=CRC32` baked into its query string —
 *     computed over the EMPTY body the presigner sees.
 *
 * The browser then PUTs the real file to that URL (apps/web uploadWithPresign
 * sends only Content-Type), the store checks the body against the checksum
 * in the URL, and every non-empty upload fails with BadDigest ("The
 * Content-Md5 you specified did not match what we received"). This is what
 * broke uploads on both the default and the per-org storage path when the
 * caret range in package.json drifted from 3.470 to 3.946.
 *
 * `WHEN_REQUIRED` restores the pre-3.729 behaviour: checksums only for the
 * operations that mandate one (none NEON uses). The dependency is pinned to
 * an exact version in package.json so the default cannot move again without
 * a commit; `test/s3-presign.test.ts` is the regression test.
 */

import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

export interface S3ClientOptions {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** Applied to every client. Exported so the test can assert against the same object. */
export const S3_CHECKSUM_OPTIONS = {
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
} as const satisfies Pick<S3ClientConfig, 'requestChecksumCalculation' | 'responseChecksumValidation'>;

export function createS3Client(options: S3ClientOptions): S3Client {
  return new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
    forcePathStyle: options.forcePathStyle,
    ...S3_CHECKSUM_OPTIONS,
  });
}
