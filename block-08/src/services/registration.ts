import { type PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';
import { registrationSchema } from '../validation/registration.js';
import { hashPassword } from './password.js';

export class RegistrationError extends Error {
  constructor() { super('Chưa tạo được tài khoản. Vui lòng thử lại sau.'); this.name = 'RegistrationError'; }
}

export function createRegistrationService(options: { database?: Pick<PrismaClient, 'user'>; hash?: typeof hashPassword } = {}) {
  const database = options.database ?? prisma;
  const hash = options.hash ?? hashPassword;

  async function registerPendingAccount(input: unknown): Promise<number> {
    const values = registrationSchema.parse(input);
    const passwordHash = await hash(values.password);
    try {
      const user = await database.user.create({
        data: { email: values.email, passwordHash, role: 'viewer', status: 'pending', emailVerifiedAt: null },
        select: { id: true },
      });
      return user.id;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        try {
          const existing = await database.user.findUnique({ where: { email: values.email }, select: { id: true } });
          if (existing) return existing.id; // Preserve the existing password and account state.
        } catch { /* Report only the safe error below. */ }
      }
      throw new RegistrationError();
    }
  }
  return { registerPendingAccount };
}

export const { registerPendingAccount } = createRegistrationService();
