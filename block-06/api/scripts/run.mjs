import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const commands = {
  dev: ['node_modules/tsx/dist/cli.mjs', 'watch', 'src/server.ts'],
  start: ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'],
  build: ['node_modules/typescript/bin/tsc', '--noEmit'],
  test: ['node_modules/tsx/dist/cli.mjs', '--test', 'tests/api.test.ts'],
  'db:generate': ['node_modules/prisma/build/index.js', 'generate'],
  'db:migrate': ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  'db:status': ['node_modules/prisma/build/index.js', 'migrate', 'status'],
  'config:check': ['scripts/check-connection.mjs'],
};
const name = process.argv[2] || 'dev';
if (!Object.hasOwn(commands, name)) {
  console.error(`Unknown command. Choose: ${Object.keys(commands).join(', ')}`);
  process.exitCode = 1;
} else {
  const [entry, ...args] = commands[name];
  const child = spawn(process.execPath, [path.join(root, entry), ...args, ...process.argv.slice(3)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}` },
  });
  child.on('error', () => { console.error('Cannot start backend command. Install dependencies first.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
