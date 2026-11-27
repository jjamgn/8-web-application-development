import {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand,
  DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand, GetBucketVersioningCommand,
} from '@aws-sdk/client-s3';
import { CHUNK_SIZE, type ObjectStorage, type ObjectEntry } from './types.js';
import { assertStorageKey } from './keys.js';
import { integrityError, storageError, PhotoError } from './errors.js';

export type S3StorageConfig = {
  endpoint: string; region: string; bucket: string; accessKeyId: string;
  secretAccessKey: string; forcePathStyle: boolean;
};
export function storageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3StorageConfig {
  const required = (key: string) => { const value = env[key]?.trim(); if (!value) throw new Error(`Missing ${key}`); return value; };
  const endpoint = required('S3_ENDPOINT');
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid S3_ENDPOINT');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]', 'seaweedfs'].includes(url.hostname)) throw new Error('Use HTTPS for remote S3 endpoint');
  if (env.S3_FORCE_PATH_STYLE !== undefined && !['true', 'false'].includes(env.S3_FORCE_PATH_STYLE)) throw new Error('Invalid S3_FORCE_PATH_STYLE');
  const bucket = required('S3_BUCKET');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid S3_BUCKET');
  return { endpoint, bucket, region: env.S3_REGION || 'us-east-1', accessKeyId: required('S3_ACCESS_KEY_ID'), secretAccessKey: required('S3_SECRET_ACCESS_KEY'), forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false' };
}
function isMissing(error: unknown): boolean {
  const item = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return ['NoSuchKey', 'NotFound'].includes(item?.name || '') || item?.$metadata?.httpStatusCode === 404;
}
export class S3ObjectStorage implements ObjectStorage {
  readonly client: S3Client;
  constructor(private readonly config: S3StorageConfig, client?: S3Client) {
    this.client = client ?? new S3Client({
      endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 3, requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  async put(key: string, body: Uint8Array, signal?: AbortSignal): Promise<void> {
    assertStorageKey(key);
    if (!body.byteLength || body.byteLength > CHUNK_SIZE) throw integrityError();
    try { await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentLength: body.byteLength, ContentType: 'application/octet-stream' }), { abortSignal: signal }); }
    catch { throw storageError(); }
  }
  async get(key: string, signal?: AbortSignal): Promise<Uint8Array> {
    assertStorageKey(key);
    let body: (AsyncIterable<Uint8Array> & { destroy?: () => void }) | undefined;
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { abortSignal: signal });
      body = result.Body as typeof body;
      if (!body || (result.ContentLength !== undefined && result.ContentLength > CHUNK_SIZE)) throw integrityError();
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const bytes of body) {
        signal?.throwIfAborted();
        size += bytes.length;
        if (size > CHUNK_SIZE) throw integrityError();
        chunks.push(Buffer.from(bytes));
      }
      return Buffer.concat(chunks, size);
    } catch (error) {
      body?.destroy?.();
      if (error instanceof PhotoError) throw error;
      if (isMissing(error)) throw integrityError();
      throw storageError();
    }
  }
  async delete(key: string): Promise<void> {
    assertStorageKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
      if (await this.head(key)) throw storageError();
    } catch (error) { if (error instanceof PhotoError) throw error; throw storageError(); }
  }
  async head(key: string): Promise<{ bytes: number } | null> {
    assertStorageKey(key);
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return { bytes: result.ContentLength ?? 0 };
    } catch (error) { if (isMissing(error)) return null; throw storageError(); }
  }
  async *list(): AsyncIterable<ObjectEntry> {
    let token: string | undefined;
    do {
      let result;
      try { result = await this.client.send(new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: 'photos/', ContinuationToken: token })); }
      catch { throw storageError(); }
      for (const item of result.Contents ?? []) if (item.Key && item.LastModified) yield { key: item.Key, lastModified: item.LastModified };
      if (result.IsTruncated && (!result.NextContinuationToken || result.NextContinuationToken === token)) throw storageError();
      token = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (token);
  }
  async check(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      const versioning = await this.client.send(new GetBucketVersioningCommand({ Bucket: this.config.bucket }));
      if (versioning.Status) throw new Error('Bucket versioning must never have been enabled for this baseline');
    } catch { throw storageError(); }
  }
  close(): void { this.client.destroy(); }
}
