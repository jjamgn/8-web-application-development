import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type RequestHandler } from 'express';
import session from 'express-session';
import request from 'supertest';
import { createRegistrationRouter, type RegistrationRouterOptions } from '../src/routes/registration.js';
import { createRegistrationService } from '../src/services/registration.js';
import { CaptchaError } from '../src/services/captcha.js';
import { OTP_RESEND_INTERVAL_MS } from '../src/services/otp.js';
import { registrationFixture } from './helpers/registration-fixture.js';

const data = { email: 'student@example.test', password: 'a strong password', confirmPassword: 'a strong password', 'cf-turnstile-response': 'test-captcha-token' };
function token(html: string) { return html.match(/name="_csrf" value="([a-f0-9]+)"/)![1]; }
function setup(t: TestContext, overrides: Partial<RegistrationRouterOptions> = {}) {
  const environment = { DEMO_MODE: 'false', OTP_SECRET: 'registration-test-secret-at-least-32-bytes-long', TURNSTILE_SITE_KEY: 'public-test-site-key', TURNSTILE_SECRET_KEY: 'private-test-site-secret' };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const fixture = registrationFixture(false);
  const service = createRegistrationService({ database: fixture.database, hash: async password => `test-hash:${password}` });
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', fileURLToPath(new URL('../views', import.meta.url)));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'test-only-registration-session-secret', resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    req.session.csrf ||= randomBytes(32).toString('hex');
    Object.assign(res.locals, { csrf: req.session.csrf, path: req.path, demo: false, title: 'Bếp Nhà' });
    next();
  });
  const csrf: RequestHandler = (req, res, next) => {
    const value = req.body?._csrf;
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value) || !req.session.csrf || !timingSafeEqual(Buffer.from(value), Buffer.from(req.session.csrf))) return res.sendStatus(403);
    next();
  };
  app.use('/auth', createRegistrationRouter({
    csrf,
    register: service.registerPendingAccount,
    verification: fixture.verification,
    captcha: async value => { if (value !== data['cf-turnstile-response']) throw new CaptchaError('CAPTCHA_TOKEN_INVALID', 'Invalid test CAPTCHA.'); },
    ...overrides,
  }));
  app.get('/_session', (req, res) => res.json({ pendingId: req.session.pendingRegistrationUserId, admin: req.session.admin, verified: req.session.registrationVerified, userId: (req.session as any).userId }));
  return { app, fixture };
}
async function register(app: express.Express, values = data) {
  const agent = request.agent(app);
  const page = await agent.get('/auth/register');
  const csrf = token(page.text);
  const response = await agent.post('/auth/register').type('form').send({ ...values, _csrf: csrf });
  return { agent, csrf, response };
}

test('GET pages render existing EJS styles and expose only the public site key without mutations', async t => {
  const { app, fixture } = setup(t);
  const page = await request(app).get('/auth/register');
  assert.equal(page.status, 200);
  assert.match(page.text, /public-test-site-key/);
  assert.match(page.text, /name="confirmPassword"/);
  assert.match(page.text, /challenges.cloudflare.com\/turnstile\/v0\/api.js/);
  assert.doesNotMatch(page.text, /private-test-site-secret|registration-test-secret/);
  assert.equal((await request(app).get('/auth/verify-email')).status, 200);
  assert.equal(fixture.users().length, 0);
  assert.equal(fixture.messages.length, 0);
});

test('every registration mutation requires the supplied CSRF middleware', async t => {
  const { app, fixture } = setup(t);
  for (const path of ['/auth/register', '/auth/verify-email', '/auth/verify-email/resend']) {
    assert.equal((await request(app).post(path).type('form').send(data)).status, 403);
  }
  assert.equal(fixture.users().length, 0);
});

test('invalid forms retain escaped email but never echo either password', async t => {
  const { app, fixture } = setup(t);
  const result = await register(app, { ...data, email: '"<invalid@example.test>', confirmPassword: 'wrong-confirmation' });
  assert.equal(result.response.status, 400);
  assert.match(result.response.text, /&lt;invalid@example.test&gt;/);
  assert.doesNotMatch(result.response.text, /a strong password|wrong-confirmation/);
  assert.equal(fixture.users().length, 0);
});

test('failed or unavailable CAPTCHA blocks creation and email before accessing account state', async t => {
  for (const code of ['CAPTCHA_TOKEN_INVALID', 'CAPTCHA_UNAVAILABLE', 'CAPTCHA_TIMEOUT'] as const) {
    const { app, fixture } = setup(t, { captcha: async () => { throw new CaptchaError(code, 'Test failure.'); } });
    const result = await register(app);
    assert.equal(result.response.status, code === 'CAPTCHA_TOKEN_INVALID' ? 400 : 503);
    assert.equal(fixture.users().length, 0);
    assert.equal(fixture.messages.length, 0);
  }
});

test('registration creates only viewer/pending and keeps a pending ID without authenticating', async t => {
  const { app, fixture } = setup(t);
  const result = await register(app, { ...data, role: 'admin', status: 'active' } as typeof data);
  assert.equal(result.response.status, 303);
  assert.equal(result.response.headers.location, '/auth/verify-email');
  assert.equal(fixture.user().role, 'viewer');
  assert.equal(fixture.user().status, 'pending');
  assert.equal(fixture.user().emailVerifiedAt, null);
  assert.equal(fixture.messages.length, 1);
  const verificationPage = await result.agent.get('/auth/verify-email');
  assert.equal(verificationPage.text.includes(fixture.code()), false);
  assert.equal(verificationPage.text.includes(fixture.record().otpHash), false);
  const state = (await result.agent.get('/_session')).body;
  assert.equal(state.pendingId, fixture.user().id);
  assert.equal(state.userId, undefined);
  assert.equal(state.admin, undefined);
});

