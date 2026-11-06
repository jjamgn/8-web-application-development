import { type EmailVerification, type Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { sendMail, type MailMessage } from './mailer.js';
import { generateOtp, otpDigest, otpMatches, OTP_LOCK_MS, OTP_MAX_ATTEMPTS, OTP_RESEND_INTERVAL_MS, OTP_TTL_MS } from './otp.js';

export type VerificationErrorCode = 'OTP_CONFIG_INVALID' | 'OTP_NOT_PENDING' | 'OTP_COOLDOWN' | 'OTP_LOCKED' | 'OTP_EXPIRED' | 'OTP_INVALID' | 'OTP_USED' | 'OTP_CONFLICT' | 'OTP_UNAVAILABLE';

export class VerificationError extends Error {
  constructor(public readonly code: VerificationErrorCode, message: string, public readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'VerificationError';
  }
}

type TransactionRunner = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
export interface VerificationDependencies {
  transaction: TransactionRunner;
  deliver: (message: MailMessage) => Promise<void>;
  now: () => Date;
  nextCode: () => string;
}

function version(record: EmailVerification): Prisma.EmailVerificationWhereInput {
  return {
    userId: record.userId, otpHash: record.otpHash, lastSentAt: record.lastSentAt,
    expiresAt: record.expiresAt, attempts: record.attempts, lockedUntil: record.lockedUntil, usedAt: null,
  };
}

function remaining(until: Date, now: Date) { return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)); }
function conflict() { return new VerificationError('OTP_CONFLICT', 'Mã xác minh vừa thay đổi. Vui lòng thử lại với mã mới nhất.'); }

