import { type Prisma, type PrismaClient } from '@prisma/client';
import { type MailMessage } from '../../src/services/mailer.js';
import { createEmailVerificationService } from '../../src/services/email-verification.js';

// In-memory transaction adapter for service/router tests, not a real PostgreSQL concurrency test.
export function registrationFixture(initialUser = true) {
  let users: any[] = initialUser ? [{ id: 1, email: 'pending@example.test', passwordHash: 'existing-hash', role: 'viewer', status: 'pending', emailVerifiedAt: null, createdAt: new Date() }] : [];
  let records: any[] = [];
  let instant = Date.parse('2026-11-06T08:00:00Z');
  let sequence = 100000;
  let queue = Promise.resolve();
  const messages: MailMessage[] = [];
  const controls = { mailFails: false, activationFails: false };
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => {
    if (value instanceof Date) return row[key] instanceof Date && row[key].getTime() === value.getTime();
    return row[key] === value;
  });
  const db = {
    user: {
      async findUnique({ where }: any) {
        const row = users.find(user => matches(user, where));
        return row ? structuredClone({ ...row, emailVerification: records.find(record => record.userId === row.id) ?? null }) : null;
      },
      async create({ data }: any) {
        if (users.some(user => user.email === data.email)) throw Object.assign(new Error(), { code: 'P2002' });
        const row = { id: Math.max(0, ...users.map(user => user.id)) + 1, role: 'viewer', status: 'pending', emailVerifiedAt: null, createdAt: new Date(instant), ...data };
        users.push(row); return structuredClone(row);
      },
      async updateMany({ where, data }: any) {
        if (controls.activationFails) return { count: 0 };
        const affected = users.filter(user => matches(user, where));
        affected.forEach(user => Object.assign(user, data)); return { count: affected.length };
      },
    },
    emailVerification: {
      async create({ data }: any) {
        if (records.some(record => record.userId === data.userId)) throw Object.assign(new Error(), { code: 'P2002' });
        const row = { usedAt: null, lockedUntil: null, attempts: 0, ...data };
        records.push(row); return structuredClone(row);
      },
      async updateMany({ where, data }: any) {
        const affected = records.filter(record => matches(record, where));
        affected.forEach(record => Object.assign(record, data)); return { count: affected.length };
      },
    },
    async $transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      let release!: () => void;
      const previous = queue;
      queue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const snapshot = structuredClone({ users, records });
      try { return await work(db as unknown as Prisma.TransactionClient); }
      catch (error) { users = snapshot.users; records = snapshot.records; throw error; }
      finally { release(); }
    },
  };
  const verification = createEmailVerificationService({
    transaction: work => db.$transaction(work),
    now: () => new Date(instant),
    nextCode: () => String(sequence++),
    deliver: async message => {
      if (controls.mailFails) throw new Error('Simulated SMTP failure.');
      messages.push(message);
    },
  });
  return {
    database: db as unknown as PrismaClient,
    verification, messages, controls,
    advance: (milliseconds: number) => { instant += milliseconds; },
    user: () => structuredClone(users[0]),
    record: () => structuredClone(records[0]),
    code: () => messages.at(-1)!.text.match(/\b\d{6}\b/)![0],
    users: () => structuredClone(users),
  };
}
