import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveWebDist } from '../src/server.js';

test('production web build resolves from both source and emitted server, independently of cwd', () => {
  const expected = fileURLToPath(new URL('../../web/dist', import.meta.url));
  assert.equal(resolveWebDist(new URL('../src/server.ts', import.meta.url)), expected);
  assert.equal(resolveWebDist(new URL('../dist/api/src/server.js', import.meta.url)), expected);
});

test('compiled server and shared contracts load in native Node ESM without the tsx loader', async () => {
  const apiRoot = fileURLToPath(new URL('../', import.meta.url));
  const output = await mkdtemp(path.join(apiRoot, '.compile-smoke-'));
  const run = promisify(execFile);
  try {
    await run(process.execPath, [path.join(apiRoot, 'node_modules/typescript/bin/tsc'), '-p', path.join(apiRoot, 'tsconfig.json'), '--outDir', output], { cwd: apiRoot });
    const server = pathToFileURL(path.join(output, 'api/src/server.js')).href;
    const contracts = pathToFileURL(path.join(output, 'contracts/index.js')).href;
    const script = `const server = await import(${JSON.stringify(server)}); const contracts = await import(${JSON.stringify(contracts)}); if (typeof server.start !== 'function' || contracts.codePoints('ảnh') !== 3 || contracts.LIMITS.files !== 5) process.exit(1);`;
    await run(process.execPath, ['--input-type=module', '-e', script], { cwd: apiRoot });
  } finally { await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
