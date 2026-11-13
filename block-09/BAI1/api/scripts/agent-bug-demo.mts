// Demonstrate an agent mistake ONLY in a temporary module, never in app wiring.
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import type { Request, Response, RequestHandler } from 'express';
import { requireAuth } from '../src/middleware/require-auth.js';
import { signAccessToken } from '../src/lib/auth-jwt.js';
import { unavailableAuthServices, type AuthServices, type AuthUser } from '../src/lib/auth-services.js';
import { AuthError } from '../src/lib/auth-errors.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = await mkdtemp(path.join(apiRoot, '.agent-bug-'));
try {
  process.env.JWT_SECRET = 'test-only-demo-jwt-secret-at-least-32-bytes';
  const user: AuthUser = { id: 1, name: 'Demo', email: 'demo@example.test', role: 'viewer', status: 'active', emailVerifiedAt: new Date(), passwordVersion: 0 };
  const token = await signAccessToken(user, 'demo-family');
  user.passwordVersion = 1;
  const services: AuthServices = { ...unavailableAuthServices, async findAccessSession() {
    return { user, familyId: 'demo-family', passwordVersion: 1, expiresAt: new Date(Date.now() + 60000), absoluteExpiresAt: new Date(Date.now() + 60000), usedAt: null, revokedAt: null };
  } };
  const source = await readFile(path.join(apiRoot, 'src/middleware/require-auth.ts'), 'utf8');
  const check = ' || session.user.passwordVersion !== claims.passwordVersion';
  assert.ok(source.includes(check), 'Production middleware must contain the JWT passwordVersion check');
  const mutant = source.replace(check, '').replaceAll("'../lib/", "'../src/lib/");
  const modulePath = path.join(sandbox, 'require-auth.ts');
  await writeFile(modulePath, mutant);
  const buggy = (await import(pathToFileURL(modulePath).href)).requireAuth as typeof requireAuth;
  async function accepted(handler: RequestHandler) {
    let called = false;
    const req = { get: () => `Bearer ${token}` } as unknown as Request;
    const res = { locals: {} } as Response;
    try { await handler(req, res, () => { called = true; }); }
    catch (error) { if (!(error instanceof AuthError && error.status === 401)) throw error; }
    return called;
  }
  const buggyAcceptedStaleJwt = await accepted(buggy(services));
  const fixedRejectedStaleJwt = !(await accepted(requireAuth(services)));
  assert.equal(buggyAcceptedStaleJwt, true);
  assert.equal(fixedRejectedStaleJwt, true);
  const evidence = { experiment: 'Remove JWT passwordVersion comparison in an isolated temporary module', buggyAcceptedStaleJwt, fixedRejectedStaleJwt, productionFileModified: false, credentialsRecorded: false };
  await writeFile(path.join(apiRoot, '../docs/agent-bug-demo.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('Isolated bug reproduced; production middleware rejected the stale JWT. No credentials recorded.');
} finally {
  const resolved = path.resolve(sandbox);
  if (path.dirname(resolved) !== apiRoot || !path.basename(resolved).startsWith('.agent-bug-')) throw new Error('Unexpected cleanup path');
  await rm(resolved, { recursive: true, force: true });
}
