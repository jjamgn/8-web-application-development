import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { SignJWT, decodeJwt } from 'jose';
import { createAuthFixture } from './helpers/auth-fixture.js';
import { AuthError } from '../src/lib/auth-errors.js';
import { signAccessToken, verifyAccessToken } from '../src/lib/auth-jwt.js';
import { csrfToken, REFRESH_COOKIE } from '../src/lib/auth-http.js';
import { resetEmail } from '../src/services/auth/email.js';
import { registerSchema } from '../src/validation/auth.js';

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';
process.env.AUTH_TOKEN_SECRET = 'test-only-auth-secret-with-at-least-32-bytes';
process.env.SPA_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';
process.env.TURNSTILE_SECRET_KEY = 'test-only-placeholder';
process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'localhost';
const { createApp } = await import('../src/app.js');
const origin = 'http://localhost:5173';
let fixture: ReturnType<typeof createAuthFixture>;
let app: ReturnType<typeof createApp>;
const originalFetch = globalThis.fetch;
beforeEach(() => { fixture = createAuthFixture(); app = createApp(fixture.services); });
afterEach(() => { globalThis.fetch = originalFetch; });
const cookieOf = (response: request.Response) => (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
const rawOf = (cookie: string) => cookie.slice(cookie.indexOf('=') + 1);
const login = () => request(app).post('/api/auth/login').set('Origin', origin).send({ email: fixture.user.email, password: 'password-test' });
function fakeCaptcha(success = true, hostname = 'localhost') {
  globalThis.fetch = async () => new Response(JSON.stringify({ success, hostname }), { headers: { 'Content-Type': 'application/json' } });
}
const registration = { name: 'Test', email: 'new@example.test', password: 'password-test', confirmPassword: 'password-test', captchaToken: 'test-captcha' };

test('login issues only access JWT/CSRF/user JSON and a secure host-only refresh cookie', async () => {
  const response = await login();
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.data.tokenType, 'Bearer');
  assert.equal(response.body.data.expiresIn, 600);
  assert.equal(response.body.data.user.role, 'viewer');
  assert.deepEqual(Object.keys(response.body.data.user).sort(), ['email', 'id', 'name', 'role']);
  const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/auth']) assert.ok(cookie.includes(attr));
  assert.ok(!cookie.includes('Domain='));
  assert.ok(Number(/Max-Age=(\d+)/.exec(cookie)![1]) <= 7 * 86400);
  const raw = rawOf(cookieOf(response));
  assert.ok(!response.text.includes(raw));
  const claims = decodeJwt(response.body.data.accessToken);
  assert.equal(claims.exp! - claims.iat!, 600);
  assert.ok(claims.jti && claims.sid && claims.sub && claims.iss && claims.aud);
  assert.equal(claims.pv, 0);
  assert.equal(claims.role, undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
  const me = await request(app).get('/api/auth/me').auth(response.body.data.accessToken, { type: 'bearer' });
  assert.equal(me.body.data.id, fixture.user.id);
});

test('invalid credentials and pending accounts are HTTP 200 business errors without tokens', async () => {
  const wrong = await request(app).post('/api/auth/login').set('Origin', origin).send({ email: fixture.user.email, password: 'wrong' });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');
  fixture.user.status = 'pending';
  const pending = await login();
  assert.equal(pending.status, 200);
  assert.equal(pending.body.error.code, 'ACCOUNT_NOT_ACTIVATED');
  assert.equal(pending.headers['set-cookie'], undefined);
  assert.equal(pending.body.data, undefined);
});

test('CAPTCHA is verified before registration service and unknown role/invitation fields are stripped', async () => {
  const missing = await request(app).post('/api/auth/register').send({ ...registration, captchaToken: '' });
  assert.equal(missing.body.error.code, 'CAPTCHA_REQUIRED');
  assert.ok(!fixture.calls.some(call => call.operation === 'register'));
  fakeCaptcha(false);
  assert.equal((await request(app).post('/api/auth/register').send(registration)).body.error.code, 'INVALID_CAPTCHA');
  fakeCaptcha(true, 'evil.test');
  assert.equal((await request(app).post('/api/auth/register').send(registration)).body.error.code, 'INVALID_CAPTCHA');
  fakeCaptcha();
  const first = await request(app).post('/api/auth/register').send({ ...registration, role: 'admin', invitationCode: 'ignored' });
  const second = await request(app).post('/api/auth/register').send(registration);
  assert.equal(first.body.ok, true);
  assert.deepEqual(first.body, second.body);
  const input = fixture.calls.find(call => call.operation === 'register')!.input as Record<string, unknown>;
  assert.equal(input.role, undefined);
  assert.equal(input.invitationCode, undefined);
});

test('Block 8 password policy keeps 8 characters, 72 UTF-8 bytes and confirmation', () => {
  assert.equal(registerSchema.safeParse({ ...registration, password: 'a'.repeat(72), confirmPassword: 'a'.repeat(72) }).success, true);
  for (const password of ['a'.repeat(7), 'a'.repeat(73), 'ế'.repeat(25)]) {
    assert.equal(registerSchema.safeParse({ ...registration, password, confirmPassword: password }).success, false);
  }
  assert.equal(registerSchema.safeParse({ ...registration, confirmPassword: 'mismatch' }).success, false);
});

test('login delegates conditional CAPTCHA through context and preserves lock/rate status', async () => {
  fixture.captchaRequired = true;
  assert.equal((await login()).body.error.code, 'CAPTCHA_REQUIRED');
  fakeCaptcha(false);
  const invalid = await request(app).post('/api/auth/login').set('Origin', origin).send({ email: fixture.user.email, password: 'password-test', captchaToken: 'test-captcha' });
  assert.equal(invalid.status, 200);
  assert.equal(invalid.body.error.code, 'INVALID_CAPTCHA');
  fixture.loginError = new AuthError('RATE_LIMITED', undefined, 900);
  const locked = await login();
  assert.equal(locked.status, 429);
  assert.equal(locked.headers['retry-after'], '900');
});

test('cookie endpoints require exact Origin including on logout without a cookie', async () => {
  for (const path of ['login', 'refresh', 'logout', 'csrf']) {
    for (const value of ['', 'null', 'https://evil.test', `${origin}.evil.test`]) {
      const attempt = path === 'csrf' ? request(app).get(`/api/auth/${path}`) : request(app).post(`/api/auth/${path}`);
      if (value) attempt.set('Origin', value);
      const response = await attempt;
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, 'ORIGIN_FORBIDDEN');
    }
  }
});

