import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm, readdir, utimes, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { assembleVariant, planVariant, sha256 } from '../../src/storage/chunks.js';
import { CHUNK_SIZE, type PreparedPhoto } from '../../src/storage/types.js';
import { PhotoService } from '../../src/services/photo-service.js';
import { createMediaRouter } from '../../src/routes/media.js';
import { chunkKey } from '../../src/storage/keys.js';
import { MemoryRepository, MemoryStorage, actor } from './fakes.js';

async function setup(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'block11-a-test-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const repo = new MemoryRepository(), storage = new MemoryStorage();
  const service = new PhotoService(repo, storage, { tempRoot: root });
  const fixture = async (bytes = Buffer.from('verified-by-B-webp-fixture')): Promise<PreparedPhoto> => {
    const tempPath = path.join(root, `${randomUUID()}.webp`);
    await writeFile(tempPath, bytes);
    return { title: 'Ảnh', alt: 'Ảnh kiểm thử', width: 200, height: 100, variants: [{ tempPath, width: 200, height: 100, bytes: bytes.length, mime: 'image/webp' }] };
  };
  return { root, repo, storage, service, fixture };
}

for (const size of [1, CHUNK_SIZE, CHUNK_SIZE + 1, 2 * CHUNK_SIZE]) {
  test(`chunker exact boundary ${size} bytes`, async t => {
    const { root, storage, fixture } = await setup(t);
    const bytes = randomBytes(size), input = await fixture(bytes), id = randomUUID();
    const manifest = await planVariant(id, input.variants[0], root);
    assert.equal(manifest.chunks.length, Math.ceil(size / CHUNK_SIZE));
    assert.equal(manifest.chunks.reduce((n, c) => n + c.bytes, 0), size);
    for (const chunk of manifest.chunks) await storage.put(chunk.storageKey, bytes.subarray(chunk.offset, chunk.offset + chunk.bytes));
    const media = await assembleVariant(storage, id, manifest, root);
    assert.deepEqual(await readFile(media.filename), bytes);
    await media.dispose();
    assert.ok(manifest.chunks.every(c => c.bytes > 0 && c.bytes <= CHUNK_SIZE));
  });
}

test('publish records actor, hides internal manifest and cleans input; assembly produces a decodable >1MiB WebP', async t => {
  const { root, repo, storage, service } = await setup(t);
  const pixels = randomBytes(1600 * 1600 * 3);
  const input: PreparedPhoto = { title: 'Nhiễu kiểm thử', alt: 'Ảnh RGB ngẫu nhiên', width: 1600, height: 1600, variants: [] };
  let largest: Buffer = Buffer.alloc(0);
  for (const width of [320, 960, 1600]) {
    const bytes = await sharp(pixels, { raw: { width: 1600, height: 1600, channels: 3 } }).resize(width).webp({ quality: 80 }).toBuffer();
    const tempPath = path.join(root, `${width}.webp`); await writeFile(tempPath, bytes);
    input.variants.push({ tempPath, width, height: width, bytes: bytes.length, mime: 'image/webp' });
    if (width === 1600) largest = bytes;
  }
  assert.ok(largest.length > CHUNK_SIZE);
  const photo = await service.publishPhoto(input, actor);
  assert.equal(photo.uploader.id, actor.userId);
  assert.deepEqual(photo.variants.map(v => v.width), [320, 960, 1600]);
  assert.equal(JSON.stringify(photo).includes('storageKey'), false);
  assert.equal(JSON.stringify(photo).includes('password'), false);
  assert.ok([...storage.objects.keys()].every(k => k.endsWith('.part')));
  assert.ok(repo.photos.get(photo.id)!.variants.at(-1)!.chunkCount > 1);
  assert.deepEqual(await readdir(root), []);
  const media = await service.assembleMedia(photo.id, 1600);
  assert.equal(sha256(await readFile(media.filename)), sha256(largest));
  assert.equal((await sharp(await readFile(media.filename)).metadata()).format, 'webp');
  await media.dispose();
});

