import type { RequestHandler } from 'express';
import { AuthError } from '../lib/auth-errors.js';
import { verifyAccessToken } from '../lib/auth-jwt.js';
import { liveSession, publicUser, type AuthServices } from '../lib/auth-services.js';

export function requireAuth(services: AuthServices): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(req.get('Authorization') || '');
    if (!match) throw new AuthError('UNAUTHENTICATED');
    const claims = await verifyAccessToken(match[1]);
    const session = await services.findAccessSession(claims.userId, claims.familyId);
    if (!session || !liveSession(session) || String(session.user.id) !== claims.userId
      || session.familyId !== claims.familyId || session.user.passwordVersion !== claims.passwordVersion) throw new AuthError('UNAUTHENTICATED');
    res.locals.authUser = publicUser(session.user);
    res.locals.authSession = { userId: claims.userId, familyId: claims.familyId, passwordVersion: claims.passwordVersion };
    next();
  };
}