test('reload csrf is read-only; refresh rotates cookie in the same family and keeps absolute expiry', async () => {
  const initial = await login();
  const cookie = cookieOf(initial);
  const row = fixture.rows.get(rawOf(cookie))!;
  row.absoluteExpiresAt = new Date(Date.now() + 3600000);
  const csrf = await request(app).get('/api/auth/csrf').set('Origin', origin).set('Cookie', cookie);
  assert.equal(csrf.body.data.csrfToken, initial.body.data.csrfToken);
  assert.equal(csrf.body.data.accessToken, undefined);
  assert.equal(csrf.headers['set-cookie'], undefined);
  assert.equal(row.usedAt, null);
  const refreshed = await request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', cookie).set('X-CSRF-Token', csrf.body.data.csrfToken);
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.data.expiresIn, 600);
  assert.ok(row.usedAt);
  assert.ok(cookieOf(refreshed) !== cookie);
  const next = fixture.rows.get(rawOf(cookieOf(refreshed)))!;
  assert.equal(next.familyId, row.familyId);
  assert.equal(next.absoluteExpiresAt.getTime(), row.absoluteExpiresAt.getTime());
  assert.ok(Number(/Max-Age=(\d+)/.exec((refreshed.headers['set-cookie'] as unknown as string[])[0])![1]) <= 3600);
});

