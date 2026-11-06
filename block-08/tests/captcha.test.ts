import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { createCaptcha, consumeCaptcha, captchaProvider } from '../src/auth/captcha.js';

test('one CAPTCHA cannot be consumed by two concurrent session snapshots', () => {
  const original = captchaProvider.create;
  captchaProvider.create = () => ({ text: 'ABC234', data: '<svg></svg>' });
  try {
    const issuer = { sessionID: 'same-session', session: {} } as Request;
    createCaptcha(issuer);
    // Both requests read the same stored session before either response saves.
    const first = { sessionID: issuer.sessionID, session: structuredClone(issuer.session), body: { captcha: 'ABC234' } } as Request;
    const second = { sessionID: issuer.sessionID, session: structuredClone(issuer.session), body: { captcha: 'ABC234' } } as Request;
    assert.equal(consumeCaptcha(first), true);
    assert.equal(consumeCaptcha(second), false);
    createCaptcha(issuer);
    const fresh = { sessionID: issuer.sessionID, session: structuredClone(issuer.session), body: { captcha: 'ABC234' } } as Request;
    assert.equal(consumeCaptcha(fresh), true, 'a new image with the same text is a distinct challenge');
  } finally { captchaProvider.create = original; }
});
