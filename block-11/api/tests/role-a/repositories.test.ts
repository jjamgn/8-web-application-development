import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient, Prisma } from '@prisma/client';
import { PrismaSessionRepository, PrismaUserRepository } from '../../src/repositories/user-session-repository.js';

test('session repository never extends absolute expiry or resurrects a SID removed by logout', async () => {
  const rows = new Map<string, { sid: string; userId: string | null; data: Prisma.InputJsonObject; expiresAt: Date }>();
  const db = { session: {
    async create({ data }: { data: { sid: string; userId: string | null; data: Prisma.InputJsonObject; expiresAt: Date } }) { rows.set(data.sid, { ...data }); },
    async findFirst({ where }: { where: { sid: string; expiresAt: { gt: Date } } }) {
      const row = rows.get(where.sid); return row && row.expiresAt > where.expiresAt.gt ? row : null;
    },
    async updateMany({ where, data }: { where: { sid: string; expiresAt: { gt: Date } }; data: { data: Prisma.InputJsonObject; userId: string | null } }) {
      const row = rows.get(where.sid);
      if (!row || row.expiresAt <= where.expiresAt.gt) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
    async deleteMany({ where }: { where: { sid?: string; expiresAt?: { lte: Date } } }) {
      let count = 0;
      for (const [sid, row] of rows) if (where.sid === sid || (where.expiresAt && row.expiresAt <= where.expiresAt.lte)) { rows.delete(sid); count++; }
      return { count };
    },
  } } as unknown as PrismaClient;
  const repo = new PrismaSessionRepository(db);
  const now = new Date(), expiresAt = new Date(now.getTime() + 3600_000);
  await repo.create({ sid: 'new-session', userId: null, data: { csrfToken: 'test-only' }, expiresAt }, now);
  assert.ok(await repo.find('new-session', now));
  assert.equal(await repo.saveExisting('new-session', { changed: true }, null, now), true);
  assert.equal(rows.get('new-session')!.expiresAt, expiresAt);
  await repo.destroy('new-session');
  assert.equal(await repo.saveExisting('new-session', { stale: true }, null, now), false);
  assert.equal(await repo.find('new-session', now), null);
  await assert.rejects(repo.create({ sid: 'too-long', userId: null, data: {}, expiresAt: new Date(now.getTime() + 7200_001) }, now));
  await assert.rejects(repo.create({ sid: 'expired', userId: null, data: {}, expiresAt: now }, now));
});

test('user repository normalizes login/create email and exposes no passwordHash from public lookup', async () => {
  const calls: { method: string; args: unknown }[] = [];
  const db = { user: {
    async create(args: unknown) { calls.push({ method: 'create', args }); return { id: 'id', name: 'Name' }; },
    async findUnique(args: unknown) { calls.push({ method: 'findUnique', args }); return null; },
  } } as unknown as PrismaClient;
  const repo = new PrismaUserRepository(db);
  await repo.create({ name: ' Name ', email: ' A@Example.Test ', passwordHash: 'server-hash' });
  assert.deepEqual((calls[0].args as { data: unknown }).data, { name: 'Name', email: 'a@example.test', passwordHash: 'server-hash' });
  await repo.findForLogin(' A@Example.Test ');
  assert.deepEqual((calls[1].args as { where: unknown }).where, { email: 'a@example.test' });
  await repo.findPublic('id');
  assert.deepEqual((calls[2].args as { select: unknown }).select, { id: true, name: true });
});
