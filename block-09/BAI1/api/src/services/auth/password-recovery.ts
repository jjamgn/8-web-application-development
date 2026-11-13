import bcrypt from 'bcryptjs';
import { forgotSchema, resetSchema } from '../../validation/auth.js';
import { resetEmail } from './email.js';
import { activeUser, checkCaptcha, type AuthContext, type CaptchaResult } from './types.js';
import { revokeUserFamilies } from './refresh.js';
import { authTransaction, HOUR_MS, MAX_SENDS_PER_HOUR, newResetToken, RESEND_COOLDOWN_MS, RESET_TTL_MS, tokenHash } from './tokens.js';

export async function requestPasswordReset(
  ctx: AuthContext, input: unknown, ip?: string,
): Promise<{ kind: 'accepted' } | CaptchaResult> {
  const data = forgotSchema.parse(input);
  const captcha = await checkCaptcha(ctx, data.captchaToken, ip);
  if (captcha) return captcha;
  const raw = newResetToken();
  const hash = tokenHash('PASSWORD_RESET', raw);
  const issued = await authTransaction(ctx.db, async tx => {
    const now = ctx.now();
    const user = await tx.user.findUnique({ where: { email: data.email } });
    if (!activeUser(user)) return null;
    const latest = await tx.passwordResetToken.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    const count = await tx.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } } });
    if ((latest && now.getTime() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) || count >= MAX_SENDS_PER_HOUR) return null;
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt: new Date(now.getTime() + RESET_TTL_MS), createdAt: now } });
    return user.email;
  });
  if (issued) {
    try { await ctx.sendEmail(resetEmail(issued, raw)); }
    catch {
      await ctx.db.passwordResetToken.updateMany({ where: { tokenHash: hash, usedAt: null }, data: { usedAt: ctx.now() } });
    }
  }
  return { kind: 'accepted' };
}

export async function resetPassword(ctx: AuthContext, input: unknown): Promise<{ kind: 'reset' | 'invalid' }> {
  const data = resetSchema.parse(input);
  if (!/^[a-f0-9]{64}$/.test(data.token)) return { kind: 'invalid' };
  const hash = tokenHash('PASSWORD_RESET', data.token);
  const candidate = await ctx.db.passwordResetToken.findUnique({ where: { tokenHash: hash } });
  if (!candidate || candidate.usedAt || candidate.expiresAt <= ctx.now()) return { kind: 'invalid' };
  const passwordHash = await bcrypt.hash(data.password, 12);
  const reset = await authTransaction(ctx.db, async tx => {
    const now = ctx.now();
    const row = await tx.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!row || row.usedAt || row.expiresAt <= now) return false;
    const user = await tx.user.findUnique({ where: { id: row.userId } });
    if (!activeUser(user)) return false;
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
    });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordVersion: { increment: 1 } } });
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await revokeUserFamilies(tx, user.id, now);
    return true;
  });
  return { kind: reset ? 'reset' : 'invalid' };
}
