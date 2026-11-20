import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { profileSchema, changePasswordSchema } from './validation.js';
import { authClock, authTransaction } from './tokens.js';

type Section = '' | 'profile' | 'password';
function render(req: Request, res: Response, status = 200, error = '', errors: Record<string, string[] | undefined> = {}, section: Section = '') {
  return res.status(status).render('auth/account', {
    title: 'Tài khoản quản trị · Bếp Nhà', error, errors, editSection: section,
    // Passwords must never be placed in locals or rendered back into HTML.
    values: { name: section === 'profile' && typeof req.body?.name === 'string' ? req.body.name.slice(0, 121) : res.locals.currentUser.name },
  });
}

// Mounted after the common CSRF/demo middleware and loadCurrentUser. Only
// the session's userId identifies the account; form IDs/roles are ignored.
export function createAccountRouter() {
  const router = Router();
  router.use('/account', (_req, res, next) => res.locals.currentUser ? next() : res.redirect(303, '/auth/login'));
  router.get('/account', (req, res) => render(req, res));
  router.post('/account/profile', async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return render(req, res, 400, 'Vui lòng kiểm tra họ tên.', parsed.error.flatten().fieldErrors, 'profile');
    const updated = await prisma.user.updateMany({
      where: { id: req.session.userId!, passwordVersion: req.session.passwordVersion, status: 'active', emailVerifiedAt: { not: null } },
      data: { name: parsed.data.name },
    });
    if (updated.count !== 1) return res.redirect(303, '/auth/login');
    return res.redirect(303, '/auth/account?notice=' + encodeURIComponent('Đã cập nhật họ tên của bạn.'));
  });
  const limited = (_req: Request, res: Response) => render(_req, res, 429, 'Bạn đã thử đổi mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút.', {}, 'password');
  const ipLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, handler: limited });
  const accountLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, keyGenerator: req => String(req.session.userId), standardHeaders: 'draft-7', legacyHeaders: false, handler: limited });
  router.post('/account/password', ipLimit, accountLimit, async (req, res, next) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return render(req, res, 400, 'Vui lòng kiểm tra các trường mật khẩu.', parsed.error.flatten().fieldErrors, 'password');
    const user = await prisma.user.findUnique({ where: { id: req.session.userId! } });
    if (!user || !await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)) return render(req, res, 400, 'Mật khẩu hiện tại chưa đúng.', { currentPassword: ['Mật khẩu hiện tại chưa đúng.'] }, 'password');
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const updated = await authTransaction(prisma, async tx => {
      // A concurrent reset, deactivation or another password change must win
      // over this request if it occurred after the current-password check.
      const changed = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash, passwordVersion: req.session.passwordVersion, status: 'active', emailVerifiedAt: { not: null } },
        data: { passwordHash, passwordVersion: { increment: 1 } },
      });
      if (changed.count !== 1) return false;
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: authClock.now() } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      return true;
    });
    if (!updated) return res.redirect(303, '/auth/login?notice=' + encodeURIComponent('Tài khoản đã thay đổi. Vui lòng đăng nhập lại.'));
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('connect.sid', { path: '/' });
      return res.redirect(303, '/auth/login?notice=' + encodeURIComponent('Đã đổi mật khẩu. Vui lòng đăng nhập lại trên các thiết bị.'));
    });
  });
  return router;
}
