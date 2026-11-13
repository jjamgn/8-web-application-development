import bcrypt from 'bcryptjs';
import { emailSchema, registerSchema } from '../../validation/auth.js';
import { verificationEmail } from './email.js';
import { checkCaptcha, type AuthContext, type CaptchaResult } from './types.js';
import {
  authTransaction, errorCode, HOUR_MS, MAX_OTP_ATTEMPTS, MAX_SENDS_PER_HOUR,
  newOtp, OTP_TTL_MS, RESEND_COOLDOWN_MS, sameHash, tokenHash,
} from './tokens.js';

// Generic results conceal unknown/active accounts, delivery failures and quotas.
export async function issueOtp(ctx: AuthContext, userId: number): Promise<void> {
  const otp = newOtp();
  const issued = await authTransaction(ctx.db, async tx => {
    const now = ctx.now();
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'pending' || user.emailVerifiedAt) return null;
    const previous = await tx.emailVerification.findUnique({ where: { userId } });
    if (previous && (previous.attempts >= MAX_OTP_ATTEMPTS ||
      now.getTime() - previous.lastSentAt.getTime() < RESEND_COOLDOWN_MS)) return null;
    const inWindow = previous && now.getTime() - previous.sendWindowStartedAt.getTime() < HOUR_MS;
    if (inWindow && previous.sendCount >= MAX_SENDS_PER_HOUR) return null;
    const data = {
      otpHash: tokenHash('EMAIL_VERIFICATION', otp, userId),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS), usedAt: null,
      attempts: previous?.attempts ?? 0, lastSentAt: now,
      sendWindowStartedAt: inWindow ? previous.sendWindowStartedAt : now,
      sendCount: inWindow ? previous.sendCount + 1 : 1,
    };
    await tx.emailVerification.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return { email: user.email, hash: data.otpHash };
  });
  if (!issued) return;
  try {
    await ctx.sendEmail(verificationEmail(issued.email, otp));
  } catch {
    // Match the issued hash: a late SMTP failure must not retire a newer OTP.
    await ctx.db.emailVerification.updateMany({
      where: { userId, otpHash: issued.hash, usedAt: null }, data: { usedAt: ctx.now() },
    });
  }
}

export async function register(ctx: AuthContext, input: unknown, ip?: string): Promise<{ kind: 'accepted' } | CaptchaResult> {
  const data = registerSchema.parse(input);
  const captcha = await checkCaptcha(ctx, data.captchaToken, ip);
  if (captcha) return captcha;
  const passwordHash = await bcrypt.hash(data.password, 12);
  let userId: number;
  try {
    const user = await ctx.db.user.create({ data: {
      name: data.name, email: data.email, passwordHash, status: 'pending', role: 'viewer',
    } });
    userId = user.id;
  } catch (error) {
    // Unique email is the only unique field accepted by this create operation.
    if (errorCode(error) !== 'P2002') throw error;
    return { kind: 'accepted' };
  }
  await issueOtp(ctx, userId);
  return { kind: 'accepted' };
}

export async function resendActivation(ctx: AuthContext, email: string): Promise<{ kind: 'accepted' }> {
  const normalized = emailSchema.parse(email);
  const user = await ctx.db.user.findUnique({ where: { email: normalized } });
  if (user) await issueOtp(ctx, user.id);
  return { kind: 'accepted' };
}

export async function activate(ctx: AuthContext, email: string, otp: string): Promise<{ kind: 'activated' | 'invalid' }> {
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) return { kind: 'invalid' };
  const success = await authTransaction(ctx.db, async tx => {
    const now = ctx.now();
    const user = await tx.user.findUnique({ where: { email: parsedEmail.data } });
    if (!user || user.status !== 'pending' || user.emailVerifiedAt) return false;
    const row = await tx.emailVerification.findUnique({ where: { userId: user.id } });
    if (!row || row.usedAt || row.expiresAt <= now || row.attempts >= MAX_OTP_ATTEMPTS) return false;
    if (!/^\d{6}$/.test(otp) || !sameHash(row.otpHash, tokenHash('EMAIL_VERIFICATION', otp, user.id))) {
      const attempts = row.attempts + 1;
      await tx.emailVerification.updateMany({
        where: { userId: user.id, otpHash: row.otpHash, usedAt: null, attempts: row.attempts },
        data: { attempts, ...(attempts >= MAX_OTP_ATTEMPTS ? { usedAt: now } : {}) },
      });
      // Return, do not throw: failed-attempt accounting must commit.
      return false;
    }
    const consumed = await tx.emailVerification.updateMany({
      where: { userId: user.id, otpHash: row.otpHash, usedAt: null, attempts: { lt: MAX_OTP_ATTEMPTS }, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: user.id }, data: { status: 'active', emailVerifiedAt: now } });
    return true;
  });
  return { kind: success ? 'activated' : 'invalid' };
}
