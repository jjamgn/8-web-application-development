// Opt-in collection of sanitized live evidence. Never reset/migrate or modify existing users/photos.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import { createRoleARuntime } from '../src/storage/runtime.ts';
import { PhotoService } from '../src/services/photo-service.ts';
import { prepareImage } from '../src/images/prepare-image.ts';

if (process.env.BLOCK11_TECH_VERIFY !== '1') throw Error('Explicit BLOCK11_TECH_VERIFY=1 required.');
if (!new URL(process.env.DATABASE_URL).username.includes('swuswowkpsffkrvvyblo')) throw Error('Unexpected database project.');
const runtime = await createRoleARuntime();
const { db, storage, repository, service } = runtime;
const work = path.resolve('.runtime/technical-verification');
await mkdir(work, { recursive: true });
const runId = randomUUID(), base = 'http://localhost:5173', users = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { runId, time: new Date().toISOString(), origin: base, phases: {}, cleanup: null };
const checkpoint = async label => { await writeFile(path.join(work, 'results.json'), JSON.stringify(report, null, 2)); console.log('RECORDED ' + label); };
const snapshot = async () => db.photo.findMany({ select: { id: true, uploaderId: true, title: true, width: true, height: true, variants: { select: { id: true, sha256: true, chunkCount: true }, orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } });
const before = await snapshot();
const beforeUsers = await db.user.findMany({ select: { id: true, name: true, avatarPhotoId: true }, orderBy: { id: 'asc' } });
const allKeys = async () => { const keys = []; for await (const entry of storage.list()) keys.push(entry.key); return keys.sort(); };
const keysBefore = new Set(await allKeys());
function client() {
  let cookie = '', token = '';
  async function call(route, method = 'GET', data, expected = 200, endpoint = base) {
    const headers = {}; if (cookie) headers.Cookie = cookie;
    if (method !== 'GET') { headers.Origin = base; headers['X-CSRF-Token'] = token; }
    if (data && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(endpoint + route, { method, headers, body: data ? data instanceof FormData ? data : JSON.stringify(data) : undefined, signal: AbortSignal.timeout(120_000) });
    const sid = res.headers.getSetCookie().find(value => value.startsWith('block11.sid=')); if (sid) cookie = sid.split(';')[0];
    const body = res.status === 204 ? null : (res.headers.get('Content-Type') ?? '').includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, expected, method + ' ' + route + ' returned ' + (body?.error?.code ?? res.status));
    if (body?.data?.csrfToken) token = body.data.csrfToken;
    return { status: res.status, data: body?.data ?? body, headers: { contentType: res.headers.get('Content-Type'), cacheControl: res.headers.get('Cache-Control'), contentLength: res.headers.get('Content-Length') } };
  }
  return { call, login: async (email, password) => { await call('/api/auth/csrf'); return call('/api/auth/login', 'POST', { email, password }); } };
}
const a = client(), b = client(), guest = client();
function form(files) { const body = new FormData(); for (const f of files) body.append('photos', new Blob([f.bytes], { type: f.mime }), f.name); body.append('metadata', JSON.stringify(files.map(f => ({ title: f.title, alt: f.alt ?? 'Fixture kiểm chứng kỹ thuật' })))); return body; }
function padJpeg(bytes, target) {
  let remaining = target - bytes.length; const segments = [];
  while (remaining > 0) { let size = Math.min(65_537, remaining); if (remaining - size > 0 && remaining - size < 4) size -= 4; if (size < 4) throw Error('Invalid JPEG padding'); const segment = Buffer.alloc(size); segment[0] = 255; segment[1] = 254; segment.writeUInt16BE(size - 2, 2); segments.push(segment); remaining -= size; }
  return Buffer.concat([bytes.subarray(0, 2), ...segments, bytes.subarray(2)]);
}
async function rowSnapshot(photoId) {
  return db.photo.findUnique({ where: { id: photoId }, select: { id: true, uploaderId: true, title: true, alt: true, width: true, height: true, status: true,
    variants: { orderBy: { width: 'asc' }, select: { width: true, height: true, mime: true, bytes: true, sha256: true, chunkSize: true, chunkCount: true, storagePrefix: true,
      chunks: { orderBy: { partNumber: 'asc' }, select: { partNumber: true, offset: true, bytes: true, sha256: true, storageKey: true } } } } } });
}
try {
  const password = 'Aa!' + randomUUID();
  for (const label of ['a', 'b']) users.push(await db.user.create({ data: { name: 'TECH_VERIFY_' + label.toUpperCase(), email: 'verify-' + runId + '-' + label + '@example.test', passwordHash: await bcrypt.hash(password, 12) } }));
  await a.login(users[0].email, password); await b.login(users[1].email, password);
  const jpegPath = path.resolve('../docs/demo-assets/exif-gps/test-sideways-orientation6-gps.jpg');
  const jpeg = await readFile(jpegPath);
  const pixels = Buffer.alloc(1600 * 1200 * 4); let seed = 0x11b10c;
  for (let i = 0; i < pixels.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels[i] = seed & 255; }
  const png = await sharp(pixels, { raw: { width: 1600, height: 1200, channels: 4 } }).png().toBuffer();
  assert.ok(png.length <= 10_485_760);
  await writeFile(path.join(work, 'rgba-1600x1200.png'), png);
  report.fixtures = { jpeg: { name: path.basename(jpegPath), bytes: jpeg.length, sha256: hash(jpeg) }, png: { name: 'rgba-1600x1200.png', bytes: png.length, sha256: hash(png), seed: '0x11b10c', width: 1600, height: 1200, channels: 4 }, sourceExif: JSON.parse(execFileSync(process.execPath, ['scripts/inspect-image.mjs', jpegPath], { encoding: 'utf8' }))[0] };
  const files = [{ name: 'orientation6-gps.jpg', mime: 'image/jpeg', bytes: jpeg, title: 'VERIFY JPEG EXIF ' + runId }, { name: 'rgba.png', mime: 'image/png', bytes: png, title: 'VERIFY PNG ALPHA ' + runId }];
  const upload = await a.call('/api/photos', 'POST', form(files));
  assert.equal(upload.data.succeeded, 2); assert.equal(upload.data.failed, 0);
  report.phases.upload = { method: 'POST /api/photos', fileCount: 2, status: upload.status, response: upload.data, userA: users[0].id, userB: users[1].id };
  report.phases.database = []; report.phases.integrity = [];
  for (const item of upload.data.results) {
    const row = await rowSnapshot(item.photo.id); assert.equal(row.uploaderId, users[0].id); report.phases.database.push(row);
    for (const variant of row.variants) {
      const chunks = [], heads = [];
      for (const part of variant.chunks) { const head = await storage.head(part.storageKey); const bytes = await storage.get(part.storageKey); assert.equal(head?.bytes, part.bytes); assert.equal(hash(bytes), part.sha256); chunks.push(bytes); heads.push({ key: part.storageKey, headBytes: head.bytes, partHashMatched: true }); }
      const combined = Buffer.concat(chunks); assert.equal(combined.length, variant.bytes); assert.equal(hash(combined), variant.sha256);
      const media = await guest.call('/media/photos/' + row.id + '/' + variant.width + '.webp'); assert.equal(hash(media.data), variant.sha256);
      const meta = await sharp(media.data).metadata(); assert.equal(meta.format, 'webp'); assert.equal(meta.exif, undefined); assert.equal(meta.width, variant.width); assert.equal(meta.height, variant.height); assert.ok(meta.width <= row.width);
      report.phases.integrity.push({ photoId: row.id, width: meta.width, height: meta.height, bytes: media.data.length, expectedSha256: variant.sha256, actualSha256: hash(media.data), chunkCount: variant.chunkCount, hasExif: !!meta.exif, hasAlpha: !!meta.hasAlpha, headers: media.headers, heads });
    }
  }
  const pngRow = report.phases.database[1], jpegRow = report.phases.database[0];
  assert.ok(pngRow.variants.some(v => v.chunkCount > 1)); assert.equal(jpegRow.width, 1000); assert.equal(jpegRow.height, 600);
  assert.ok(report.phases.integrity.filter(v => v.photoId === pngRow.id).every(v => v.hasAlpha));
  await checkpoint('upload, DB, actual bucket objects, hashes, EXIF and alpha');

  const tooManyPixels = await sharp({ create: { width: 8001, height: 5000, channels: 3, background: '#448866' } }).jpeg().toBuffer();
  const bads = [
    { name: 'good.jpg', mime: 'image/jpeg', bytes: jpeg, title: 'VERIFY MIXED GOOD ' + runId },
    { name: 'fake.jpg', mime: 'image/jpeg', bytes: Buffer.from('plain text, not JPEG'), title: 'VERIFY BAD SIGNATURE ' + runId },
    { name: 'truncated.jpg', mime: 'image/jpeg', bytes: jpeg.subarray(0, Math.floor(jpeg.length / 2)), title: 'VERIFY BAD DECODE ' + runId },
    { name: 'over-10MiB.jpg', mime: 'image/jpeg', bytes: padJpeg(jpeg, 10_485_761), title: 'VERIFY BAD BYTES ' + runId },
    { name: 'over-40MP.jpg', mime: 'image/jpeg', bytes: tooManyPixels, title: 'VERIFY BAD PIXELS ' + runId },
  ];
  const mixed = await a.call('/api/photos', 'POST', form(bads)); assert.equal(mixed.data.succeeded, 1); assert.equal(mixed.data.failed, 4);
  assert.deepEqual(mixed.data.results.filter(r => !r.ok).map(r => r.error.code), ['UNSUPPORTED_IMAGE_TYPE', 'INVALID_IMAGE', 'FILE_TOO_LARGE', 'PIXEL_LIMIT_EXCEEDED']);
  const fixtureRows = await db.photo.findMany({ where: { uploaderId: users[0].id }, include: { variants: { include: { chunks: true } } } });
  const expectedKeys = fixtureRows.flatMap(p => p.variants.flatMap(v => v.chunks.map(c => c.storageKey))).sort();
  const newKeys = (await allKeys()).filter(k => !keysBefore.has(k)); assert.deepEqual(newKeys, expectedKeys);
  const rejectedRows = await db.photo.count({ where: { uploaderId: users[0].id, title: { in: bads.slice(1).map(f => f.title) } } }); assert.equal(rejectedRows, 0);
  report.phases.rejected = { fixtures: bads.map(f => ({ name: f.name, bytes: f.bytes.length, title: f.title })), status: mixed.status, response: mixed.data, rejectedRows, unexpectedObjectKeys: [], publishedPhotoCountForA: fixtureRows.length };
  await checkpoint('five-file mixed request and absence of rejected DB rows/orphan objects');

  const target = upload.data.results[0].photo;
  report.phases.permissions = {
    publicDetail: (await guest.call('/api/photos/' + target.id)).status,
    guestUpload: (await guest.call('/api/photos', 'POST', form([files[0]]), 401)).status,
    guestDelete: (await guest.call('/api/photos/' + target.id, 'DELETE', undefined, 401)).status,
    otherUserDelete: (await b.call('/api/photos/' + target.id, 'DELETE', undefined, 403)).status,
    uploaderIdMatchesSession: report.phases.database.every(p => p.uploaderId === users[0].id),
    exposedUploaderFields: Object.keys(target.uploader).sort(),
  };
  assert.deepEqual(report.phases.permissions.exposedUploaderFields, ['avatarUrl', 'id', 'name']);

  // Actual PUTs + actual PostgreSQL FK failure. Only this service instance receives the fault adapter.
  const stagedFile = path.join(process.env.UPLOAD_TMP_DIR, 'verify-fault-' + randomUUID() + '.jpg'); await writeFile(stagedFile, jpeg);
  const fault = { method: 'PhotoService with real Prisma/S3; invalid uploader FK only at commit', keys: [], databaseError: null, allObjectsExistedBeforeCommit: false };
  const faultyRepository = new Proxy(repository, { get(targetRepo, property) {
    if (property === 'commit') return async photo => {
      fault.photoId = photo.id; fault.keys = photo.variants.flatMap(v => v.chunks.map(c => c.storageKey));
      const objects = await Promise.all(fault.keys.map(key => storage.head(key))); fault.allObjectsExistedBeforeCommit = objects.every(Boolean); assert.ok(fault.allObjectsExistedBeforeCommit);
      try { return await repository.commit({ ...photo, uploaderId: randomUUID() }); }
      catch (e) { fault.databaseError = typeof e.code === 'string' ? e.code : 'UNKNOWN'; throw e; }
    };
    const value = Reflect.get(targetRepo, property); return typeof value === 'function' ? value.bind(targetRepo) : value;
  } });
  try {
    const prepared = await prepareImage({ tempPath: stagedFile, title: 'VERIFY DB FAILURE ' + runId, alt: 'Controlled DB rejection' });
    await new PhotoService(faultyRepository, storage, { tempRoot: process.env.UPLOAD_TMP_DIR }).publishPhoto(prepared, { userId: users[0].id });
    throw Error('Expected publication rejection');
  } catch (e) { assert.equal(e.code, 'PHOTO_SAVE_FAILED'); fault.serviceError = e.code; } finally { await unlink(stagedFile).catch(() => {}); }
  assert.equal(fault.databaseError, 'P2003');
  fault.photoRowAfter = await db.photo.count({ where: { id: fault.photoId } }); assert.equal(fault.photoRowAfter, 0);
  fault.remainingObjects = (await Promise.all(fault.keys.map(key => storage.head(key)))).filter(Boolean).length; assert.equal(fault.remainingObjects, 0);
  fault.journalStatuses = (await db.storageCleanupTask.findMany({ where: { storageKey: { in: fault.keys } }, select: { status: true } })).map(t => t.status);
  assert.ok(fault.journalStatuses.every(s => s === 'DONE')); report.phases.databaseFailure = fault;
  await checkpoint('real DB FK rejection after PUT and real object rollback');

  if (process.env.BLOCK11_VERIFY_RESTART_API === '1') {
    const endpoint = 'http://127.0.0.1:3001';
    let child;
    const startProbe = async () => {
      child = spawn(process.execPath, ['dist/api/src/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: '3001', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Probe API startup timeout')), 60_000);
        child.once('exit', () => { clearTimeout(timer); reject(Error('Probe API exited before ready')); });
        child.stderr.on('data', () => {});
        child.stdout.on('data', data => { if (data.toString().includes('Photo Gallery API:')) { clearTimeout(timer); resolve(); } });
      });
      return child.pid;
    };
    const stopProbe = async () => { if (child && child.exitCode === null) { const pending = new Promise(resolve => child.once('exit', resolve)); child.kill(); await pending; } child = undefined; };
    try {
      const firstPid = await startProbe();
      const firstDetail = await a.call('/api/photos/' + target.id, 'GET', undefined, 200, endpoint);
      const firstMedia = await guest.call(target.variants[0].url, 'GET', undefined, 200, endpoint);
      const firstSession = await a.call('/api/auth/me', 'GET', undefined, 200, endpoint);
      await stopProbe(); const nextPid = await startProbe(); assert.notEqual(firstPid, nextPid);
      const same = await a.call('/api/photos/' + target.id, 'GET', undefined, 200, endpoint);
      const me = await a.call('/api/auth/me', 'GET', undefined, 200, endpoint);
      const media = await guest.call(target.variants[0].url, 'GET', undefined, 200, endpoint);
      const expected = jpegRow.variants.find(v => v.width === target.variants[0].width);
      assert.equal(hash(media.data), expected.sha256); assert.equal(hash(firstMedia.data), hash(media.data)); assert.equal(me.data.user.id, users[0].id); assert.equal(firstSession.data.user.id, users[0].id);
      report.phases.restart = { apiActuallyRestarted: true, method: 'Two fresh compiled API processes at port 3001, same configuration/DB/bucket; main API left running', samePhotoId: same.data.id, beforeDetailStatus: firstDetail.status, detailStatus: same.status, sameMediaUrl: endpoint + target.variants[0].url, beforeMediaStatus: firstMedia.status, mediaStatus: media.status, sameMediaHash: hash(media.data) === expected.sha256, sameSessionUser: me.data.user.id === users[0].id, seaweedRestarted: false };
      await checkpoint('same photo URL, hash and DB session after real isolated Express restart');
    } finally { await stopProbe(); }
  }
} finally {
  try {
    report.phases.deleted = [];
    for (const user of users) {
      const rows = await db.photo.findMany({ where: { uploaderId: user.id }, include: { variants: { include: { chunks: true } } } });
      for (const row of rows) {
        const keys = row.variants.flatMap(v => v.chunks.map(c => c.storageKey));
        const outcome = await (user.id === users[0].id ? a : b).call('/api/photos/' + row.id, 'DELETE', undefined, 204);
        const detail = await guest.call('/api/photos/' + row.id, 'GET', undefined, 404);
        const media = await guest.call('/media/photos/' + row.id + '/' + row.variants[0].width + '.webp', 'GET', undefined, 404);
        const remainingObjects = (await Promise.all(keys.map(key => storage.head(key)))).filter(Boolean).length; assert.equal(remainingObjects, 0);
        assert.equal(await db.photo.count({ where: { id: row.id } }), 0);
        report.phases.deleted.push({ photoId: row.id, deleteStatus: outcome.status, newDetailStatus: detail.status, newMediaStatus: media.status, remainingPhotoRows: 0, remainingObjects, checkedKeys: keys });
      }
      await db.user.delete({ where: { id: user.id } });
    }
    const deletedIds = report.phases.deleted.map(p => p.photoId), deletedKeys = report.phases.deleted.flatMap(p => p.checkedKeys);
    const audit = await db.storageCleanupTask.groupBy({ by: ['status'], where: { storageKey: { in: [...deletedKeys, ...(report.phases.databaseFailure?.keys ?? [])] } }, _count: true });
    report.phases.postDeletionDB = { photoRows: await db.photo.count({ where: { id: { in: deletedIds } } }), variantRows: await db.photoVariant.count({ where: { photoId: { in: deletedIds } } }), chunkRows: await db.photoChunk.count({ where: { storageKey: { in: deletedKeys } } }), journal: audit.map(item => ({ status: item.status, count: item._count })), note: 'DONE cleanup journal retained; published fixture data and objects removed.' };
    assert.equal(report.phases.postDeletionDB.photoRows + report.phases.postDeletionDB.variantRows + report.phases.postDeletionDB.chunkRows, 0);
    const after = await snapshot(), afterUsers = await db.user.findMany({ select: { id: true, name: true, avatarPhotoId: true }, orderBy: { id: 'asc' } });
    const remainingNewKeys = (await allKeys()).filter(k => !keysBefore.has(k));
    report.cleanup = { ownFixtureAccountsRemoved: true, ownFixtureObjectsRemoved: remainingNewKeys.length === 0, originalPhotos: before.length, afterPhotos: after.length, originalPhotoManifestUnchanged: hash(JSON.stringify(before)) === hash(JSON.stringify(after)), originalUsers: beforeUsers.length, afterUsers: afterUsers.length, originalUsersUnchanged: JSON.stringify(beforeUsers) === JSON.stringify(afterUsers), remainingNewObjectKeys: remainingNewKeys };
    assert.ok(report.cleanup.originalPhotoManifestUnchanged && report.cleanup.originalUsersUnchanged && report.cleanup.ownFixtureObjectsRemoved);
    await checkpoint('owner deletion, HTTP 404, bucket cleanup and preservation of original data');
  } finally { await runtime.close(); await writeFile(path.join(work, 'results.json'), JSON.stringify(report, null, 2)); }
}
