import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { assembleVariant, planVariant, trustedTempPath, uploadVariant, type AssembledMedia } from '../storage/chunks.js';
import { PhotoError, invalidPrepared, notFound, safeErrorCode } from '../storage/errors.js';
import { UUID_PATTERN, assertStorageKey } from '../storage/keys.js';
import type { Actor, PhotoFilter, NewPhoto, ObjectStorage, PhotoDto, PhotoRepository, PreparedPhoto, StoredPhoto, VariantManifest } from '../storage/types.js';
import { sweepTemporaryFiles } from '../storage/temp-cleanup.js';

function dto(photo: StoredPhoto): PhotoDto {
  return {
    id: photo.id, title: photo.title, alt: photo.alt, uploader: photo.uploader,
    width: photo.width, height: photo.height, createdAt: photo.createdAt.toISOString(),
    variants: [...photo.variants].sort((a, b) => a.width - b.width).map(v => ({
      width: v.width, height: v.height, mime: v.mime, bytes: v.bytes, url: `/media/photos/${photo.id}/${v.width}.webp`,
    })),
  };
}
function requireActor(actor: Actor): void {
  if (!actor || !UUID_PATTERN.test(actor.userId)) throw new PhotoError('AUTH_REQUIRED', 401, 'Vui lòng đăng nhập.');
}
function validatePrepared(input: PreparedPhoto): void {
  if (!input || typeof input.title !== 'string' || typeof input.alt !== 'string' || !input.title.trim() ||
      input.title !== input.title.trim() || [...input.title].length > 120 || !input.alt.trim() || input.alt !== input.alt.trim() || [...input.alt].length > 300 ||
      !Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) || input.width <= 0 || input.height <= 0 ||
      input.width * input.height > 40_000_000 || !Array.isArray(input.variants)) throw invalidPrepared();
  const expected = [...new Set([320, 960, 1600].map(w => Math.min(w, input.width)))].sort((a, b) => a - b);
  const actual = input.variants.map(v => v.width).sort((a, b) => a - b);
  if (actual.length !== expected.length || actual.some((w, i) => w !== expected[i])) throw invalidPrepared();
  for (const variant of input.variants) {
    if (variant.mime !== 'image/webp' || !Number.isSafeInteger(variant.height) || variant.height <= 0 ||
        Math.abs(variant.height - (input.height * variant.width / input.width)) > 1 ||
        !Number.isSafeInteger(variant.bytes) || variant.bytes <= 0) throw invalidPrepared();
  }
}

export type PhotoServiceOptions = { tempRoot: string; warn?: (code: string) => void };
export class PhotoService {
  constructor(private readonly repository: PhotoRepository, private readonly storage: ObjectStorage, private readonly options: PhotoServiceOptions) {}

  async publishPhoto(input: PreparedPhoto, actor: Actor): Promise<PhotoDto> {
    const trustedFiles = new Set<string>();
    let photoId: string | undefined;
    let manifests: VariantManifest[] = [];
    let journaled = false;
    try {
      requireActor(actor);
      // Accept ownership of all safe staged files, including those after a variant which fails validation.
      if (Array.isArray(input?.variants)) for (const variant of input.variants) {
        if (typeof variant?.tempPath === 'string') {
          try { trustedFiles.add(await trustedTempPath(this.options.tempRoot, variant.tempPath)); }
          catch { /* Never delete paths outside staging; validation/planning below will reject them. */ }
        }
      }
      validatePrepared(input);
      photoId = randomUUID();
      for (const variant of input.variants) {
        manifests.push(await planVariant(photoId, variant, this.options.tempRoot));
      }
      const photo: NewPhoto = { id: photoId, uploaderId: actor.userId, kind: actor.purpose ?? 'PHOTO', title: input.title, alt: input.alt, width: input.width, height: input.height, variants: manifests };
      await this.repository.journal(manifests.flatMap(v => v.chunks.map(c => c.storageKey)));
      journaled = true;
      for (const [index, variant] of input.variants.entries()) {
        const manifest = manifests[index];
        if (!manifest) throw invalidPrepared();
        await uploadVariant(this.storage, variant, manifest, this.options.tempRoot);
      }
      return dto(await this.repository.commit(photo));
    } catch (error) {
      const databaseCode = (error as { code?: unknown } | null)?.code;
      if (typeof databaseCode === 'string' && /^P\d{4}$/.test(databaseCode)) {
        this.options.warn?.(`PUBLICATION_FAILED_${databaseCode}`);
      }
      if (journaled && photoId) {
        // Commit may have succeeded even when the DB response was lost. Unknown state => retain journal, never delete blindly.
        try {
          const committed = await this.repository.find(photoId);
          if (committed?.status === 'PUBLISHED') return dto(committed);
          if (!committed) for (const key of manifests.flatMap(v => v.chunks.map(c => c.storageKey))) await this.cleanKey(key);
        } catch { this.options.warn?.('PUBLICATION_RECOVERY_PENDING'); }
      }
      if (error instanceof PhotoError && error.code === 'AUTH_REQUIRED') throw error;
      throw new PhotoError('PHOTO_SAVE_FAILED', 500, 'Không thể lưu ảnh đã xử lý.');
    } finally {
      // Only delete validated paths inside the staging root. Never unlink a caller-supplied external path.
      for (const filename of trustedFiles) {
        try { await unlink(filename); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.options.warn?.('TEMP_CLEANUP_PENDING'); }
      }
    }
  }

