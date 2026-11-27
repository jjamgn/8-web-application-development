import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { CHUNK_SIZE, type ObjectStorage, type StagedVariant, type VariantManifest } from './types.js';
import { chunkKey } from './keys.js';
import { integrityError, invalidPrepared } from './errors.js';

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export async function trustedTempPath(tempRoot: string, candidate: string): Promise<string> {
  const root = await realpath(tempRoot);
  const resolved = await realpath(candidate);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative) ||
      !(await stat(resolved)).isFile()) throw invalidPrepared();
  return resolved;
}

async function readExactly(file: Awaited<ReturnType<typeof open>>, offset: number, bytes: number): Promise<Buffer> {
  const body = Buffer.alloc(bytes);
  let read = 0;
  while (read < bytes) {
    const result = await file.read(body, read, bytes - read, offset + read);
    if (result.bytesRead === 0) throw integrityError();
    read += result.bytesRead;
  }
  return body;
}

export async function planVariant(photoId: string, variant: StagedVariant, tempRoot: string): Promise<VariantManifest> {
  const filename = await trustedTempPath(tempRoot, variant.tempPath);
  const file = await open(filename, 'r');
  try {
    const size = (await file.stat()).size;
    if (!Number.isSafeInteger(size) || size <= 0 || size > 2_147_483_647 || size !== variant.bytes) throw invalidPrepared();
    const fullHash = createHash('sha256');
    const chunks: VariantManifest['chunks'] = [];
    for (let offset = 0, partNumber = 1; offset < size; offset += CHUNK_SIZE, partNumber++) {
      const body = await readExactly(file, offset, Math.min(CHUNK_SIZE, size - offset));
      fullHash.update(body);
      chunks.push({ partNumber, offset, bytes: body.length, sha256: sha256(body), storageKey: chunkKey(photoId, variant.width, partNumber) });
    }
    return {
      width: variant.width, height: variant.height, mime: 'image/webp', bytes: size,
      sha256: fullHash.digest('hex'), chunkSize: CHUNK_SIZE, chunkCount: chunks.length,
      storagePrefix: `photos/${photoId}/${variant.width}/`, chunks,
    };
  } finally { await file.close(); }
}

export async function uploadVariant(storage: ObjectStorage, variant: StagedVariant, manifest: VariantManifest, root: string): Promise<void> {
  const file = await open(await trustedTempPath(root, variant.tempPath), 'r');
  try {
    if ((await file.stat()).size !== manifest.bytes) throw integrityError();
    for (const chunk of manifest.chunks) {
      const bytes = await readExactly(file, chunk.offset, chunk.bytes);
      if (sha256(bytes) !== chunk.sha256) throw integrityError();
      await storage.put(chunk.storageKey, bytes);
    }
  } finally { await file.close(); }
}

export function validateManifest(photoId: string, manifest: VariantManifest): void {
  if (!Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.mime !== 'image/webp' ||
      manifest.chunkSize !== CHUNK_SIZE || manifest.chunkCount !== Math.ceil(manifest.bytes / CHUNK_SIZE) ||
      manifest.chunks.length !== manifest.chunkCount || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      manifest.storagePrefix !== `photos/${photoId}/${manifest.width}/`) throw integrityError();
  for (let i = 0; i < manifest.chunks.length; i++) {
    const chunk = manifest.chunks[i];
    if (chunk.partNumber !== i + 1 || chunk.offset !== i * CHUNK_SIZE ||
        chunk.bytes !== Math.min(CHUNK_SIZE, manifest.bytes - chunk.offset) ||
        chunk.storageKey !== chunkKey(photoId, manifest.width, i + 1) || !/^[a-f0-9]{64}$/.test(chunk.sha256)) throw integrityError();
  }
}

export type AssembledMedia = { filename: string; bytes: number; dispose(): Promise<void> };
export async function assembleVariant(storage: ObjectStorage, photoId: string, manifest: VariantManifest, root: string, signal?: AbortSignal): Promise<AssembledMedia> {
  validateManifest(photoId, manifest);
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'media-'));
  const filename = path.join(directory, 'image.webp');
  const dispose = () => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const hash = createHash('sha256');
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(filename, 'wx');
    for (const chunk of manifest.chunks) {
      signal?.throwIfAborted();
      const bytes = await storage.get(chunk.storageKey, signal);
      if (bytes.byteLength !== chunk.bytes || sha256(bytes) !== chunk.sha256) throw integrityError();
      hash.update(bytes);
      // writeFile on an open FileHandle advances its current position and writes all bytes.
      await file.writeFile(bytes);
    }
    signal?.throwIfAborted();
    if ((await file.stat()).size !== manifest.bytes || hash.digest('hex') !== manifest.sha256) throw integrityError();
    await file.close(); file = undefined;
    return { filename, bytes: manifest.bytes, dispose };
  } catch (error) {
    await file?.close();
    await dispose();
    throw error;
  }
}
