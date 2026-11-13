import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AuthError } from './auth-errors.js';
import type { AuthUser } from './auth-services.js';

export const ACCESS_TTL_SECONDS = 600;
function config() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || secret === process.env.AUTH_TOKEN_SECRET) {
    throw new AuthError('AUTH_SERVICE_UNAVAILABLE');
  }
  return { key: new TextEncoder().encode(secret), issuer: process.env.JWT_ISSUER || 'bep-nha-api', audience: process.env.JWT_AUDIENCE || 'bep-nha-web' };
}

export async function signAccessToken(user: AuthUser, familyId: string) {
  const { key, issuer, audience } = config();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: familyId, pv: user.passwordVersion })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(String(user.id)).setJti(randomUUID())
    .setIssuedAt(now).setExpirationTime(now + ACCESS_TTL_SECONDS).setIssuer(issuer).setAudience(audience).sign(key);
}

export async function verifyAccessToken(token: string) {
  const { key, issuer, audience } = config();
  try {
    const { payload, protectedHeader } = await jwtVerify(token, key, {
      algorithms: ['HS256'], issuer, audience, maxTokenAge: ACCESS_TTL_SECONDS,
      requiredClaims: ['sub', 'jti', 'sid', 'pv', 'iat', 'exp', 'iss', 'aud'],
    });
    if (protectedHeader.typ !== 'JWT' || typeof payload.sub !== 'string' || !payload.sub
      || typeof payload.jti !== 'string' || !payload.jti || typeof payload.sid !== 'string' || !payload.sid
      || !Number.isSafeInteger(payload.pv) || (payload.pv as number) < 0
      || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
      || payload.exp! <= payload.iat! || payload.exp! - payload.iat! > ACCESS_TTL_SECONDS) throw new Error('Invalid claims');
    return { userId: payload.sub, familyId: payload.sid, passwordVersion: payload.pv as number };
  } catch { throw new AuthError('UNAUTHENTICATED'); }
}
