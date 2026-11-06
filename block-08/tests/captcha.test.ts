import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { CaptchaError, verifyCaptcha } from '../src/services/captcha.js';

const secret = 'private-turnstile-test-secret';
const token = 'private-browser-test-token';

function configure(t: TestContext) {
  const previous = { TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY, TURNSTILE_ALLOWED_HOSTNAMES: process.env.TURNSTILE_ALLOWED_HOSTNAMES };
  process.env.TURNSTILE_SECRET_KEY = secret;
  process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'localhost,127.0.0.1';
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function hasCode(code: CaptchaError['code']) {
  return (error: unknown) => error instanceof CaptchaError && error.code === code;
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

test('captcha rejects missing secret or hostname configuration before contacting Cloudflare', async t => {
  configure(t);
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('No network expected.'); });
  for (const key of ['TURNSTILE_SECRET_KEY', 'TURNSTILE_ALLOWED_HOSTNAMES']) {
    const previous = process.env[key];
    delete process.env[key];
    await assert.rejects(verifyCaptcha(token), hasCode('CAPTCHA_CONFIG_INVALID'));
    process.env[key] = previous;
  }
  process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'http://localhost:3000';
  await assert.rejects(verifyCaptcha(token), hasCode('CAPTCHA_CONFIG_INVALID'));
  assert.equal(network.mock.callCount(), 0);
});

test('captcha rejects missing, malformed and oversized tokens without a network request', async t => {
  configure(t);
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('No network expected.'); });
  for (const value of [undefined, null, '', '   ', 123, ['token'], {}, 'a'.repeat(2049)]) {
    await assert.rejects(verifyCaptcha(value), hasCode('CAPTCHA_TOKEN_INVALID'));
  }
  assert.equal(network.mock.callCount(), 0);
});

test('captcha posts credentials in the body and accepts verified tokens for both configured local hosts', async t => {
  configure(t);
  let hostname = 'localhost';
  const network = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(input, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('secret'), secret);
    assert.equal(body.get('response'), token);
    assert.ok(init?.signal instanceof AbortSignal);
    return json({ success: true, hostname, 'error-codes': [] });
  });
  assert.equal(await verifyCaptcha(token), undefined);
  hostname = '127.0.0.1';
  assert.equal(await verifyCaptcha(token), undefined);
  assert.equal(network.mock.callCount(), 2);
});

test('captcha refuses tokens verified for an unrelated hostname', async t => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => json({ success: true, hostname: 'other.example.test' }));
  await assert.rejects(verifyCaptcha(token), hasCode('CAPTCHA_TOKEN_INVALID'));
});

test('captcha rejects invalid, expired and already-used tokens without retrying', async t => {
  configure(t);
  let code = 'invalid-input-response';
  const network = t.mock.method(globalThis, 'fetch', async () => json({ success: false, 'error-codes': [code] }));
  for (code of ['missing-input-response', 'invalid-input-response', 'timeout-or-duplicate']) {
    await assert.rejects(verifyCaptcha(token), hasCode('CAPTCHA_TOKEN_INVALID'));
  }
  assert.equal(network.mock.callCount(), 3);
});

test('captcha reports invalid provider credentials without revealing the secret', async t => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => json({ success: false, 'error-codes': ['invalid-input-secret'], detail: secret }));
  await assert.rejects(verifyCaptcha(token), (error: unknown) => {
    assert.ok(error instanceof CaptchaError);
    assert.equal(error.code, 'CAPTCHA_CONFIG_INVALID');
    assert.doesNotMatch(String(error), /private-turnstile-test-secret|private-browser-test-token/);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('captcha rejects HTTP errors, malformed payloads and provider failures', async t => {
  configure(t);
  let response: Response;
  const network = t.mock.method(globalThis, 'fetch', async () => response);
  for (response of [
    json({ success: true, hostname: 'localhost' }, 503),
    new Response('not-json'),
    json(null), json([]), json({ success: 'true', hostname: 'localhost' }),
    json({ success: true }),
    json({ success: true, hostname: 'localhost', 'error-codes': ['unexpected'] }),
    json({ success: false, 'error-codes': ['internal-error'] }),
  ]) {
    await assert.rejects(verifyCaptcha(token), hasCode('CAPTCHA_UNAVAILABLE'));
  }
  assert.equal(network.mock.callCount(), 8);
});

test('captcha hides network error details and never retries', async t => {
  configure(t);
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error(`Network error: ${secret}; ${token}`); });
  await assert.rejects(verifyCaptcha(token), (error: unknown) => {
    assert.ok(error instanceof CaptchaError);
    assert.equal(error.code, 'CAPTCHA_UNAVAILABLE');
    assert.doesNotMatch(String(error), /private-turnstile-test-secret|private-browser-test-token/);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(network.mock.callCount(), 1);
});

test('captcha times out at 5 seconds and aborts the request even if fetch never settles', async t => {
  configure(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null | undefined;
  const network = t.mock.method(globalThis, 'fetch', (_input: unknown, init?: RequestInit) => {
    signal = init?.signal;
    return new Promise<Response>(() => {});
  });
  let settled = false;
  const verification = verifyCaptcha(token);
  const rejected = assert.rejects(verification, hasCode('CAPTCHA_TIMEOUT')).then(() => { settled = true; });
  t.mock.timers.tick(4999);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(signal?.aborted, true);
  assert.equal(network.mock.callCount(), 1);
});

test('captcha timeout also covers a response body that never finishes', async t => {
  configure(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const response = new Response('');
  const body = t.mock.method(response, 'json', () => new Promise<unknown>(() => {}));
  t.mock.method(globalThis, 'fetch', async () => response);
  const rejected = assert.rejects(verifyCaptcha(token), hasCode('CAPTCHA_TIMEOUT'));
  await Promise.resolve();
  assert.equal(body.mock.callCount(), 1);
  t.mock.timers.tick(5000);
  await rejected;
});
