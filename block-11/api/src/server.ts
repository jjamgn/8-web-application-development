import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config/env.js';
import { createApp } from './app.js';
import { createDependencies } from './config/dependencies.js';
import { mkdir } from 'node:fs/promises';

export async function start(config = loadConfig()) {
  const runtime = createDependencies(config);
  let app;
  try {
    await runtime.ready();
    await mkdir(config.UPLOAD_TMP_DIR, { recursive: true });
    app = createApp(config, runtime.dependencies, config.NODE_ENV === 'production' ? { webDist: path.resolve('../web/dist') } : {});
  } catch {
    await runtime.close();
    throw new Error('API startup failed. Check the dedicated Block 11 database/migrations, private SeaweedFS bucket and production web build.');
  }
  const server = app.listen(config.PORT, '127.0.0.1', () => console.log(`Photo Gallery API: http://localhost:${config.PORT}`));
  server.once('error', () => { void runtime.close(); });
  server.requestTimeout = 120_000;
  const shutdown = () => { server.close(() => { void runtime.close().finally(() => process.exit(0)); }); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  start().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
}
