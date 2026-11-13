// CSR replacement for Block 8's session-bound SVG CAPTCHA; never creates a session.
import { AuthError } from '../../lib/auth-errors.js';

export async function verifyCaptcha(token: string, ip: string): Promise<void> {
  if (!token) throw new AuthError('CAPTCHA_REQUIRED');
  if (token.length > 2048) throw new AuthError('INVALID_CAPTCHA');
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const hosts = (process.env.TURNSTILE_ALLOWED_HOSTNAMES || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!secret || !hosts.length) throw new AuthError('AUTH_SERVICE_UNAVAILABLE');
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: ip }), signal: AbortSignal.timeout(10000),
    });
    const result = await response.json() as { success?: boolean; hostname?: string };
    if (!response.ok || result.success !== true || !result.hostname || !hosts.includes(result.hostname)) throw new Error('Invalid CAPTCHA');
  } catch { throw new AuthError('INVALID_CAPTCHA'); }
}
