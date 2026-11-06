import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import type { SessionData } from 'express-session';
import type { PrismaClient } from '@prisma/client';
import { PrismaSessionStore } from '../src/auth/session-store.js';
import { stubSession } from './helpers/prisma-session.js';

type StoredSession = SessionData & { _persistedSid?: string };

function fixture() {
  const db = { session: {} };
  const rows = stubSession(db);
  return { db: db as unknown as PrismaClient, rows };
}

function sessionData(): SessionData {
  const expiresAt = Date.now() + 60_000;
  return { cookie: { expires: new Date(expiresAt), originalMaxAge: 60_000, httpOnly: true }, userId: 7, passwordVersion: 0, absoluteExpiresAt: expiresAt } as SessionData;
}

const save = (store: PrismaSessionStore, sid: string, data: SessionData) => new Promise<void>((resolve, reject) => store.set(sid, data, error => error ? reject(error) : resolve()));
const load = (store: PrismaSessionStore, sid: string) => new Promise<SessionData | null | undefined>((resolve, reject) => store.get(sid, (error, data) => error ? reject(error) : resolve(data)));
const destroy = (store: PrismaSessionStore, sid: string) => new Promise<void>((resolve, reject) => store.destroy(sid, error => error ? reject(error) : resolve()));

test('a request loaded before logout cannot restore its destroyed authenticated session', async () => {
  const { db, rows } = fixture();
  const first = new PrismaSessionStore(db);
  await save(first, 'authenticated-session', sessionData());

  const serialized = await load(first, 'authenticated-session');
  assert.ok(serialized);
  const req = { sessionID: 'authenticated-session', sessionStore: first } as unknown as Request;
  const inFlight = first.createSession(req, serialized) as StoredSession;
  assert.equal(inFlight._persistedSid, 'authenticated-session', 'the marker must survive Express session reconstruction');

  // Logout can be served by another process/store after this request loaded.
  const restarted = new PrismaSessionStore(db);
  await destroy(restarted, 'authenticated-session');
  inFlight.csrf = 'changed-during-the-older-request@example.test';
  inFlight.cookie.expires = new Date(Date.now() + 120_000);
  await save(first, 'authenticated-session', inFlight);

  assert.equal(rows.size, 0, 'stale saves must not recreate a logged-out session');
  assert.equal(await load(restarted, 'authenticated-session'), null, 'the previous cookie must remain unusable');
});

test('a new session can be saved repeatedly without persisting the internal marker', async () => {
  const { db, rows } = fixture();
  const store = new PrismaSessionStore(db);
  const data = sessionData() as StoredSession;
  await save(store, 'fresh-session', data);
  assert.equal(data._persistedSid, 'fresh-session');
  assert.equal(Object.hasOwn(rows.get('fresh-session')!.sess, '_persistedSid'), false);

  // express-session can explicitly save before redirect and save again later.
  data.csrf = 'saved-again@example.test';
  await save(store, 'fresh-session', data);
  assert.equal(rows.size, 1);
  assert.equal(rows.get('fresh-session')!.userId, 7);
  assert.equal(rows.get('fresh-session')!.sess.csrf, data.csrf);
  assert.equal(Object.hasOwn(rows.get('fresh-session')!.sess, '_persistedSid'), false);
  assert.equal((await load(new PrismaSessionStore(db), 'fresh-session'))!.csrf, data.csrf);
});

test('an in-flight save cannot reactivate an expired persisted session', async () => {
  const { db, rows } = fixture();
  const store = new PrismaSessionStore(db);
  await save(store, 'expired-session', sessionData());
  const inFlight = await load(store, 'expired-session');
  assert.ok(inFlight);

  rows.get('expired-session')!.expiresAt = new Date(Date.now() - 1);
  inFlight.cookie.expires = new Date(Date.now() + 120_000);
  await save(store, 'expired-session', inFlight);

  assert.ok(rows.get('expired-session')!.expiresAt.getTime() < Date.now());
  assert.equal(await load(new PrismaSessionStore(db), 'expired-session'), null);
});
