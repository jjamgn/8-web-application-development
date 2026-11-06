import type { RequestHandler } from 'express';
import { prisma } from '../db.js';

// Re-read status, role and password version on every request. Neither a role
// submitted in a form nor a stale role copied into the session grants access.
export const loadCurrentUser: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) return next();
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { id: true, name: true, email: true, emailVerifiedAt: true, status: true, role: true, passwordVersion: true } });
  if (user?.status === 'active' && user.emailVerifiedAt && user.passwordVersion === req.session.passwordVersion) {
    res.locals.currentUser = { id: user.id, name: user.name || user.email, email: user.email, emailVerifiedAt: user.emailVerifiedAt, status: user.status, role: user.role };
    res.locals.admin = user.role === 'admin';
    return next();
  }
  return req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('connect.sid', { path: '/' });
    // No new session is created or saved after revocation during this request.
    return res.redirect(303, '/auth/login');
  });
};

export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (!res.locals.currentUser) return res.redirect(303, '/auth/login');
  if (res.locals.currentUser.role !== 'admin') return res.status(403).render('error', { title: 'Chưa có quyền quản trị', message: 'Tài khoản của bạn chưa được cấp quyền quản trị. Vui lòng liên hệ người quản lý.' });
  return next();
};
