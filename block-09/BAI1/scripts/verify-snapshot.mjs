import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', '.npm-cache', '.pnpm-store', '.git', 'dist', 'coverage']);
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    if (skip.has(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example') || /\.(log|tsbuildinfo)$/.test(entry.name)) continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await files(root, name)); else if (entry.isFile()) result.push(name);
  }
  return result.sort();
}
const changedApi = new Set(['.env.example', 'package.json', 'package-lock.json', 'src/app.ts', 'src/routes/resources.ts', 'tests/api.test.ts']);
const sha = data => createHash('sha256').update(data).digest('hex');
const checks = [], failures = [];
for (const kind of ['api', 'web']) {
  const source = path.resolve(base, '../../block-07', kind);
  for (const name of await files(source)) {
    const hash = sha(await readFile(path.join(source, name)));
    let destinationHash = null;
    try { destinationHash = sha(await readFile(path.join(base, kind, name))); } catch { /* Record missing snapshot files. */ }
    const expectedChange = kind === 'api' && changedApi.has(name);
    const matches = hash === destinationHash;
    checks.push({ source: `block-07/${kind}/${name}`, sha256: hash, matches, expectedChange });
    if (!matches && !expectedChange) failures.push(`${kind}/${name}`);
  }
}
const reference = path.join(base, 'reference/block-08');
for (const name of await files(reference)) {
  const sourcePath = name.startsWith('auth/') ? `src/${name}` : name === 'app.ts' ? 'src/app.ts' : name === 'schema.prisma' ? 'prisma/schema.prisma' : name;
  const original = sha(await readFile(path.resolve(base, '../../block-08', sourcePath)));
  const matches = original === sha(await readFile(path.join(reference, name)));
  checks.push({ source: `block-08/${sourcePath}`, sha256: original, matches, expectedChange: false });
  if (!matches) failures.push(`reference/block-08/${name}`);
}
await writeFile(path.join(base, 'docs/snapshot-manifest.json'), JSON.stringify({ checks, failures }, null, 2) + '\n');
console.log(JSON.stringify({ filesChecked: checks.length, unchanged: checks.filter(check => check.matches).length, plannedApiChanges: checks.filter(check => check.expectedChange).length, failures }));
if (failures.length) process.exitCode = 1;
