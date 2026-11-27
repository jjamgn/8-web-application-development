import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('social migration preserves photos, defaults kind and enforces relationships without duplicating images', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile('block-11/api/prisma/migrations/202611270001_photo_gallery/migration.sql', 'utf8'));
    const owner = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
    const photo = '10000000-0000-4000-8000-000000000003', collection = '10000000-0000-4000-8000-000000000004';
    for (const [id, email] of [[owner, 'a@example.test'], [other, 'b@example.test']]) await db.query('INSERT INTO "User"(id,name,email,"passwordHash") VALUES ($1,$2,$3,$4)', [id, 'User', email, 'test-hash']);
    await db.query('INSERT INTO "Photo"(id,"uploaderId",title,alt,width,height,"updatedAt") VALUES ($1,$2,$3,$4,100,100,now())', [photo, owner, 'Existing', 'Alt']);
    await db.exec(await readFile('block-11/api/prisma/migrations/202611270003_social_profiles/migration.sql', 'utf8'));
    assert.equal((await db.query<{ kind: string }>('SELECT kind FROM "Photo" WHERE id=$1', [photo])).rows[0].kind, 'PHOTO');
    await db.query('INSERT INTO "Favorite"("userId","photoId") VALUES ($1,$2)', [other, photo]);
    await assert.rejects(db.query('INSERT INTO "Favorite"("userId","photoId") VALUES ($1,$2)', [other, photo]), /unique/i);
    await assert.rejects(db.query('INSERT INTO "Follow"("followerId","followeeId") VALUES ($1,$1)', [owner]), /check constraint/i);
    await db.query('INSERT INTO "Follow"("followerId","followeeId") VALUES ($1,$2)', [other, owner]);
    await db.query('INSERT INTO "Collection"(id,"ownerId",title,"updatedAt") VALUES ($1,$2,$3,now())', [collection, other, 'Private']);
    await db.query('INSERT INTO "CollectionItem"("collectionId","photoId") VALUES ($1,$2)', [collection, photo]);
    await db.query('UPDATE "User" SET "avatarPhotoId"=$1 WHERE id=$2', [photo, owner]);
    await db.query('DELETE FROM "Collection" WHERE id=$1', [collection]);
    assert.equal((await db.query('SELECT id FROM "Photo"')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM "CollectionItem"')).rows.length, 0);
    const rls = await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname IN ('Favorite','Collection','CollectionItem','Follow')`);
    assert.equal(rls.rows.length, 4); assert.ok(rls.rows.every(r => r.relrowsecurity));
    await db.query('DELETE FROM "Photo" WHERE id=$1', [photo]);
    assert.equal((await db.query('SELECT * FROM "Favorite"')).rows.length, 0);
    assert.equal((await db.query<{ avatarPhotoId: null }>('SELECT "avatarPhotoId" FROM "User" WHERE id=$1', [owner])).rows[0].avatarPhotoId, null);
  } finally { await db.close(); }
});
