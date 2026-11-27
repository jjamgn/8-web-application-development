import { randomUUID } from 'node:crypto';
import { integrityError, notFound, PhotoError, storageError } from '../../src/storage/errors.js';
import type { ObjectStorage, PhotoRepository, StoredPhoto, NewPhoto, CleanupTask } from '../../src/storage/types.js';

export class MemoryStorage implements ObjectStorage {
  objects = new Map<string, Uint8Array>();
  putCalls = 0;
  failPutAt = 0;
  failDelete = false;
  failGet = false;
  lastModified = new Date();
  async put(key: string, bytes: Uint8Array) {
    this.putCalls++;
    if (this.putCalls === this.failPutAt) throw storageError();
    this.objects.set(key, Buffer.from(bytes));
  }
  async get(key: string) {
    if (this.failGet) throw storageError();
    const value = this.objects.get(key);
    if (!value) throw integrityError();
    return value;
  }
  async delete(key: string) { if (this.failDelete) throw storageError(); this.objects.delete(key); }
  async head(key: string) { const value = this.objects.get(key); return value ? { bytes: value.byteLength } : null; }
  async *list() { for (const key of this.objects.keys()) yield { key, lastModified: this.lastModified }; }
  async check() {}
}
export class MemoryRepository implements PhotoRepository {
  photos = new Map<string, StoredPhoto>();
  tasks = new Map<string, { status: 'PENDING' | 'DONE'; attempts: number }>();
  failCommit: 'before' | 'after' | null = null;
  failFind = false;
  failJournal = false;
  async journal(keys: string[]) {
    if (this.failJournal) throw new Error('DB offline');
    for (const key of keys) this.tasks.set(key, { status: 'PENDING', attempts: 0 });
  }
  async commit(photo: NewPhoto) {
    if (this.failCommit === 'before') throw new Error('DB commit failed');
    const row: StoredPhoto = { ...photo, status: 'PUBLISHED', createdAt: new Date(), uploader: { id: photo.uploaderId, name: 'Người đăng' } };
    this.photos.set(photo.id, row);
    for (const v of photo.variants) for (const c of v.chunks) await this.taskDone(c.storageKey);
    if (this.failCommit === 'after') throw new Error('DB response lost after commit');
    return row;
  }
  async find(id: string) { if (this.failFind) throw new Error('DB connection lost'); return this.photos.get(id) ?? null; }
  async list(page: number, uploaderId?: string) {
    const all = [...this.photos.values()].filter(p => p.status === 'PUBLISHED' && (!uploaderId || p.uploaderId === uploaderId)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    return { items: all.slice((page - 1) * 12, page * 12), total: all.length };
  }
  async markDeleting(id: string, actor: string) {
    const photo = this.photos.get(id);
    if (!photo) throw notFound();
    if (photo.uploaderId !== actor) throw new PhotoError('FORBIDDEN', 403, 'Forbidden');
    photo.status = 'DELETING'; return photo;
  }
  async removeDeleting(id: string) { if (this.photos.get(id)?.status === 'DELETING') this.photos.delete(id); }
  async referenceStatus(key: string) {
    for (const photo of this.photos.values()) if (photo.variants.some(v => v.chunks.some(c => c.storageKey === key))) return photo.status;
    return null;
  }
  async *pendingTasks(): AsyncIterable<CleanupTask> {
    for (const [storageKey, task] of this.tasks) if (task.status === 'PENDING') yield { storageKey, createdAt: new Date() };
  }
  async *deletingPhotos() { for (const photo of this.photos.values()) if (photo.status === 'DELETING') yield photo; }
  async taskDone(key: string) { const task = this.tasks.get(key); if (task) task.status = 'DONE'; }
  async taskFailed(key: string) { const task = this.tasks.get(key); if (task) { task.status = 'PENDING'; task.attempts++; } }
}
export const actor = { userId: randomUUID() };
