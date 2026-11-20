import type { RequestHandler } from 'express';
import { prisma } from '../db.js';
import { canRead } from './policy.js';
export { canRead, canCreate, canEdit, canDelete } from './policy.js';

declare module 'express-session' { interface SessionData {
  mfaPendingUserId?: number; mfaPendingPasswordVersion?: number; mfaPendingExpiresAt?: number;
} }

export const forbidden = (res: import('express').Response) => res.status(403).render('error', {
  title: 'Không đủ quyền', message: 'Tài khoản của bạn không có quyền thực hiện thao tác này.'
});

export const requireFullSession: RequestHandler = async (req, res, next) => {
  if (res.locals.currentUser) return next();
  if (req.session.mfaPendingUserId && (req.session.mfaPendingExpiresAt || 0) > Date.now()) {
    const user = await prisma.user.findUnique({ where: { id: req.session.mfaPendingUserId } });
    if (user?.status === 'active' && user.emailVerifiedAt && user.passwordVersion === req.session.mfaPendingPasswordVersion)
      return res.redirect(303, '/auth/mfa');
  }
  return res.redirect(303, '/auth/login');
};
export const requireRead: RequestHandler = (_req, res, next) => canRead(res.locals.currentUser) ? next() : forbidden(res);

// Re-read status, role and password version on every request. Neither a role
// submitted in a form nor a stale role copied into the session grants access.
export const loadCurrentUser: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) return next();
  if ((req.session.absoluteExpiresAt || 0) <= Date.now()) return req.session.destroy(error => error ? next(error) : res.redirect(303, '/auth/login'));
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { id: true, name: true, email: true, emailVerifiedAt: true, status: true, role: true, chefId: true, passwordVersion: true } });
  if (user?.status === 'active' && user.emailVerifiedAt && user.passwordVersion === req.session.passwordVersion) {
    res.locals.currentUser = { ...user, name: user.name || user.email };
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
