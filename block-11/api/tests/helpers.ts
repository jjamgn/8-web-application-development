import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SessionData } from 'express-session';
import { createApp } from '../src/app.js';
import type { Config } from '../src/config/env.js';
import type { UserRepository, SessionRepository, SessionRecord } from '../src/auth/ports.js';
import type { PhotoService } from '../src/integration.js';
import type { PhotoDto } from '../../contracts/index.js';
import type { PreparedPhoto } from '../src/types.js';
import { AppError, notFound } from '../src/errors.js';

// In-memory ports ONLY for controlled B tests. Never imported by src/ or server.ts.
export class TestSessions implements SessionRepository {
  rows = new Map<string, SessionRecord>();
  async read(sid: string) { const row = this.rows.get(sid); return row ? structuredClone(row) : null; }
  async create(row: SessionRecord) {
    if (this.rows.has(row.sid)) throw new Error('Duplicate session');
    this.rows.set(row.sid, structuredClone(row));
  }
  async updateActive(sid: string, data: SessionData, userId: string | null) {
    const row = this.rows.get(sid);
    if (!row || row.expiresAt.getTime() <= Date.now()) return false;
    row.data = JSON.parse(JSON.stringify(data)); row.userId = userId;
    return true;
  }
  async destroy(sid: string) { this.rows.delete(sid); }
}
export class TestUsers implements UserRepository {
  rows = new Map<string, { id: string; name: string; email: string; passwordHash: string }>();
  async byEmail(email: string) { return [...this.rows.values()].find(row => row.email === email) ?? null; }
  async byId(id: string) { const row = this.rows.get(id); return row ? { id: row.id, name: row.name } : null; }
  async create(data: { name: string; email: string; passwordHash: string }) {
    if (await this.byEmail(data.email)) throw Object.assign(new Error('Unique email'), { code: 'P2002' });
    const row = { ...data, id: randomUUID() }; this.rows.set(row.id, row); return { id: row.id, name: row.name };
  }
}
export class TestPhotos implements PhotoService {
  rows = new Map<string, PhotoDto>();
  prepared: PreparedPhoto[] = [];
  failNext = false;
  deletePending = false;
  constructor(private users: TestUsers) {}
  async publishPhoto(input: PreparedPhoto, actor: { userId: string }) {
    this.prepared.push(structuredClone(input));
    if (this.failNext) { this.failNext = false; throw new Error('Controlled persistence fault'); }
    const id = randomUUID();
    const photo: PhotoDto = { id, title: input.title, alt: input.alt, width: input.width, height: input.height,
      uploader: { ...(await this.users.byId(actor.userId))!, avatarUrl: null }, createdAt: new Date().toISOString(),
      variants: input.variants.map(v => ({ width: v.width, height: v.height, bytes: v.bytes, mime: v.mime,
        url: `/media/photos/${id}/${v.width}.webp` })) };
    this.rows.set(id, photo);
    await Promise.all(input.variants.map(v => rm(v.tempPath, { force: true })));
    return photo;
  }
  async listPhotos({ page, uploaderId }: { page: number; uploaderId?: string }) {
    const all = [...this.rows.values()].filter(p => !uploaderId || p.uploader.id === uploaderId).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { items: all.slice((page - 1) * 12, page * 12), page, pageSize: 12 as const, total: all.length, totalPages: Math.ceil(all.length / 12) };
  }
  async getPhoto(id: string) { const photo = this.rows.get(id); if (!photo) throw notFound(); return photo; }
  async deletePhoto(id: string, actor: { userId: string }): Promise<'DELETED' | 'DELETING'> {
    const photo = await this.getPhoto(id);
    if (photo.uploader.id !== actor.userId) throw new AppError('FORBIDDEN', 403, 'Forbidden');
    this.rows.delete(id); return this.deletePending ? 'DELETING' : 'DELETED';
  }
}
export async function testContext() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'block11-b-test-'));
  const config: Config = { DATABASE_URL: 'postgresql://test:test@localhost/block11_test', S3_ENDPOINT: 'http://127.0.0.1:8333',
    S3_REGION: 'us-east-1', S3_BUCKET: 'block11-test', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test', S3_FORCE_PATH_STYLE: 'true',
    UPLOAD_TMP_DIR: path.join(tempRoot, 'staging'), SESSION_SECRET: 'test-only-secret-at-least-32-bytes-long', APP_ORIGIN: 'http://localhost:5173',
    PORT: 3000, TRUST_PROXY_HOPS: 0, NODE_ENV: 'test' };
  const users = new TestUsers(), sessions = new TestSessions(), photos = new TestPhotos(users);
  const mediaRouter = Router().get('/public-test.webp', (_req, res) => res.type('image/webp').send('test-only'));
  const dependencies = { users, sessions, photos, mediaRouter };
  return { config, ...dependencies, app: createApp(config, dependencies), tempRoot,
    dispose: () => rm(tempRoot, { recursive: true, force: true }) };
}
export function padJpeg(jpeg: Buffer, target: number): Buffer {
  let remaining = target - jpeg.length;
  const comments: Buffer[] = [];
  while (remaining > 0) {
    let size = Math.min(65_537, remaining);
    if (remaining - size > 0 && remaining - size < 4) size -= 4;
    if (size < 4) throw new Error('Cannot encode JPEG padding shorter than four bytes');
    const segment = Buffer.alloc(size);
    segment[0] = 0xff; segment[1] = 0xfe; segment.writeUInt16BE(size - 2, 2);
    comments.push(segment); remaining -= size;
  }
  return Buffer.concat([jpeg.subarray(0,2), ...comments, jpeg.subarray(2)]);
}
