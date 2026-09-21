/**
 * Regression test for the BadDigest upload failure.
 *
 * A browser upload is a presigned PUT: the API presigns PutObject against the
 * (public) endpoint of whichever store the organisation uses, and the browser
 * PUTs the file to that URL sending only Content-Type (apps/web
 * uploadWithPresign). With the SDK's flexible-checksum default the presigned
 * URL carries `x-amz-checksum-crc32` computed over an empty body, so the store
 * rejects every real file with BadDigest. This test performs that round trip
 * against a local endpoint and asserts the URL and the request carry no
 * checksum the body could fail to match.
 *
 * The endpoint is a local HTTP server standing in for Garage / MinIO /
 * SeaweedFS. It does not validate the SigV4 signature (it has no secret); it
 * records exactly what a store would see and answers like S3 does.
 */

import { createServer, type IncomingMessage, type Server } from 'node:http';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createS3Client, S3_CHECKSUM_OPTIONS } from '../src/services/s3-client';

interface SeenRequest {
  method: string;
  url: URL;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

let server: Server;
let endpoint: string;
const seen: SeenRequest[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({
        method: req.method ?? '',
        url: new URL(req.url ?? '/', endpoint),
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      res.setHeader('ETag', '"d41d8cd98f00b204e9800998ecf8427e"');
      res.statusCode = 200;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  endpoint = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function client() {
  return createS3Client({
    endpoint,
    region: 'garage',
    accessKeyId: 'GK0123456789abcdef',
    secretAccessKey: 'not-a-real-secret',
    forcePathStyle: true,
  });
}

const CHECKSUM_PARAMS = ['x-amz-checksum-crc32', 'x-amz-checksum-crc32c', 'x-amz-checksum-sha1', 'x-amz-checksum-sha256', 'x-amz-sdk-checksum-algorithm'];
const CHECKSUM_HEADERS = [...CHECKSUM_PARAMS, 'content-md5', 'x-amz-trailer'];

describe('S3 presigned PUT round trip', () => {
  it('opts out of flexible checksums on every client', () => {
    expect(S3_CHECKSUM_OPTIONS).toEqual({
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  });

  it('presigns a PUT the browser can complete with only Content-Type', async () => {
    const body = Buffer.from('PK\u0003\u0004 not really a docx, but not empty either');
    const contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const url = await getSignedUrl(
      client(),
      new PutObjectCommand({ Bucket: 'neon', Key: 'org/user/1-ProxyPilot_Identity_Plane.docx', ContentType: contentType }),
      { expiresIn: 900 }
    );

    // The URL itself: signed against our endpoint, path-style, and carrying no
    // checksum the body would have to match.
    const parsed = new URL(url);
    expect(parsed.origin).toBe(endpoint);
    expect(parsed.pathname).toBe('/neon/org/user/1-ProxyPilot_Identity_Plane.docx');
    for (const param of CHECKSUM_PARAMS) {
      expect(parsed.searchParams.has(param), `presigned URL must not carry ${param}`).toBe(false);
    }
    // Only `host` is signed, so the browser is free to send Content-Type and
    // nothing else — exactly what uploadWithPresign does.
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host');

    // The browser's side of the exchange.
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
    expect(response.status).toBe(200);

    const request = seen.at(-1)!;
    expect(request.method).toBe('PUT');
    expect(request.body.equals(body)).toBe(true);
    for (const header of CHECKSUM_HEADERS) {
      expect(request.headers[header], `request must not carry ${header}`).toBeUndefined();
    }
  });

  it('sends a server-side PutObject as a plain body with no checksum trailer', async () => {
    const body = Buffer.from('avatar bytes');

    await client().send(new PutObjectCommand({ Bucket: 'neon-media', Key: 'avatars/u.png', Body: body, ContentType: 'image/png' }));

    const request = seen.at(-1)!;
    expect(request.method).toBe('PUT');
    expect(request.url.pathname).toBe('/neon-media/avatars/u.png');
    expect(request.body.equals(body)).toBe(true);
    for (const header of CHECKSUM_HEADERS) {
      expect(request.headers[header], `request must not carry ${header}`).toBeUndefined();
    }
    expect(request.headers['content-encoding'] ?? '').not.toContain('aws-chunked');
  });
});
