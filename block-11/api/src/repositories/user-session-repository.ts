import { Prisma, type PrismaClient } from '@prisma/client';
import { PhotoError } from '../storage/errors.js';

export class PrismaUserRepository {
  constructor(private readonly db: PrismaClient) {}
  async create(input: { name: string; email: string; passwordHash: string }) {
    try {
      return await this.db.user.create({ data: { name: input.name.trim(), email: input.email.trim().toLowerCase(), passwordHash: input.passwordHash }, select: { id: true, name: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new PhotoError('EMAIL_ALREADY_EXISTS', 409, 'Email đã được đăng ký.');
      throw error;
    }
  }
  /** Server-only credential lookup; B must never serialize the returned hash. */
  findForLogin(email: string) {
    return this.db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, name: true, passwordHash: true } });
  }
  findPublic(id: string) { return this.db.user.findUnique({ where: { id }, select: { id: true, name: true } }); }
}

export type SessionRecord = { sid: string; userId: string | null; data: Prisma.InputJsonObject; expiresAt: Date };
/** B owns express-session Store callbacks; this repository provides explicit create vs existing-save. */
export class PrismaSessionRepository {
  constructor(private readonly db: PrismaClient) {}
  async find(sid: string, now = new Date()) {
    return this.db.session.findFirst({ where: { sid, expiresAt: { gt: now } } });
  }
  async create(record: SessionRecord, now = new Date()): Promise<void> {
    if (record.expiresAt <= now || record.expiresAt.getTime() > now.getTime() + 2 * 60 * 60 * 1000) throw new Error('Invalid absolute session expiry');
    await this.db.session.create({ data: record });
  }
  async saveExisting(sid: string, data: Prisma.InputJsonObject, userId: string | null, now = new Date()): Promise<boolean> {
    // Never upsert: a request loaded before logout must not resurrect the deleted SID.
    const result = await this.db.session.updateMany({ where: { sid, expiresAt: { gt: now } }, data: { data, userId } });
    return result.count === 1;
  }
  async destroy(sid: string): Promise<void> { await this.db.session.deleteMany({ where: { sid } }); }
  async removeExpired(now = new Date()): Promise<number> {
    return (await this.db.session.deleteMany({ where: { expiresAt: { lte: now } } })).count;
  }
  // Intentionally no touch extending expiresAt. Regenerate/login must use a new SID + create().
}