test('CSRF is mandatory for live refresh/logout and failure does not consume or clear cookie', async () => {
  const initial = await login();
  const cookie = cookieOf(initial);
  for (const path of ['refresh', 'logout']) for (const token of ['', 'x'.repeat(43), 'é'.repeat(43)]) {
    const response = await request(app).post(`/api/auth/${path}`).set('Origin', origin).set('Cookie', cookie).set('X-CSRF-Token', token);
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'CSRF_INVALID');
    assert.equal(response.headers['set-cookie'], undefined);
  }
  assert.equal(fixture.rows.get(rawOf(cookie))!.usedAt, null);
  assert.equal(fixture.rows.get(rawOf(cookie))!.revokedAt, null);
});

test('replayed refresh revokes the entire family and invalidates issued access immediately', async () => {
  const first = await login();
  const cookie = cookieOf(first), csrf = first.body.data.csrfToken;
  const second = await request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', cookie).set('X-CSRF-Token', csrf);
  const replay = await request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', cookie).set('X-CSRF-Token', csrf);
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error.code, 'REFRESH_TOKEN_REUSED');
  assert.ok((replay.headers['set-cookie'] as unknown as string[])[0].includes(`${REFRESH_COOKIE}=;`));
  const me = await request(app).get('/api/auth/me').auth(second.body.data.accessToken, { type: 'bearer' });
  assert.equal(me.status, 401);
  const current = await request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', cookieOf(second)).set('X-CSRF-Token', csrf);
  assert.equal(current.status, 401);
});

test('rotation race error from A propagates 401, clears cookie and leaves family revoked', async () => {
  const initial = await login(), cookie = cookieOf(initial);
  const responses = await Promise.all([0, 1].map(() => request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', cookie).set('X-CSRF-Token', initial.body.data.csrfToken)));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
  assert.ok([...fixture.rows.values()].every(row => row.revokedAt));
});

test('logout revokes sid; repeated logout and absent/invalid cookies are idempotent', async () => {
  const initial = await login();
  const cookie = cookieOf(initial);
  const response = await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', cookie).set('X-CSRF-Token', initial.body.data.csrfToken);
  assert.equal(response.body.ok, true);
  assert.equal((await request(app).get('/api/auth/me').auth(initial.body.data.accessToken, { type: 'bearer' })).status, 401);
  for (const value of [cookie, `${REFRESH_COOKIE}=invalid`, '']) {
    const response = await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', value);
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
  }
});

test('access middleware rechecks current user, email activation, passwordVersion and family expiry', async () => {
  const initial = await login(), token = initial.body.data.accessToken;
  const row = fixture.rows.get(rawOf(cookieOf(initial)))!;
  for (const mutate of [
    () => { fixture.user.status = 'pending'; },
    () => { fixture.user.status = 'active'; fixture.user.emailVerifiedAt = null; },
    () => { fixture.user.emailVerifiedAt = new Date(); fixture.user.passwordVersion++; },
    () => { fixture.user.passwordVersion = 0; row.expiresAt = new Date(0); },
    () => { row.expiresAt = new Date(Date.now() + 60000); row.absoluteExpiresAt = new Date(0); },
  ]) {
    mutate();
    assert.equal((await request(app).get('/api/auth/me').auth(token, { type: 'bearer' })).status, 401);
  }
});

test('csrf and refresh reject inactive or password-changed users and clear/revoke their family', async () => {
  for (const route of ['csrf', 'refresh']) for (const change of ['status', 'password']) {
    fixture = createAuthFixture(); app = createApp(fixture.services);
    const initial = await login(), cookie = cookieOf(initial);
    if (change === 'status') fixture.user.status = 'pending'; else fixture.user.passwordVersion++;
    const attempt = route === 'csrf' ? request(app).get('/api/auth/csrf') : request(app).post('/api/auth/refresh');
    const response = await attempt.set('Origin', origin).set('Cookie', cookie).set('X-CSRF-Token', initial.body.data.csrfToken);
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'INVALID_REFRESH_TOKEN');
    assert.ok(fixture.rows.get(rawOf(cookie))!.revokedAt);
    assert.ok(response.headers['set-cookie']);
  }
});

test('missing/malformed/duplicate/unknown/expired refresh cookies return 401 and clear cookie', async () => {
  const initial = await login(), cookie = cookieOf(initial);
  fixture.rows.get(rawOf(cookie))!.expiresAt = new Date(0);
  for (const value of ['', `${REFRESH_COOKIE}=bad`, `${REFRESH_COOKIE}=${'x'.repeat(43)}`, `${cookie}; ${cookie}`, cookie]) {
    const response = await request(app).post('/api/auth/refresh').set('Origin', origin).set('Cookie', value).set('X-CSRF-Token', initial.body.data.csrfToken);
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'INVALID_REFRESH_TOKEN');
    assert.ok(response.headers['set-cookie']);
  }
});

