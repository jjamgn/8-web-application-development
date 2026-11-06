import { Store, type SessionData } from 'express-session';
import type { Prisma, PrismaClient } from '@prisma/client';

export type PrismaSessionStoreOptions = { ttlMs?: number };
type StoreCallback = (error?: unknown) => void;
type PersistedSessionData = SessionData & { _persistedSid?: string };

export class PrismaSessionStore extends Store {
  private readonly ttlMs: number;

  constructor(private readonly db: PrismaClient, options: PrismaSessionStoreOptions = {}) {
    super();
    this.ttlMs = options.ttlMs ?? 2 * 60 * 60 * 1000;
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs <= 0) throw new Error('Invalid session TTL');
  }

  override get(sid: string, callback: (error: unknown, data?: SessionData | null) => void): void {
    void Promise.resolve().then(async () => {
      const row = await this.db.session.findUnique({ where: { sid } });
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      // Return a detached value: express-session recreates Cookie and converts
      // its serialized expiry. The database expiry remains the upper bound.
      const data = JSON.parse(JSON.stringify(row.sess)) as Record<string, unknown>;
      const cookie = data.cookie;
      if (!cookie || typeof cookie !== 'object' || Array.isArray(cookie)) throw new Error('Invalid stored session');
      data.cookie = { ...cookie, expires: row.expiresAt.toISOString() };
      data.absoluteExpiresAt = row.expiresAt.getTime();
      // Store.createSession copies enumerable properties into the request's
      // Session. Keep this marker outside the persisted JSON payload.
      data._persistedSid = sid;
      return data as unknown as SessionData;
    }).then(data => callback(null, data), error => callback(error));
  }

  override set(sid: string, data: SessionData, callback?: StoreCallback): void {
    void Promise.resolve().then(async () => {
      // JSON roundtrip removes methods/undefined and serializes Cookie dates.
      const sess = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      const persisted = (data as PersistedSessionData)._persistedSid === sid;
      delete sess._persistedSid;
      const cookieExpiry: unknown = data.cookie?.expires;
      const cookieTime = cookieExpiry instanceof Date ? cookieExpiry.getTime()
        : typeof cookieExpiry === 'string' ? Date.parse(cookieExpiry) : Number.NaN;
      const absoluteExpiry = (data as SessionData & { absoluteExpiresAt?: unknown }).absoluteExpiresAt;
      const expiries = [Date.now() + this.ttlMs];
      if (Number.isFinite(cookieTime)) expiries.push(cookieTime);
      if (typeof absoluteExpiry === 'number' && Number.isFinite(absoluteExpiry) && absoluteExpiry > 0) expiries.push(absoluteExpiry);
      const expiresAt = new Date(Math.min(...expiries));
      const cookie = sess.cookie;
      if (!cookie || typeof cookie !== 'object' || Array.isArray(cookie)) throw new Error('Invalid session cookie');
      sess.cookie = { ...cookie, expires: expiresAt.toISOString() };
      sess.absoluteExpiresAt = expiresAt.getTime();
      const candidate: unknown = data.userId;
      const userId = typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
      const record = { sess: sess as Prisma.InputJsonObject, userId, expiresAt };
      if (persisted) {
        // A concurrent logout may already have removed this row. Updating only
        // existing, unexpired sessions prevents stale requests recreating it.
        await this.db.session.updateMany({ where: { sid, expiresAt: { gt: new Date() } }, data: record });
      } else {
        await this.db.session.create({ data: { sid, ...record } });
        (data as PersistedSessionData)._persistedSid = sid;
      }
    }).then(() => callback?.(), error => callback?.(error));
  }

  override destroy(sid: string, callback?: StoreCallback): void {
    void Promise.resolve().then(() => this.db.session.deleteMany({ where: { sid } }))
      .then(() => callback?.(), error => callback?.(error));
  }

  override touch(_sid: string, _data: SessionData, callback?: StoreCallback): void {
    // rolling=false: read-only requests retain the persisted absolute expiry.
    queueMicrotask(() => callback?.());
  }
}