  async listPhotos({ page, uploaderId, ...filter }: { page: number; uploaderId?: string } & PhotoFilter) {
    if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * 12 > 2_147_483_647) throw new PhotoError('INVALID_QUERY', 400, 'Trang không hợp lệ.');
    const result = await this.repository.list(page, uploaderId, filter);
    return { items: result.items.map(dto), page, pageSize: 12 as const, total: result.total, totalPages: Math.ceil(result.total / 12) };
  }
  async getPhoto(id: string): Promise<PhotoDto> { return dto(await this.published(id)); }
  private async published(id: string): Promise<StoredPhoto> {
    if (!UUID_PATTERN.test(id)) throw notFound();
    const photo = await this.repository.find(id);
    if (!photo || photo.status !== 'PUBLISHED') throw notFound();
    return photo;
  }
  async assembleMedia(id: string, width: number, signal?: AbortSignal): Promise<AssembledMedia> {
    const photo = await this.published(id);
    const variant = photo.variants.find(v => v.width === width);
    if (!variant) throw notFound();
    const media = await assembleVariant(this.storage, id, variant, this.options.tempRoot, signal);
    // Deletion may have happened during assembly; do not start a fresh response for a hidden photo.
    try { await this.published(id); return media; }
    catch (error) { await media.dispose(); throw error; }
  }
  async deletePhoto(id: string, actor: Actor): Promise<'DELETED' | 'DELETING'> {
    requireActor(actor);
    if (!UUID_PATTERN.test(id)) throw notFound();
    const photo = await this.repository.markDeleting(id, actor.userId);
    return this.finishDeletion(photo);
  }
  private async finishDeletion(photo: StoredPhoto): Promise<'DELETED' | 'DELETING'> {
    let failed = false;
    for (const key of photo.variants.flatMap(v => v.chunks.map(c => c.storageKey))) {
      try { assertStorageKey(key); await this.storage.delete(key); }
      catch { failed = true; this.options.warn?.('DELETE_PENDING'); }
    }
    if (failed) return 'DELETING';
    await this.repository.removeDeleting(photo.id);
    return 'DELETED';
  }
  private async cleanKey(key: string): Promise<boolean> {
    assertStorageKey(key);
    if (await this.repository.referenceStatus(key) === 'PUBLISHED') {
      await this.repository.taskDone(key);
      return false;
    }
    try {
      await this.storage.delete(key);
      await this.repository.taskDone(key);
      return true;
    } catch (error) {
      await this.repository.taskFailed(key, safeErrorCode(error));
      throw error;
    }
  }
  /** Caller MUST stop API/publishers before running this maintenance-only operation. */
  async cleanupStorage(): Promise<{ deleted: number; pending: number; failed: number }> {
    let deleted = 0, pending = 0, failed = 0;
    for await (const photo of this.repository.deletingPhotos()) {
      try {
        const result = await this.finishDeletion(photo);
        if (result === 'DELETING') { pending++; failed++; }
        else deleted += photo.variants.reduce((n, v) => n + v.chunks.length, 0);
      } catch { pending++; failed++; }
    }
    for await (const task of this.repository.pendingTasks()) {
      try { if (await this.cleanKey(task.storageKey)) deleted++; }
      catch { pending++; failed++; }
    }
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for await (const item of this.storage.list()) {
      try {
        assertStorageKey(item.key);
        if (item.lastModified.getTime() > cutoff || await this.repository.referenceStatus(item.key)) continue;
        await this.storage.delete(item.key); deleted++;
      } catch { pending++; failed++; }
    }
    try { deleted += await sweepTemporaryFiles(this.options.tempRoot, cutoff); }
    catch { pending++; failed++; }
    return { deleted, pending, failed };
  }
}
