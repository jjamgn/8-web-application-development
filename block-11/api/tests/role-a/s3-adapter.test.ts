import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { S3Client } from '@aws-sdk/client-s3';
import { S3ObjectStorage, storageConfigFromEnv } from '../../src/storage/s3-storage.js';
import { chunkKey } from '../../src/storage/keys.js';
import { CHUNK_SIZE } from '../../src/storage/types.js';

const config = { endpoint: 'http://127.0.0.1:8333', region: 'us-east-1', bucket: 'block11-test', accessKeyId: 'test', secretAccessKey: 'test-only', forcePathStyle: true };
function adapter(send: (command: { constructor: { name: string }; input: Record<string, unknown> }) => Promise<unknown>) {
  return new S3ObjectStorage(config, { send, destroy() {} } as unknown as S3Client);
}
test('S3 adapter uses octet-stream and exact ContentLength; keys and chunk bounds are enforced', async () => {
  const calls: unknown[] = [];
  const storage = adapter(async command => { calls.push(command.input); return {}; });
  const key = chunkKey(randomUUID(), 320, 1);
  await storage.put(key, Buffer.from('abc'));
  assert.equal((calls[0] as Record<string, unknown>).ContentType, 'application/octet-stream');
  assert.equal((calls[0] as Record<string, unknown>).ContentLength, 3);
  await assert.rejects(storage.put('../outside', Buffer.from('x')), { code: 'INVALID_STORAGE_KEY' });
  await assert.rejects(storage.put(key, Buffer.alloc(CHUNK_SIZE + 1)), { code: 'MEDIA_INTEGRITY_ERROR' });
});
test('S3 listing consumes every continuation page and rejects a repeated token', async () => {
  let page = 0;
  const storage = adapter(async command => {
    page++;
    if (page === 1) return { Contents: [{ Key: 'photos/first', LastModified: new Date() }], IsTruncated: true, NextContinuationToken: 'second' };
    assert.equal(command.input.ContinuationToken, 'second');
    return { Contents: [{ Key: 'photos/second', LastModified: new Date() }], IsTruncated: false };
  });
  const keys: string[] = [];
  for await (const item of storage.list()) keys.push(item.key);
  assert.deepEqual(keys, ['photos/first', 'photos/second']);
  const repeating = adapter(async () => ({ IsTruncated: true, NextContinuationToken: 'same' }));
  await assert.rejects(async () => { for await (const _ of repeating.list()) {} }, { code: 'STORAGE_UNAVAILABLE' });
});
test('S3 missing part is integrity error; oversized body is bounded; timeout maps to 503', async () => {
  const key = chunkKey(randomUUID(), 1, 1);
  await assert.rejects(adapter(async () => { throw { name: 'NoSuchKey' }; }).get(key), { code: 'MEDIA_INTEGRITY_ERROR' });
  await assert.rejects(adapter(async () => ({ Body: Readable.from([Buffer.alloc(CHUNK_SIZE), Buffer.from('x')]) })).get(key), { code: 'MEDIA_INTEGRITY_ERROR' });
  await assert.rejects(adapter(async () => { throw new Error('contains credential-like private details'); }).get(key), { code: 'STORAGE_UNAVAILABLE' });
});
test('S3 bucket check rejects Enabled/Suspended versioning and delete verifies absence', async () => {
  for (const Status of ['Enabled', 'Suspended']) {
    await assert.rejects(adapter(async command => command.constructor.name === 'GetBucketVersioningCommand' ? { Status } : {}).check(), { code: 'STORAGE_UNAVAILABLE' });
  }
  const storage = adapter(async command => {
    if (command.constructor.name === 'HeadObjectCommand') throw { name: 'NotFound' };
    return {};
  });
  await storage.check(); await storage.delete(chunkKey(randomUUID(), 1, 1));
});
test('environment config rejects remote cleartext, credential URL and bad forcePathStyle', () => {
  const env = { S3_ENDPOINT: config.endpoint, S3_BUCKET: config.bucket, S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'y' };
  assert.equal(storageConfigFromEnv(env).forcePathStyle, true);
  assert.throws(() => storageConfigFromEnv({ ...env, S3_ENDPOINT: 'http://remote.example.test' }));
  assert.throws(() => storageConfigFromEnv({ ...env, S3_ENDPOINT: 'https://user:secret@example.test' }));
  assert.throws(() => storageConfigFromEnv({ ...env, S3_FORCE_PATH_STYLE: 'invalid' }));
});
