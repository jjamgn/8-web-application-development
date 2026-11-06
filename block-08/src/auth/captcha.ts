import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import type { Request } from 'express';
import { authClock } from './tokens.js';

export const captchaProvider = {
  create: () => svgCaptcha.create({ size: 6, noise: 4, color: true, background: '#f5f1e8', ignoreChars: '0oO1iIlL', width: 220, height: 70 }),
};
const hash = (value: string) => createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
// express-session gives concurrent requests independent snapshots. Burning a
// nonce synchronously also prevents two snapshots consuming the same image.
// This has the same single-process scope as this app's existing MemoryStore.
const consumed = new Map<string, number>();
function pruneConsumed() {
  const now = authClock.now().getTime();
  for (const [key, expiresAt] of consumed) if (expiresAt <= now) consumed.delete(key);
}

export function createCaptcha(req: Request) {
  const image = captchaProvider.create();
  pruneConsumed();
  req.session.captcha = { nonce: randomBytes(18).toString('hex'), hash: hash(image.text), expiresAt: authClock.now().getTime() + 5 * 60 * 1000 };
  return image.data;
}

export function consumeCaptcha(req: Request): boolean {
  const challenge = req.session.captcha;
  delete req.session.captcha;
  pruneConsumed();
  if (!challenge || challenge.expiresAt <= authClock.now().getTime()) return false;
  const key = `${req.sessionID}:${challenge.nonce}`;
  if (consumed.has(key)) return false;
  consumed.set(key, challenge.expiresAt);
  const answer = req.body?.captcha;
  return Boolean(typeof answer === 'string' && answer.length <= 20 &&
    timingSafeEqual(Buffer.from(hash(answer), 'hex'), Buffer.from(challenge.hash, 'hex')));
}
