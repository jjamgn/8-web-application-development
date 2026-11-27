import { readdir, lstat, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';

/** Maintenance only, API stopped. Never follow symlinks; never scan outside the explicit temp root. */
export async function sweepTemporaryFiles(root: string, cutoff: number): Promise<number> {
  let resolved: string;
  try { resolved = await realpath(root); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
  if (resolved === path.parse(resolved).root) throw new Error('Unsafe temporary root');
  let deleted = 0;
  async function walk(directory: string): Promise<void> {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const filename = path.join(directory, item.name);
      if (item.isDirectory()) { await walk(filename); continue; }
      if (item.isFile() && (await lstat(filename)).mtimeMs <= cutoff) { await unlink(filename); deleted++; }
    }
  }
  await walk(resolved);
  return deleted;
}