test('protected resources reject unauthenticated requests before handler/validation', async () => {
  for (const kind of ['dishes', 'chefs', 'ingredients']) {
    for (const method of ['post', 'patch', 'delete'] as const) {
      const path = `/api/${kind}${method === 'post' ? '' : '/1'}`;
      const response = await request(app)[method](path).send({});
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, 'UNAUTHENTICATED');
    }
    if (kind !== 'dishes') for (const suffix of ['', '/1']) {
      assert.equal((await request(app).get(`/api/${kind}${suffix}`)).status, 401);
    }
  }
  for (const path of ['/api/dishes?page=0', '/api/dishes/invalid']) {
    const response = await request(app).get(path);
    assert.equal(response.status, 200);
    assert.ok(['VALIDATION_FAILED', 'NOT_FOUND'].includes(response.body.error.code));
  }
});

test('JWT rejects expired, tampered, wrong issuer/audience/algorithm and missing claims', async () => {
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const base = { sub: '1', jti: 'test', sid: 'family', pv: 0, iat: now, exp: now + 600, iss: 'bep-nha-api', aud: 'bep-nha-web' };
  for (const payload of [{ ...base, exp: now - 1 }, { ...base, iss: 'other' }, { ...base, aud: 'other' }, { ...base, sid: undefined }, { ...base, pv: '0' }, { ...base, exp: now + 601 }, { ...base, iat: now + 60 }]) {
    const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
    await assert.rejects(verifyAccessToken(token), (error: unknown) => error instanceof AuthError && error.status === 401);
  }
  const token = await signAccessToken(fixture.user, 'family');
  const parts = token.split('.'); parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
  await assert.rejects(verifyAccessToken(parts.join('.')));
  const otherAlgorithm = await new SignJWT(base).setProtectedHeader({ alg: 'HS384', typ: 'JWT' }).sign(new Uint8Array(48).fill(1));
  await assert.rejects(verifyAccessToken(otherAlgorithm));
});

test('middleware rejects stale JWT passwordVersion even when the returned DB session is current', async () => {
  const initial = await login();
  const row = fixture.rows.get(rawOf(cookieOf(initial)))!;
  fixture.user.passwordVersion = 1;
  row.passwordVersion = 1;
  const response = await request(app).get('/api/auth/me').auth(initial.body.data.accessToken, { type: 'bearer' });
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHENTICATED');
});

test('activation/reset preserve prescribed HTTP 200 business error codes; no auto-login', async () => {
  assert.equal((await request(app).post('/api/auth/activate').send({ email: fixture.user.email, otp: 'bad' })).body.error.code, 'INVALID_OTP');
  for (const code of ['INVALID_OTP', 'INVALID_RESET_TOKEN'] as const) {
    fixture.operationError = new AuthError(code);
    const path = code === 'INVALID_OTP' ? 'activate' : 'reset';
    const body = path === 'activate' ? { email: fixture.user.email, otp: '123456' } : { token: 'a'.repeat(64), password: 'password-test', confirmPassword: 'password-test' };
    const response = await request(app).post(`/api/auth/${path}`).send(body);
    assert.equal(response.status, 200);
    assert.equal(response.body.error.code, code);
    assert.equal(response.headers['set-cookie'], undefined);
  }
  fixture.operationError = undefined;
  const active = await request(app).post('/api/auth/activate').send({ email: fixture.user.email, otp: '123456' });
  assert.equal(active.body.ok, true);
  assert.equal(active.body.data.accessToken, undefined);
  assert.equal((await request(app).post('/api/auth/reset').send({})).body.error.code, 'INVALID_RESET_TOKEN');
});

