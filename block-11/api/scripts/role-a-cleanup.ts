import { createRoleARuntime } from '../src/storage/runtime.js';

async function main() {
  if (!process.argv.includes('--maintenance') || process.env.BLOCK11_API_STOPPED !== 'yes') {
    throw new Error('Stop all API instances first; use BLOCK11_API_STOPPED=yes and --maintenance');
  }
  const runtime = await createRoleARuntime();
  try {
    await runtime.storage.check();
    const result = await runtime.service.cleanupStorage();
    console.log(JSON.stringify(result));
    if (result.pending || result.failed) process.exitCode = 1;
  } finally { await runtime.close(); }
}
main().catch(() => { console.error('CLEANUP_FAILED: check private configuration and maintenance prerequisites'); process.exitCode = 1; });
