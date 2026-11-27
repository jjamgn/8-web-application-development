import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const api = fileURLToPath(new URL('../', import.meta.url));
const scope = process.argv[2] ?? 'all';
if (!['all', 'a', 'b'].includes(scope)) throw new Error('Test scope must be all, a or b');
const directories = scope === 'a' ? ['tests/role-a'] : scope === 'b' ? ['tests'] : ['tests', 'tests/role-a'];
const files = directories.flatMap(directory => readdirSync(path.join(api, directory))
  .filter(name => name.endsWith('.test.ts')).sort().map(name => path.join(api, directory, name)));
const loader = pathToFileURL(path.join(api, 'node_modules/tsx/dist/loader.mjs')).href;
// A's migration test resolves the SQL from repository root. Both suites use the main API toolchain.
const child = spawn(process.execPath, ['--import', loader, '--test', ...files], {
  cwd: path.resolve(api, '../..'), stdio: 'inherit', env: process.env
});
child.once('error', () => { process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
