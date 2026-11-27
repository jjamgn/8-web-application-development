/** Opt-in: real dedicated Block 11 PostgreSQL + SeaweedFS, no migration/reset/seed. */
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createRoleARuntime } from '../../src/storage/runtime.js';
import { sha256 } from '../../src/storage/chunks.js';
import type { PreparedPhoto } from '../../src/storage/types.js';

async function main() {
  if (process.env.BLOCK11_LIVE_TEST !== 'yes') throw new Error('Explicit BLOCK11_LIVE_TEST=yes required for dedicated DB/bucket');
  const runtime = await createRoleARuntime();
  let userId: string | undefined, photoId: string | undefined;
  const staged: string[] = [];
  try {
    await runtime.storage.check();
    const user = await runtime.db.user.create({ data: { name: 'ROLE_A_LIVE_TEST', email: `role-a-${randomUUID()}@example.test`, passwordHash: 'test-only-no-login' } });
    userId = user.id;
    const input: PreparedPhoto = { title: 'ROLE_A_LIVE_TEST', alt: 'Fixture tự tạo', width: 1600, height: 1600, variants: [] };
    const pixels = randomBytes(1600 * 1600 * 3);
    const expected = new Map<number, string>();
    for (const width of [320, 960, 1600]) {
      const bytes = await sharp(pixels, { raw: { width: 1600, height: 1600, channels: 3 } }).resize(width).webp({ quality: 80 }).toBuffer();
      const tempPath = path.join(process.env.UPLOAD_TMP_DIR!, `role-a-${randomUUID()}.webp`);
      await writeFile(tempPath, bytes); staged.push(tempPath);
      input.variants.push({ width, height: width, tempPath, mime: 'image/webp', bytes: bytes.length });
      expected.set(width, sha256(bytes));
    }
    const photo = await runtime.service.publishPhoto(input, { userId }); photoId = photo.id;
    for (const variant of photo.variants) {
      const media = await runtime.service.assembleMedia(photo.id, variant.width);
      try { if (sha256(await readFile(media.filename)) !== expected.get(variant.width)) throw new Error('Readback mismatch'); }
      finally { await media.dispose(); }
    }
    const stored = await runtime.repository.find(photo.id);
    if (!stored || stored.variants.at(-1)!.chunkCount <= 1) throw new Error('Expected multi-part fixture');
    for (const variant of stored.variants) for (const chunk of variant.chunks) {
      if ((await runtime.storage.head(chunk.storageKey))?.bytes !== chunk.bytes) throw new Error('HEAD mismatch');
    }
    console.log(JSON.stringify({ phase: 'live-readback', photoId, chunkCounts: stored.variants.map(v => v.chunkCount), hashesMatched: true }));
    if (await runtime.service.deletePhoto(photo.id, { userId }) !== 'DELETED') throw new Error('Delete pending');
    for (const variant of stored.variants) for (const chunk of variant.chunks) if (await runtime.storage.head(chunk.storageKey)) throw new Error('Chunk survived deletion');
    photoId = undefined;
    console.log('LIVE_PUBLISH_ASSEMBLE_DELETE_OK');
  } finally {
    try {
      if (photoId && userId) await runtime.service.deletePhoto(photoId, { userId });
      if (userId && !(await runtime.db.photo.count({ where: { uploaderId: userId } }))) await runtime.db.user.delete({ where: { id: userId } });
      for (const filename of staged) await unlink(filename).catch(() => {});
    } finally { await runtime.close(); }
  }
}
main().catch(() => { console.error('LIVE_SMOKE_FAILED: inspect dedicated environment; no secrets logged'); process.exitCode = 1; });
