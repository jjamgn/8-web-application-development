import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

test('migration executes on embedded PostgreSQL, enforces FK/unique/hash/chunk constraints and transaction rollback', async () => {
  const db = new PGlite();
  try {
    const sql = await readFile(path.resolve('block-11/api/prisma/migrations/202611270001_photo_gallery/migration.sql'), 'utf8');
    await db.exec(sql);
    const user = '10000000-0000-4000-8000-000000000001';
    const photo = '10000000-0000-4000-8000-000000000002';
    const variant = '10000000-0000-4000-8000-000000000003';
    await db.query('INSERT INTO "User" (id,name,email,"passwordHash") VALUES ($1,$2,$3,$4)', [user, 'Uploader', 'a@example.test', 'hash-not-plaintext']);
    await assert.rejects(db.query('INSERT INTO "User" (id,name,email,"passwordHash") VALUES ($1,$2,$3,$4)', ['20000000-0000-4000-8000-000000000001', 'Another', 'a@example.test', 'hash']), /unique/i);
    await db.query('INSERT INTO "Photo" (id,"uploaderId",title,alt,width,height,"updatedAt") VALUES ($1,$2,$3,$4,200,100,now())', [photo, user, 'Photo', 'Alt']);
    await assert.rejects(db.query('DELETE FROM "User" WHERE id=$1', [user]), /foreign key/i);
    await db.query('INSERT INTO "PhotoVariant" (id,"photoId",width,height,bytes,sha256,"chunkCount","storagePrefix") VALUES ($1,$2,200,100,1048577,$3,2,$4)', [variant, photo, 'a'.repeat(64), `photos/${photo}/200/`]);
    await assert.rejects(db.query('UPDATE "PhotoVariant" SET "chunkCount"=1 WHERE id=$1', [variant]), /check constraint/i);
    await db.query('INSERT INTO "PhotoChunk" (id,"variantId","partNumber","offset",bytes,sha256,"storageKey") VALUES ($1,$2,1,0,1048576,$3,$4)', ['10000000-0000-4000-8000-000000000004', variant, 'b'.repeat(64), `photos/${photo}/200/000001.part`]);
    await assert.rejects(db.query('UPDATE "PhotoChunk" SET "offset"=1 WHERE "variantId"=$1', [variant]), /check constraint/i);
    await assert.rejects(db.query('UPDATE "PhotoChunk" SET sha256=$1', ['not-a-hash']), /check constraint/i);
    await assert.rejects(db.transaction(async tx => {
      await tx.query('UPDATE "Photo" SET status=\'DELETING\' WHERE id=$1', [photo]);
      await tx.query('UPDATE "Photo" SET width=0 WHERE id=$1', [photo]);
    }), /check constraint/i);
    assert.equal((await db.query<{ status: string }>('SELECT status FROM "Photo" WHERE id=$1', [photo])).rows[0].status, 'PUBLISHED');
    await db.query('DELETE FROM "Photo" WHERE id=$1', [photo]);
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM "PhotoChunk"')).rows[0].count, 0);
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM "PhotoVariant"')).rows[0].count, 0);
  } finally { await db.close(); }
});
