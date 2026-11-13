import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const source = (await readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8'))
  .replace('import.meta.env.VITE_API_BASE_URL', JSON.stringify('http://api.test/api'));
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const client = () => import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64') + '#' + randomUUID());
const ok = data => Response.json({ ok: true, data });
const denied = (status, code) => Response.json({ ok: false, error: { code, message: code } }, { status });
const tokens = { accessToken: 'renewed', csrfToken: 'csrf' };
function mock(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = (url, init) => handler(new URL(url).pathname, init);
  t.after(() => { globalThis.fetch = original; });
}

test('reload obtains csrf then refresh then bearer profile; cookie credentials stay on auth endpoints', async t => {
  const api = await client();
  const calls = [];
  mock(t, async (path, init) => {
    calls.push({ path, init });
    if (path.endsWith('/csrf')) return ok({ csrfToken: 'csrf' });
    if (path.endsWith('/refresh')) {
      assert.equal(init.headers.get('X-CSRF-Token'), 'csrf');
      return ok(tokens);
    }
    return ok({ id: 1 });
  });
  await api.fetchCsrfFromCookie();
  await api.refreshSessionFromCookie();
  await api.request('auth/me');
  await api.request('auth/login', { method: 'POST', body: '{}' });
  await api.request('auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': api.getCsrfToken() } });
  assert.deepEqual(calls.slice(0, 3).map(call => call.path), ['/api/auth/csrf', '/api/auth/refresh', '/api/auth/me']);
  assert.deepEqual(calls.map(call => call.init.credentials), ['include', 'include', 'omit', 'include', 'include']);
  assert.equal(calls[2].init.headers.get('Authorization'), 'Bearer renewed');
});

test('concurrent and late stale 401 responses share one rotation and retry each request once', async t => {
  const api = await client();
  api.setAuthTokens({ accessToken: 'expired', csrfToken: 'csrf' });
  let rotations = 0;
  const attempts = new Map();
  let release;
  const rotated = new Promise(resolve => { release = resolve; });
  mock(t, async (path, init) => {
    if (path.endsWith('/refresh')) { rotations++; await new Promise(resolve => setTimeout(resolve, 10)); release(); return ok(tokens); }
    attempts.set(path, (attempts.get(path) || 0) + 1);
    if (init.headers.get('Authorization') === 'Bearer expired') {
      if (path.endsWith('/late')) await rotated;
      return denied(401, 'UNAUTHENTICATED');
    }
    return ok(path);
  });
  const result = await Promise.all(['a', 'b', 'late'].map(path => api.request(path)));
  assert.equal(result.length, 3);
  assert.equal(rotations, 1);
  assert.deepEqual([...attempts.values()], [2, 2, 2]);
});

test('403 never refreshes and HTTP 200 business errors retain their status and code', async t => {
  const api = await client();
  let calls = 0;
  mock(t, async path => { calls++; return path.endsWith('/forbidden') ? denied(403, 'CSRF_INVALID') : denied(200, 'CAPTCHA_REQUIRED'); });
  await assert.rejects(api.request('forbidden'), { status: 403, code: 'CSRF_INVALID' });
  await assert.rejects(api.request('auth/login', { method: 'POST', body: '{}' }), { status: 200, code: 'CAPTCHA_REQUIRED' });
  assert.equal(calls, 2);
});

test('failed refresh clears memory and does not cause another rotation for a late 401', async t => {
  const api = await client();
  api.setAuthTokens({ accessToken: 'expired', csrfToken: 'csrf' });
  let rotations = 0;
  mock(t, async path => {
    if (path.endsWith('/refresh')) { rotations++; await new Promise(resolve => setTimeout(resolve, 10)); return denied(401, 'INVALID_REFRESH_TOKEN'); }
    return denied(401, 'UNAUTHENTICATED');
  });
  const results = await Promise.allSettled([api.request('a'), api.request('b')]);
  assert.ok(results.every(result => result.status === 'rejected'));
  await assert.rejects(api.request('late'), { status: 401 });
  assert.equal(rotations, 1);
  assert.equal(api.getCsrfToken(), null);
});

test('technical JSON errors from Block 7/9 API preserve HTTP status instead of claiming malformed success data', async t => {
  const api = await client();
  mock(t, async () => Response.json({ message: 'Không thể xử lý yêu cầu. Vui lòng thử lại sau.' }, { status: 500 }));
  await assert.rejects(api.request('auth/login', { method: 'POST', body: '{}' }), { kind: 'http', status: 500 });
  await assert.rejects(api.request('auth/reset', { method: 'POST', body: '{}' }), { kind: 'http', status: 500 });
});

test('profile password-change request carries Bearer, CSRF and cookie credentials and installs replacement tokens', async t => {
  const api = await client();
  api.setAuthTokens({ accessToken: 'old-access', csrfToken: 'old-csrf' });
  mock(t, async (path, init) => {
    if (path.endsWith('/change-password')) {
      assert.equal(init.method, 'POST');
      assert.equal(init.credentials, 'include');
      assert.equal(init.headers.get('Authorization'), 'Bearer old-access');
      assert.equal(init.headers.get('X-CSRF-Token'), 'old-csrf');
      return ok({ accessToken: 'new-access', csrfToken: 'new-csrf' });
    }
    assert.equal(init.headers.get('Authorization'), 'Bearer new-access');
    return ok({ id: 1 });
  });
  const next = await api.request('auth/change-password', { method: 'POST', headers: { 'X-CSRF-Token': api.getCsrfToken() }, body: JSON.stringify({ currentPassword: 'old', password: 'new-password', confirmPassword: 'new-password' }) });
  api.setAuthTokens(next);
  assert.equal(api.getCsrfToken(), 'new-csrf');
  await api.request('auth/me');
});

test('an old refresh failure cannot clear a newer session installed by password change', async t => {
  const api = await client();
  api.setAuthTokens({ accessToken: 'old-access', csrfToken: 'old-csrf' });
  let failRefresh;
  let started;
  const refreshStarted = new Promise(resolve => { started = resolve; });
  mock(t, async (path, init) => {
    if (path.endsWith('/refresh')) { started(); return new Promise(resolve => { failRefresh = () => resolve(denied(401, 'INVALID_REFRESH_TOKEN')); }); }
    return init.headers.get('Authorization') === 'Bearer newer-access' ? ok({ id: 1 }) : denied(401, 'UNAUTHENTICATED');
  });
  const pending = api.request('auth/me');
  await refreshStarted;
  api.setAuthTokens({ accessToken: 'newer-access', csrfToken: 'newer-csrf' });
  failRefresh();
  assert.deepEqual(await pending, { id: 1 });
  assert.equal(api.getCsrfToken(), 'newer-csrf');
});
