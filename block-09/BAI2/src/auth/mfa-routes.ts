import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import {
  MFA_PENDING_TTL_MS, assertMfaConfiguration, disableMfa, enableMfa,
  mfaSetupQr, newMfaSecret, openMfaValue, regenerateRecoveryCodes,
  replaceMfaSecret, sealMfaValue, verifyMfaCredential,
  type MfaResult,
} from './mfa.js';

type FullUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;
const notice = (message: string) => `?notice=${encodeURIComponent(message)}`;

function renderSettings(res: Response, user: FullUser, status = 200, error = '', retryAfter = 0) {
  if (retryAfter) res.set('Retry-After', String(retryAfter));
  return res.status(status).render('auth/mfa-settings', {
    title: 'Bảo mật hai bước · Bếp Nhà', error, errors: {}, mfaEnabled: user.mfaEnabled,
  });
}

function resultError(res: Response, user: FullUser, result: MfaResult) {
  if (result.status === 'locked') return renderSettings(res, user, 429, 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau.', result.retryAfter);
  if (result.status === 'unavailable') return res.redirect(303, '/auth/login');
  return renderSettings(res, user, 400, 'Thông tin xác nhận không hợp lệ hoặc đã được sử dụng.');
}

function setupValid(req: Request, user: FullUser, mode: 'enable' | 'replace') {
  return req.session.mfaSetupMode === mode && req.session.mfaSetupUserId === user.id
    && req.session.mfaSetupPasswordVersion === user.passwordVersion
    && typeof req.session.mfaSetupExpiresAt === 'number' && req.session.mfaSetupExpiresAt > Date.now()
    && typeof req.session.mfaSetupSecretEncrypted === 'string';
}

function clearSetup(req: Request) {
  delete req.session.mfaSetupUserId;
  delete req.session.mfaSetupPasswordVersion;
  delete req.session.mfaSetupSecretEncrypted;
  delete req.session.mfaSetupExpiresAt;
  delete req.session.mfaSetupMode;
}

async function renderSetup(req: Request, res: Response, user: FullUser, mode: 'enable' | 'replace', status = 200, error = '', retryAfter = 0) {
  if (!setupValid(req, user, mode)) return res.redirect(303, '/auth/account/mfa');
  const manualSecret = openMfaValue(req.session.mfaSetupSecretEncrypted!);
  const { qrDataUrl } = await mfaSetupQr(manualSecret, user.email);
  if (retryAfter) res.set('Retry-After', String(retryAfter));
  return res.status(status).render('auth/mfa-setup', {
    title: mode === 'enable' ? 'Bật xác minh hai bước · Bếp Nhà' : 'Thay ứng dụng xác minh · Bếp Nhà',
    error, errors: {}, mode, manualSecret, qrDataUrl,
    confirmPath: mode === 'enable' ? '/auth/account/mfa/enable' : '/auth/account/mfa/replace/confirm',
  });
}

async function fullUser(req: Request): Promise<FullUser | null> {
  if (!req.session.userId || typeof req.session.passwordVersion !== 'number') return null;
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  return user?.status === 'active' && user.emailVerifiedAt && user.passwordVersion === req.session.passwordVersion ? user : null;
}

async function reauthenticate(req: Request, user: FullUser): Promise<MfaResult> {
  const password = req.body?.currentPassword;
  if (typeof password !== 'string' || !await bcrypt.compare(password, user.passwordHash)) return { status: 'invalid' };
  return verifyMfaCredential(user.id, user.email, req.body?.method, req.body?.code);
}

function putOneTimeCodes(req: Request, res: Response, codes: string[]) {
  req.session.mfaOneTimeCodesEncrypted = sealMfaValue(JSON.stringify(codes));
  req.session.save(error => {
    if (error) return res.status(500).render('error', { title: 'Chưa lưu được mã dự phòng', message: 'Vui lòng thử lại.' });
    return res.redirect(303, '/auth/account/mfa/recovery-codes');
  });
}

// Mounted after the common CSRF and demo-mode middleware in routes.ts.
export function createMfaAccountRouter(demo: boolean) {
  const router = Router();
  router.use('/account/mfa', (_req, res, next) => res.locals.currentUser ? next() : res.redirect(303, '/auth/login'));
  router.use('/account/mfa', (_req, _res, next) => { if (!demo) assertMfaConfiguration(); next(); });
  const ipLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).render('error', { title: 'Vui lòng thử lại sau', message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' }) });
  router.use('/account/mfa', (req, res, next) => req.method === 'POST' ? ipLimit(req, res, next) : next());

  router.get('/account/mfa', async (req, res) => {
    const user = await fullUser(req);
    return user ? renderSettings(res, user) : res.redirect(303, '/auth/login');
  });

  router.post('/account/mfa/setup', async (req, res) => {
    const user = await fullUser(req);
    if (!user) return res.redirect(303, '/auth/login');
    if (user.mfaEnabled) return renderSettings(res, user, 403, 'Xác minh hai bước đã được bật.');
    clearSetup(req);
    req.session.mfaSetupUserId = user.id;
    req.session.mfaSetupPasswordVersion = user.passwordVersion;
    req.session.mfaSetupSecretEncrypted = sealMfaValue(newMfaSecret());
    req.session.mfaSetupExpiresAt = Date.now() + MFA_PENDING_TTL_MS;
    req.session.mfaSetupMode = 'enable';
    req.session.save(error => error ? res.status(500).render('error', { title: 'Chưa lưu được thiết lập', message: 'Vui lòng thử lại.' }) : res.redirect(303, '/auth/account/mfa/setup'));
  });

  router.get('/account/mfa/setup', async (req, res) => {
    const user = await fullUser(req);
    if (!user) return res.redirect(303, '/auth/login');
    if (user.mfaEnabled) return res.redirect(303, '/auth/account/mfa');
    return renderSetup(req, res, user, 'enable');
  });

  router.post('/account/mfa/enable', async (req, res) => {
    const user = await fullUser(req);
    if (!user) return res.redirect(303, '/auth/login');
    if (!setupValid(req, user, 'enable') || user.mfaEnabled) return res.redirect(303, '/auth/account/mfa');
    const result = await enableMfa(user.id, user.passwordVersion, user.email, req.session.mfaSetupSecretEncrypted!, req.body?.code, req.sessionID);
    if (result.status === 'locked') return renderSetup(req, res, user, 'enable', 429, 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau.', result.retryAfter);
    if (result.status === 'invalid') return renderSetup(req, res, user, 'enable', 400, 'Mã xác minh không hợp lệ hoặc đã sử dụng.');
    if (result.status !== 'ok' || !result.codes) return res.redirect(303, '/auth/account/mfa');
    clearSetup(req);
    return putOneTimeCodes(req, res, result.codes);
  });

  router.get('/account/mfa/recovery-codes', async (req, res) => {
    const user = await fullUser(req);
    if (!user) return res.redirect(303, '/auth/login');
    const encrypted = req.session.mfaOneTimeCodesEncrypted;
    if (!encrypted) return res.redirect(303, '/auth/account/mfa');
    delete req.session.mfaOneTimeCodesEncrypted;
    const codes = JSON.parse(openMfaValue(encrypted)) as string[];
    return req.session.save(error => error
      ? res.status(500).render('error', { title: 'Chưa hiển thị được mã', message: 'Vui lòng thử lại.' })
      : res.status(200).render('auth/mfa-recovery-codes', { title: 'Mã dự phòng · Bếp Nhà', error: '', errors: {}, codes }));
  });

  router.post('/account/mfa/recovery/regenerate', async (req, res) => {
    const user = await fullUser(req);
    if (!user) return res.redirect(303, '/auth/login');
    if (!user.mfaEnabled) return renderSettings(res, user, 403, 'Bạn chưa bật xác minh hai bước.');
    const verified = await reauthenticate(req, user);
    if (verified.status !== 'ok') return resultError(res, user, verified);
    const codes = await regenerateRecoveryCodes(user.id, user.passwordVersion, req.sessionID);
    if (!codes) return res.redirect(303, '/auth/login');
    return putOneTimeCodes(req, res, codes);
  });

  router.post('/account/mfa/replace', async (req, res) => {
    const user = await fullUser(req);
    if (!user) return res.redirect(303, '/auth/login');
    if (!user.mfaEnabled) return renderSettings(res, user, 403, 'Bạn chưa bật xác minh hai bước.');
    const verified = await reauthenticate(req, user);
    if (verified.status !== 'ok') return resultError(res, user, verified);
    clearSetup(req);
    req.session.mfaSetupUserId = user.id;
    req.session.mfaSetupPasswordVersion = user.passwordVersion;
    req.session.mfaSetupSecretEncrypted = sealMfaValue(newMfaSecret());
    req.session.mfaSetupExpiresAt = Date.now() + MFA_PENDING_TTL_MS;
    req.session.mfaSetupMode = 'replace';
    req.session.save(error => error ? res.status(500).render('error', { title: 'Chưa lưu được thiết lập', message: 'Vui lòng thử lại.' }) : res.redirect(303, '/auth/account/mfa/replace'));
  });

  router.get('/account/mfa/replace', async (req, res) => {
    const user = await fullUser(req);
    if (!user) return res.redirect(303, '/auth/login');
    if (!user.mfaEnabled) return res.redirect(303, '/auth/account/mfa');
    return renderSetup(req, res, user, 'replace');
  });

  router.post('/account/mfa/replace/confirm', async (req, res) => {
    const user = await fullUser(req);
    if (!user) return res.redirect(303, '/auth/login');
    if (!setupValid(req, user, 'replace') || !user.mfaEnabled) return res.redirect(303, '/auth/account/mfa');
    const result = await replaceMfaSecret(user.id, user.passwordVersion, user.email, req.session.mfaSetupSecretEncrypted!, req.body?.code, req.sessionID);
    if (result.status === 'locked') return renderSetup(req, res, user, 'replace', 429, 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau.', result.retryAfter);
    if (result.status === 'invalid') return renderSetup(req, res, user, 'replace', 400, 'Mã xác minh không hợp lệ hoặc đã sử dụng.');
    if (result.status !== 'ok' || !result.codes) return res.redirect(303, '/auth/account/mfa');
    clearSetup(req);
    return putOneTimeCodes(req, res, result.codes);
  });

  router.post('/account/mfa/disable', async (req, res) => {
    const user = await fullUser(req);
    if (!user) return res.redirect(303, '/auth/login');
    if (!user.mfaEnabled) return renderSettings(res, user, 403, 'Bạn chưa bật xác minh hai bước.');
    const verified = await reauthenticate(req, user);
    if (verified.status !== 'ok') return resultError(res, user, verified);
    if (!await disableMfa(user.id, user.passwordVersion, req.sessionID)) return res.redirect(303, '/auth/login');
    clearSetup(req);
    delete req.session.mfaOneTimeCodesEncrypted;
    return res.redirect(303, `/auth/account/mfa${notice('Đã tắt xác minh hai bước.')}`);
  });
  return router;
}
