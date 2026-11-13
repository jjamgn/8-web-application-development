import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', '.npm-cache', '.pnpm-store', '.vite', '.git', 'dist', 'coverage', 'var', 'tmp']);
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    if (skip.has(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example') || /\.(log|tsbuildinfo)$/.test(entry.name)) continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await files(root, name)); else if (entry.isFile()) result.push(name);
  }
  return result.sort();
}
const changedApi = new Set(['.env.example', 'README.md', 'package.json', 'package-lock.json', 'prisma/schema.prisma', 'src/app.ts', 'src/server.ts', 'src/routes/resources.ts', 'tests/api.test.ts']);
const changedWeb = new Set(['.env.example', 'README.md', 'package.json', 'vite.config.ts', 'src/main.tsx', 'src/vite-env.d.ts', 'src/app/router.tsx', 'src/components/Layout.tsx', 'src/lib/api.ts']);
// Git on Windows may check text out with CRLF. Compare content independently
// of line endings while hashing image/binary assets byte-for-byte.
const sha = (data, name) => createHash('sha256').update(/\.(?:ts|tsx|mjs|md|json|yaml|yml|toml|prisma|sql|html|css|cmd|example)$/.test(name)
  ? data.toString('utf8').replace(/\r\n/g, '\n') : data).digest('hex');
const checks = [], failures = [];
for (const kind of ['api', 'web']) {
  const source = path.resolve(base, '../../block-07', kind);
  for (const name of await files(source)) {
    const hash = sha(await readFile(path.join(source, name)), name);
    let destinationHash = null;
    try { destinationHash = sha(await readFile(path.join(base, kind, name)), name); } catch { /* Record missing snapshot files. */ }
    const expectedChange = kind === 'api' ? changedApi.has(name) : changedWeb.has(name);
    const matches = hash === destinationHash;
    checks.push({ source: `block-07/${kind}/${name}`, sha256: hash, matches, expectedChange });
    if (!matches && !expectedChange) failures.push(`${kind}/${name}`);
  }
}
const reference = path.join(base, 'reference/block-08');
for (const name of await files(reference)) {
  const sourcePath = name.startsWith('auth/') ? `src/${name}` : name === 'app.ts' ? 'src/app.ts' : name === 'schema.prisma' ? 'prisma/schema.prisma' : name;
  const original = sha(await readFile(path.resolve(base, '../../block-08', sourcePath)), name);
  const matches = original === sha(await readFile(path.join(reference, name)), name);
  checks.push({ source: `block-08/${sourcePath}`, sha256: original, matches, expectedChange: false });
  if (!matches) failures.push(`reference/block-08/${name}`);
}
await writeFile(path.join(base, 'docs/snapshot-manifest.json'), JSON.stringify({ checks, failures }, null, 2) + '\n');
console.log(JSON.stringify({ filesChecked: checks.length, unchanged: checks.filter(check => check.matches).length, plannedApiChanges: checks.filter(check => check.expectedChange && check.source.startsWith('block-07/api/')).length, plannedWebChanges: checks.filter(check => check.expectedChange && check.source.startsWith('block-07/web/')).length, failures }));
if (failures.length) process.exitCode = 1;
