import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { canEdit, lockActor, lockDish } from '../src/auth/policy.js';

// No old migration is replayed on the live database. Some Block 8 migrations
// explicitly use public, so isolation uses a generated Block 8 main DDL fixture.
const migration = '202611200001_bai2_access_mfa';
const sql = readFileSync(`prisma/migrations/${migration}/migration.sql`, 'utf8');
const statements = (text: string) => text.split(';').map(x => x.trim()).filter(x => x && !['BEGIN', 'COMMIT'].includes(x));
const live = new PrismaClient();
const liveSchema = (new URL(process.env.DATABASE_URL!).searchParams.get('schema') || 'public').replace(/"/g, '""');
const schema = `b9b2_verify_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.DATABASE_URL!); url.searchParams.set('schema', schema);
const isolated = new PrismaClient({ datasourceUrl: url.toString() });
const report: Record<string, unknown> = { migration, sourceMain: '7b61a0fa152fb679be60d9a3b4ae30126725ca9c', timestamp: new Date().toISOString(), isolatedSchema: schema };
let stage = 'create-isolated-schema';
async function snapshot() {
  const users = await live.$queryRawUnsafe<any[]>(`SELECT to_jsonb(u) - ARRAY['chefId','mfaEnabled','mfaSecretEncrypted','mfaLastUsedStep'] AS value FROM "${liveSchema}"."User" u ORDER BY id`);
  const dishes = await live.$queryRawUnsafe<any[]>(`SELECT to_jsonb(d) - 'status' AS value FROM "${liveSchema}"."Dish" d ORDER BY id`);
  return { users: users.length, dishes: dishes.length, digest: createHash('sha256').update(JSON.stringify({ users, dishes })).digest('hex') };
}
try {
  await live.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  stage = 'baseline';
  await isolated.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    for (const statement of statements(readFileSync('tests/fixtures/block8-main.sql', 'utf8'))) await tx.$executeRawUnsafe(statement);
  }, { timeout: 60000 });
  // Old data must survive the additive migration and remain public by default.
  stage = 'old-data';
  await isolated.$executeRawUnsafe(`INSERT INTO "${schema}"."Chef" (id,name) VALUES (1,'isolated chef'),(2,'other chef')`);
  await isolated.$executeRawUnsafe(`INSERT INTO "${schema}"."User" (id,email,"passwordHash",role,status,"emailVerifiedAt","updatedAt") VALUES (1,'old@example.test','fixture','viewer','active',now(),now())`);
  await isolated.$executeRawUnsafe(`INSERT INTO "${schema}"."Dish" (id,name,description,price,category,"imagePath","chefId","updatedAt") VALUES (1,'old dish','fixture',1000,'Món chính','/images/beef.png',1,now())`);
  stage = 'isolated-migration';
  await isolated.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    for (const statement of statements(sql)) await tx.$executeRawUnsafe(statement);
  });
  assert.equal((await isolated.dish.findUniqueOrThrow({ where: { id: 1 } })).status, 'published');
  stage = 'isolated-policy';
  assert.equal((await isolated.user.findUniqueOrThrow({ where: { id: 1 } })).mfaEnabled, false);
  for (const query of [
    `UPDATE "${schema}"."User" SET role='owner' WHERE id=1`,
    `UPDATE "${schema}"."User" SET role='editor' WHERE id=1`,
    `UPDATE "${schema}"."User" SET "chefId"=1 WHERE id=1`,
    `UPDATE "${schema}"."Dish" SET status='hidden' WHERE id=1`
  ]) await assert.rejects(isolated.$executeRawUnsafe(query), (error: any) => error.meta?.code === '23514');
  stage = 'isolated-initialize-editor';
  await isolated.user.update({ where: { id: 1 }, data: { role: 'editor', chefId: 1 } });
  await isolated.dish.update({ where: { id: 1 }, data: { status: 'draft' } });
  let race = 0;
  for (const change of [
    () => isolated.user.update({ where: { id: 1 }, data: { role: 'viewer', chefId: null } }),
    () => isolated.user.update({ where: { id: 1 }, data: { chefId: 2 } }),
    () => isolated.dish.update({ where: { id: 1 }, data: { status: 'published' } }),
    () => isolated.dish.update({ where: { id: 1 }, data: { chefId: 2 } })
  ]) {
    stage = `isolated-race-${++race}`;
    await isolated.user.update({ where: { id: 1 }, data: { role: 'editor', chefId: 1 } });
    await isolated.dish.update({ where: { id: 1 }, data: { status: 'draft', chefId: 1 } });
    let locked!: () => void, release!: () => void;
    const ready = new Promise<void>(r => { locked = r; });
    const gate = new Promise<void>(r => { release = r; });
    const authorizedWrite = isolated.$transaction(async tx => {
      const actor = await lockActor(tx, 1, 0, schema), dish = await lockDish(tx, 1, schema);
      assert.equal(canEdit(actor, 'dishes', dish), true); locked(); await gate;
      await tx.dish.update({ where: { id: 1 }, data: { name: 'authorized write' } });
    }, { timeout: 10000 });
    await ready;
    let changed = false;
    const concurrent = change().then(() => { changed = true; });
    await new Promise(r => setTimeout(r, 150));
    assert.equal(changed, false, 'role/chef/status update must wait for authorization transaction');
    release(); await Promise.all([authorizedWrite, concurrent]);
    await isolated.$transaction(async tx => {
      const actor = await lockActor(tx, 1, 0, schema), dish = await lockDish(tx, 1, schema);
      assert.equal(canEdit(actor, 'dishes', dish), false, 'next PATCH observes changed policy');
    });
  }
  report.isolated = { passed: true, checks: ['old data/defaults', 'role/chef constraints', 'status constraint', '4 real PostgreSQL lock races'] };
  if (process.argv.includes('--deploy')) {
    stage = 'live-snapshot';
    const before = await snapshot();
    writeFileSync('docs/migration-before.json', JSON.stringify({ ...report, before, recovery: 'docs/A-HANDOFF.md' }, null, 2));
    stage = 'deploy';
    const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('DEPLOY_FAILED');
    const after = await snapshot();
    assert.deepEqual(after, before, 'all preexisting users, dishes and image paths must be unchanged');
    const applied = await live.$queryRawUnsafe<any[]>(`SELECT finished_at FROM "${liveSchema}"."_prisma_migrations" WHERE migration_name=$1 AND rolled_back_at IS NULL`, migration);
    assert.ok(applied[0]?.finished_at);
    report.live = { applied: true, before, after };
  } else report.live = { applied: false };
  writeFileSync('docs/migration-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch (error: any) {
  // Prisma errors can contain connection details; only print a safe error code.
  const relation = String(error.meta?.message || '').match(/relation "([A-Za-z0-9_.]+)" does not exist/)?.[1];
  console.error(JSON.stringify({ passed: false, stage, relation, sqlState: error.meta?.code, code: error.code || (error.message === 'DEPLOY_FAILED' ? 'DEPLOY_FAILED' : 'VERIFICATION_FAILED') }));
  process.exitCode = 1;
} finally {
  await isolated.$disconnect();
  await live.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => { console.error('Isolated schema cleanup failed.'); process.exitCode = 1; });
  await live.$disconnect();
}