test('duplicate registration never overwrites a password or reveals active status in the public response', async t => {
  const { app, fixture } = setup(t);
  const first = await register(app);
  const before = fixture.user().passwordHash;
  const duplicate = await register(app, { ...data, password: 'another password', confirmPassword: 'another password' });
  assert.equal(duplicate.response.status, first.response.status);
  assert.equal(duplicate.response.headers.location, first.response.headers.location);
  assert.equal(fixture.users().length, 1);
  assert.equal(fixture.user().passwordHash, before);
  await fixture.verification.verifyEmailCode(1, fixture.code());
  const active = await register(app);
  assert.equal(active.response.status, first.response.status);
  assert.equal(active.response.headers.location, first.response.headers.location);
  assert.equal(active.response.text, first.response.text);
  assert.equal(fixture.messages.length, 1);
});

test('OTP is bound to the session and posted userId cannot activate another account', async t => {
  const { app, fixture } = setup(t);
  const registered = await register(app);
  const outsider = request.agent(app);
  const outsiderPage = await outsider.get('/auth/register');
  const denied = await outsider.post('/auth/verify-email').type('form').send({ _csrf: token(outsiderPage.text), userId: 1, otp: fixture.code() });
  assert.equal(denied.status, 400);
  assert.equal(fixture.user().status, 'pending');
  const verified = await registered.agent.post('/auth/verify-email').type('form').send({ _csrf: registered.csrf, userId: 999, otp: fixture.code() });
  assert.equal(verified.status, 303);
  assert.equal(fixture.user().status, 'active');
  assert.deepEqual(fixture.user().emailVerifiedAt, fixture.record().usedAt);
  const state = (await registered.agent.get('/_session')).body;
  assert.equal(state.pendingId, undefined);
  assert.equal(state.userId, undefined);
  assert.equal(state.admin, undefined);
  assert.equal(state.verified, true);
  const page = await registered.agent.get('/auth/verify-email');
  assert.match(page.text, /Email đã được xác minh/);
  assert.match(page.text, /href="\/auth\/login"/);
});

test('resend obeys cooldown and replaces the code without changing the account password', async t => {
  const { app, fixture } = setup(t);
  const registered = await register(app);
  const before = fixture.code();
  assert.equal((await registered.agent.post('/auth/verify-email/resend').type('form').send({ _csrf: registered.csrf })).status, 303);
  assert.equal(fixture.messages.length, 1);
  fixture.advance(OTP_RESEND_INTERVAL_MS);
  assert.equal((await registered.agent.post('/auth/verify-email/resend').type('form').send({ _csrf: registered.csrf })).status, 303);
  assert.equal(fixture.messages.length, 2);
  assert.notEqual(fixture.code(), before);
  const invalid = await registered.agent.post('/auth/verify-email').type('form').send({ _csrf: registered.csrf, otp: before });
  assert.equal(invalid.status, 400);
  assert.equal(fixture.record().attempts, 1);
});

test('SMTP failure keeps pending and cooldown while the HTTP response does not claim delivery', async t => {
  const { app, fixture } = setup(t);
  fixture.controls.mailFails = true;
  const registered = await register(app);
  assert.equal(registered.response.status, 303);
  assert.equal(fixture.user().status, 'pending');
  assert.ok(fixture.record());
  const page = await registered.agent.get('/auth/verify-email');
  assert.doesNotMatch(page.text, /đã gửi thành công|Simulated SMTP/);
  fixture.controls.mailFails = false;
  await registered.agent.post('/auth/verify-email/resend').type('form').send({ _csrf: registered.csrf });
  assert.equal(fixture.messages.length, 0);
  fixture.advance(OTP_RESEND_INTERVAL_MS);
  await registered.agent.post('/auth/verify-email/resend').type('form').send({ _csrf: registered.csrf });
  assert.equal(fixture.messages.length, 1);
});

test('registration is limited to five POST requests per 15-minute IP window', async t => {
  const { app, fixture } = setup(t);
  const agent = request.agent(app); const page = await agent.get('/auth/register'); const csrf = token(page.text);
  for (let index = 0; index < 5; index++) {
    assert.equal((await agent.post('/auth/register').type('form').send({ ...data, email: `student${index}@example.test`, _csrf: csrf })).status, 303);
  }
  const limited = await agent.post('/auth/register').type('form').send({ ...data, _csrf: csrf });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers['retry-after']);
  assert.equal(fixture.users().length, 5);
});

test('resend is limited to ten POST requests per hourly IP window even without a pending account', async t => {
  const { app, fixture } = setup(t);
  const agent = request.agent(app); const page = await agent.get('/auth/verify-email'); const csrf = token(page.text);
  for (let index = 0; index < 10; index++) assert.equal((await agent.post('/auth/verify-email/resend').type('form').send({ _csrf: csrf })).status, 303);
  assert.equal((await agent.post('/auth/verify-email/resend').type('form').send({ _csrf: csrf })).status, 429);
  assert.equal(fixture.messages.length, 0);
});

test('demo mode never persists registration mutations', async t => {
  const { app, fixture } = setup(t);
  process.env.DEMO_MODE = 'true';
  const registered = await register(app);
  assert.equal(registered.response.status, 503);
  assert.equal(fixture.users().length, 0);
  assert.equal(fixture.messages.length, 0);
});