test('PUT failure rolls back every planned key and retains no Photo', async t => {
  const { service, storage, repo, fixture, root } = await setup(t);
  storage.failPutAt = 2;
  await assert.rejects(service.publishPhoto(await fixture(randomBytes(CHUNK_SIZE + 1)), actor), { code: 'PHOTO_SAVE_FAILED' });
  assert.equal(storage.objects.size, 0); assert.equal(repo.photos.size, 0);
  assert.ok([...repo.tasks.values()].every(task => task.status === 'DONE'));
  assert.deepEqual(await readdir(root), []);
});

test('journal failure prevents any S3 writes', async t => {
  const { service, storage, repo, fixture } = await setup(t); repo.failJournal = true;
  await assert.rejects(service.publishPhoto(await fixture(), actor));
  assert.equal(storage.putCalls, 0);
});

test('validation failure releases every safe staged variant before handing failure back to B', async t => {
  const { service, fixture, root, storage } = await setup(t);
  const input = await fixture();
  input.title = '   ';
  await assert.rejects(service.publishPhoto(input, actor), { code: 'PHOTO_SAVE_FAILED' });
  assert.deepEqual(await readdir(root), []);
  assert.equal(storage.putCalls, 0);
});

test('DB commit failure removes objects; lost response after successful commit preserves published data', async t => {
  const { service, storage, repo, fixture } = await setup(t); repo.failCommit = 'before';
  await assert.rejects(service.publishPhoto(await fixture(), actor));
  assert.equal(storage.objects.size, 0);
  repo.failCommit = 'after';
  const photo = await service.publishPhoto(await fixture(), actor);
  assert.equal((await service.getPhoto(photo.id)).id, photo.id);
  assert.equal(storage.objects.size, 1);
});

test('unknown DB outcome keeps objects and pending journal for maintenance', async t => {
  const { service, storage, repo, fixture } = await setup(t);
  repo.failCommit = 'before'; repo.failFind = true;
  await assert.rejects(service.publishPhoto(await fixture(), actor));
  assert.equal(storage.objects.size, 1);
  assert.equal([...repo.tasks.values()][0].status, 'PENDING');
  repo.failFind = false;
  assert.equal((await service.cleanupStorage()).failed, 0);
  assert.equal(storage.objects.size, 0);
});

test('failed rollback records pending retry; cleanup later removes all objects', async t => {
  const { service, storage, repo, fixture } = await setup(t);
  repo.failCommit = 'before'; storage.failDelete = true;
  await assert.rejects(service.publishPhoto(await fixture(), actor));
  assert.ok([...repo.tasks.values()].some(task => task.status === 'PENDING' && task.attempts > 0));
  storage.failDelete = false;
  assert.equal((await service.cleanupStorage()).pending, 0);
  assert.equal(storage.objects.size, 0);
});

test('owner-only delete, deferred deletion hidden from reads, maintenance completes it', async t => {
  const { service, storage, fixture, repo } = await setup(t);
  const photo = await service.publishPhoto(await fixture(), actor);
  await assert.rejects(service.deletePhoto(photo.id, { userId: '' }), { code: 'AUTH_REQUIRED' });
  await assert.rejects(service.deletePhoto(photo.id, { userId: randomUUID() }), { code: 'FORBIDDEN' });
  assert.equal(repo.photos.get(photo.id)!.status, 'PUBLISHED');
  storage.failDelete = true;
  assert.equal(await service.deletePhoto(photo.id, actor), 'DELETING');
  await assert.rejects(service.getPhoto(photo.id), { code: 'NOT_FOUND' });
  assert.equal((await service.listPhotos({ page: 1 })).total, 0);
  storage.failDelete = false; await service.cleanupStorage();
  assert.equal(storage.objects.size, 0); assert.equal(repo.photos.size, 0);
});