export function createEmailVerificationService(options: Partial<VerificationDependencies> = {}) {
  const transaction: TransactionRunner = options.transaction ?? (work => prisma.$transaction(work));
  const deliver = options.deliver ?? sendMail;
  const clock = options.now ?? (() => new Date());
  const nextCode = options.nextCode ?? generateOtp;

  function checkSecret() {
    try { otpDigest(0, '000000'); }
    catch { throw new VerificationError('OTP_CONFIG_INVALID', 'Cấu hình OTP_SECRET thiếu hoặc không hợp lệ.'); }
  }

  async function transact<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await transaction(work); }
    catch (error) {
      if (error instanceof VerificationError) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && ['P2002', 'P2034'].includes(String(error.code))) throw conflict();
      throw new VerificationError('OTP_UNAVAILABLE', 'Chưa xử lý được xác minh email. Vui lòng thử lại sau.');
    }
  }

  async function pendingUser(tx: Prisma.TransactionClient, userId: number) {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new VerificationError('OTP_NOT_PENDING', 'Vui lòng bắt đầu lại từ trang đăng ký.');
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, emailVerifiedAt: true, emailVerification: true },
    });
    if (!user || user.status !== 'pending' || user.emailVerifiedAt !== null) {
      throw new VerificationError('OTP_NOT_PENDING', 'Luồng xác minh không còn hiệu lực. Vui lòng quay lại trang đăng nhập hoặc đăng ký.');
    }
    return user;
  }

  async function requestVerificationEmail(userId: number): Promise<void> {
    checkSecret();
    const outgoing = await transact(async tx => {
      const now = clock();
      const user = await pendingUser(tx, userId);
      const previous = user.emailVerification;
      const resetCycle = Boolean(previous?.lockedUntil && previous.lockedUntil <= now);
      if (previous?.usedAt) throw new VerificationError('OTP_USED', 'Mã này đã được sử dụng.');
      if (previous?.lockedUntil && previous.lockedUntil > now) {
        throw new VerificationError('OTP_LOCKED', 'Xác minh đang tạm khóa. Vui lòng thử lại sau.', remaining(previous.lockedUntil, now));
      }
      if (previous && previous.attempts >= OTP_MAX_ATTEMPTS && !resetCycle) {
        throw new VerificationError('OTP_LOCKED', 'Đã hết số lần xác minh cho phép. Vui lòng thử lại sau.');
      }
      if (previous && now.getTime() - previous.lastSentAt.getTime() < OTP_RESEND_INTERVAL_MS) {
        throw new VerificationError('OTP_COOLDOWN', 'Vui lòng chờ trước khi yêu cầu mã mới.', remaining(new Date(previous.lastSentAt.getTime() + OTP_RESEND_INTERVAL_MS), now));
      }

      let code = nextCode();
      let hash = otpDigest(userId, code);
      // A resend must not reproduce the old six-digit value.
      for (let tries = 0; previous?.otpHash === hash && tries < 10; tries++) {
        code = nextCode(); hash = otpDigest(userId, code);
      }
      if (!/^\d{6}$/.test(code) || previous?.otpHash === hash) throw new VerificationError('OTP_UNAVAILABLE', 'Chưa tạo được mã mới. Vui lòng thử lại.');
      const data = {
        otpHash: hash, expiresAt: new Date(now.getTime() + OTP_TTL_MS), lastSentAt: now,
        attempts: resetCycle ? 0 : (previous?.attempts ?? 0), lockedUntil: null, usedAt: null,
      };
      if (previous) {
        const updated = await tx.emailVerification.updateMany({ where: version(previous), data });
        if (updated.count !== 1) throw conflict();
      } else await tx.emailVerification.create({ data: { userId, ...data } });
      return { email: user.email, code };
    });

    // SMTP is outside the transaction. Its failure leaves pending + cooldown intact.
    await deliver({
      to: outgoing.email,
      subject: 'Mã xác minh email · Bếp Nhà',
      text: `Mã xác minh email của bạn là ${outgoing.code}. Mã có hiệu lực 5 phút và chỉ dùng một lần. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.`,
    });
  }

  async function verifyEmailCode(userId: number, code: unknown): Promise<void> {
    checkSecret();
    const result = await transact(async tx => {
      const now = clock();
      const user = await pendingUser(tx, userId);
      const record = user.emailVerification;
      if (!record) return new VerificationError('OTP_EXPIRED', 'Chưa có mã xác minh. Vui lòng yêu cầu mã mới.');
      if (record.usedAt) return new VerificationError('OTP_USED', 'Mã xác minh đã được sử dụng.');
      if (record.lockedUntil && record.lockedUntil > now) {
        return new VerificationError('OTP_LOCKED', 'Xác minh đang tạm khóa. Vui lòng thử lại sau.', remaining(record.lockedUntil, now));
      }
      if (record.expiresAt <= now || record.attempts >= OTP_MAX_ATTEMPTS) {
        return new VerificationError('OTP_EXPIRED', 'Mã xác minh đã hết hiệu lực. Vui lòng yêu cầu mã mới.');
      }

      if (!otpMatches(userId, code, record.otpHash)) {
        const attempts = record.attempts + 1;
        const lockedUntil = attempts >= OTP_MAX_ATTEMPTS ? new Date(now.getTime() + OTP_LOCK_MS) : null;
        const updated = await tx.emailVerification.updateMany({ where: version(record), data: { attempts, lockedUntil } });
        if (updated.count !== 1) return conflict();
        // Return the error, then throw AFTER commit so the failed-attempt counter survives.
        return lockedUntil
          ? new VerificationError('OTP_LOCKED', 'Đã nhập sai 5 lần. Vui lòng chờ 15 phút rồi yêu cầu mã mới.', OTP_LOCK_MS / 1000)
          : new VerificationError('OTP_INVALID', 'Mã xác minh chưa đúng. Vui lòng kiểm tra lại.');
      }

      const consumed = await tx.emailVerification.updateMany({ where: version(record), data: { usedAt: now } });
      if (consumed.count !== 1) return conflict();
      const activated = await tx.user.updateMany({
        where: { id: userId, status: 'pending', emailVerifiedAt: null },
        data: { status: 'active', emailVerifiedAt: now },
      });
      if (activated.count !== 1) throw conflict();
      return null;
    });
    if (result) throw result;
  }

  return { requestVerificationEmail, verifyEmailCode };
}

export const { requestVerificationEmail, verifyEmailCode } = createEmailVerificationService();