test('reset success does not login and calls A so all old device tokens become invalid', async () => {
  const devices = await Promise.all([login(), login()]);
  const reset = await request(app).post('/api/auth/reset').send({ token: 'a'.repeat(64), password: 'password-test', confirmPassword: 'password-test' });
  assert.equal(reset.body.ok, true);
  assert.equal(reset.body.data.accessToken, undefined);
  assert.equal(reset.headers['set-cookie'], undefined);
  for (const device of devices) assert.equal((await request(app).get('/api/auth/me').auth(device.body.data.accessToken, { type: 'bearer' })).status, 401);
});

test('resend/forgot use generic results; forgot still requires CAPTCHA', async () => {
  const results = [];
  for (const email of ['known@example.test', 'unknown@example.test']) {
    results.push((await request(app).post('/api/auth/activate/resend').send({ email })).body);
  }
  assert.deepEqual(results[0], results[1]);
  assert.equal((await request(app).post('/api/auth/forgot').send({ email: fixture.user.email })).body.error.code, 'CAPTCHA_REQUIRED');
  fakeCaptcha();
  const first = await request(app).post('/api/auth/forgot').send({ email: fixture.user.email, captchaToken: 'test-captcha' });
  const second = await request(app).post('/api/auth/forgot').send({ email: 'unknown@example.test', captchaToken: 'test-captcha' });
  assert.deepEqual(first.body, second.body);
});

test('all auth POST routes delegate IP limiting before business operations', async () => {
  const paths = { register: 'register', activate: 'activate', resend: 'activate/resend', login: 'login', forgot: 'forgot', reset: 'reset', refresh: 'refresh' };
  fixture.services.enforceIpLimit = async () => { throw new AuthError('RATE_LIMITED', undefined, 60); };
  for (const path of Object.values(paths)) {
    const response = await request(app).post(`/api/auth/${path}`).set('Origin', origin).send({});
    assert.equal(response.status, 429);
    assert.equal(response.body.error.code, 'RATE_LIMITED');
  }
  assert.equal(fixture.calls.length, 0);
});

test('exact configured CORS origins allow credentials and preflight auth headers only', async () => {
  process.env.SPA_ORIGINS = 'https://spa.example.test';
  const isolated = createApp(fixture.services);
  try {
    const response = await request(isolated).options('/api/auth/refresh').set('Origin', 'https://spa.example.test').set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,x-csrf-token');
    assert.equal(response.status, 204);
    assert.equal(response.headers['access-control-allow-origin'], 'https://spa.example.test');
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
    assert.ok(response.headers['access-control-allow-headers'].includes('X-CSRF-Token'));
    const denied = await request(isolated).get('/api/auth/csrf').set('Origin', origin);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers['access-control-allow-credentials'], undefined);
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
  } finally { process.env.SPA_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'; }
});

test('default app never grants fake authentication when A adapter is missing', async () => {
  const response = await request(createApp()).post('/api/auth/login').set('Origin', origin).send({ email: fixture.user.email, password: 'password-test' });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'AUTH_SERVICE_UNAVAILABLE');
  assert.equal(response.headers['set-cookie'], undefined);
});

test('reset email targets the SPA /reset and secrets have no session fallback', async () => {
  process.env.WEB_ORIGIN = origin;
  const message = resetEmail(fixture.user.email, 'a'.repeat(64));
  assert.ok(message.text.includes(`${origin}/reset?token=`));
  const saved = process.env.AUTH_TOKEN_SECRET;
  delete process.env.AUTH_TOKEN_SECRET;
  process.env.SESSION_SECRET = 'test-only-session-secret-must-not-be-used';
  try { assert.throws(() => csrfToken('family'), AuthError); }
  finally { process.env.AUTH_TOKEN_SECRET = saved; delete process.env.SESSION_SECRET; }
});
