import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveWebDist } from '../src/server.js';

test('production web build resolves from both source and emitted server, independently of cwd', () => {
  const expected = fileURLToPath(new URL('../../web/dist', import.meta.url));
  assert.equal(resolveWebDist(new URL('../src/server.ts', import.meta.url)), expected);
  assert.equal(resolveWebDist(new URL('../dist/api/src/server.js', import.meta.url)), expected);
});