test('media route public success returns complete bytes/cache, ignores Range, and cleans assembled file', async t => {
  const { service, fixture, root } = await setup(t);
  const bytes = Buffer.from('RIFF-test-byte-for-byte');
  const photo = await service.publishPhoto(await fixture(bytes), actor);
  const app = express(); app.use('/media', createMediaRouter(service));
  const response = await request(app).get(photo.variants[0].url).set('Range', 'bytes=0-2').expect(200);
  assert.deepEqual(response.body, bytes);
  assert.equal(response.headers['content-type'], 'image/webp');
  assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(response.headers['accept-ranges'], undefined);
  // pipeline finalizers may finish one tick after the client receives the final byte.
  for (let i = 0; i < 20 && (await readdir(root)).length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(await readdir(root), []);
});

for (const fault of ['missing', 'corrupt', 'reordered', 'full-hash', 'outage'] as const) {
  test(`media ${fault} returns no-store before success headers`, async t => {
    const { service, storage, repo, fixture } = await setup(t);
    const photo = await service.publishPhoto(await fixture(randomBytes(CHUNK_SIZE + 1)), actor);
    const manifest = repo.photos.get(photo.id)!.variants[0];
    const key = manifest.chunks[0].storageKey;
    if (fault === 'missing') storage.objects.delete(key);
    if (fault === 'corrupt') storage.objects.set(key, Buffer.alloc(CHUNK_SIZE));
    if (fault === 'reordered') manifest.chunks.reverse();
    if (fault === 'full-hash') manifest.sha256 = '0'.repeat(64);
    if (fault === 'outage') storage.failGet = true;
    const app = express(); app.use('/media', createMediaRouter(service));
    const response = await request(app).get(photo.variants[0].url).expect(fault === 'outage' ? 503 : 502);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.error.code, fault === 'outage' ? 'STORAGE_UNAVAILABLE' : 'MEDIA_INTEGRITY_ERROR');
  });
}

test('aborted media assembly removes its partial staging directory', async t => {
  const { root, service, fixture } = await setup(t);
  const photo = await service.publishPhoto(await fixture(), actor);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(service.assembleMedia(photo.id, 200, abort.signal));
  assert.deepEqual(await readdir(root), []);
});

test('cleanup retains published keys/recent orphans, removes old orphans and only old temp files', async t => {
  const { root, service, storage, fixture } = await setup(t);
  const photo = await service.publishPhoto(await fixture(), actor);
  const oldOrphan = chunkKey(randomUUID(), 1, 1);
  await storage.put(oldOrphan, Buffer.from('old'));
  storage.lastModified = new Date(Date.now() - 25 * 3600_000);
  const old = path.join(root, 'old.tmp'), recent = path.join(root, 'recent.tmp');
  await writeFile(old, 'old'); await writeFile(recent, 'recent');
  await utimes(old, storage.lastModified, storage.lastModified);
  await service.cleanupStorage();
  assert.equal(storage.objects.has(oldOrphan), false);
  assert.equal(storage.objects.size, 1);
  assert.equal((await service.getPhoto(photo.id)).id, photo.id);
  assert.deepEqual(await readdir(root), ['recent.tmp']);
  const recentOrphan = chunkKey(randomUUID(), 1, 1);
  await storage.put(recentOrphan, Buffer.from('recent')); storage.lastModified = new Date();
  await service.cleanupStorage(); assert.equal(storage.objects.has(recentOrphan), true);
});

test('malicious temp path is not read or deleted; unknown variant and malformed id are 404', async t => {
  const { root, service, fixture } = await setup(t);
  const outer = await mkdtemp(path.join(os.tmpdir(), 'block11-outside-'));
  t.after(() => rm(outer, { recursive: true, force: true }));
  const outside = path.join(outer, 'keep.webp'); await writeFile(outside, 'keep');
  const input = await fixture(); input.variants[0].tempPath = outside;
  await assert.rejects(service.publishPhoto(input, actor));
  assert.equal(await readFile(outside, 'utf8'), 'keep');
  await assert.rejects(service.getPhoto('../bad'), { code: 'NOT_FOUND' });
  const valid = await service.publishPhoto(await fixture(), actor);
  await assert.rejects(service.assembleMedia(valid.id, 320), { code: 'NOT_FOUND' });
  await assert.rejects(service.listPhotos({ page: 0 }), { code: 'INVALID_QUERY' });
  assert.ok((await readdir(root)).every(name => !name.startsWith('media-')));
});
