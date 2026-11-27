import { randomUUID } from 'node:crypto';
import { createRoleARuntime } from '../src/storage/runtime.js';
import { chunkKey } from '../src/storage/keys.js';
import { sha256 } from '../src/storage/chunks.js';
import { storageConfigFromEnv } from '../src/storage/s3-storage.js';

async function main() {
  const runtime = await createRoleARuntime();
  const key = chunkKey(randomUUID(), 1, 1);
  let journaled = false;
  try {
    await runtime.storage.check();
    await runtime.repository.journal([key]); journaled = true;
    const bytes = Buffer.from('block11-storage-check');
    await runtime.storage.put(key, bytes);
    if (sha256(await runtime.storage.get(key)) !== sha256(bytes)) throw new Error('Storage readback mismatch');
    if ((await runtime.storage.head(key))?.bytes !== bytes.length) throw new Error('Storage HEAD mismatch');
    const config = storageConfigFromEnv();
    const url = new URL(`${config.bucket}/${key}`, config.endpoint.endsWith('/') ? config.endpoint : `${config.endpoint}/`);
    const anonymous = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    await anonymous.body?.cancel();
    if (![401, 403].includes(anonymous.status)) throw new Error('Anonymous access must be denied');
    console.log('BUCKET_OK PUT_GET_HEAD_OK ANONYMOUS_DENIED');
  } finally {
    try {
      if (journaled) {
        await runtime.storage.delete(key);
        await runtime.repository.taskDone(key);
        console.log('PROBE_OBJECT_DELETED');
      }
    } finally { await runtime.close(); }
  }
}
main().catch(() => { console.error('STORAGE_CHECK_FAILED: no credentials logged; inspect local configuration'); process.exitCode = 1; });
