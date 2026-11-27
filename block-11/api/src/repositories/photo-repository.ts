import { Prisma, type PrismaClient } from '@prisma/client';
import type { NewPhoto, PhotoRepository, StoredPhoto, CleanupTask } from '../storage/types.js';
import { notFound, PhotoError, integrityError } from '../storage/errors.js';

const includePhoto = {
  uploader: { select: { id: true, name: true } },
  variants: { orderBy: { width: 'asc' }, include: { chunks: { orderBy: { partNumber: 'asc' } } } },
} satisfies Prisma.PhotoInclude;
type Row = Prisma.PhotoGetPayload<{ include: typeof includePhoto }>;
function map(row: Row): StoredPhoto {
  return { ...row, variants: row.variants.map(variant => {
    if (variant.mime !== 'image/webp') throw integrityError();
    return { ...variant, mime: 'image/webp' as const };
  }) };
}

export class PrismaPhotoRepository implements PhotoRepository {
  constructor(private readonly db: PrismaClient) {}
  async journal(keys: string[]): Promise<void> {
    await this.db.storageCleanupTask.createMany({ data: keys.map(storageKey => ({ storageKey })) });
  }
  async commit(photo: NewPhoto): Promise<StoredPhoto> {
    const { variants, ...fields } = photo;
    return this.db.$transaction(async tx => {
      const created = await tx.photo.create({ data: {
        ...fields,
        variants: { create: variants.map(({ chunks, ...variant }) => ({ ...variant, chunks: { create: chunks } })) },
      }, include: includePhoto });
      const keys = variants.flatMap(v => v.chunks.map(c => c.storageKey));
      const completed = await tx.storageCleanupTask.updateMany({ where: { storageKey: { in: keys }, status: 'PENDING' }, data: { status: 'DONE', lastErrorCode: null } });
      if (completed.count !== keys.length) throw new Error('Missing publication journal');
      return map(created);
    }, { maxWait: 10_000, timeout: 30_000 });
  }
  async find(id: string): Promise<StoredPhoto | null> {
    const row = await this.db.photo.findUnique({ where: { id }, include: includePhoto });
    return row ? map(row) : null;
  }
  async list(page: number, uploaderId?: string): Promise<{ items: StoredPhoto[]; total: number }> {
    return this.db.$transaction(async tx => {
      const where = { status: 'PUBLISHED' as const, ...(uploaderId ? { uploaderId } : {}) };
      const total = await tx.photo.count({ where });
      const rows = await tx.photo.findMany({ where, skip: (page - 1) * 12, take: 12, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: includePhoto });
      return { total, items: rows.map(map) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 30_000 });
  }
  async markDeleting(id: string, actorId: string): Promise<StoredPhoto> {
    // Conditional write rechecks ownership at mutation time; status never returns to PUBLISHED.
    await this.db.photo.updateMany({ where: { id, uploaderId: actorId, status: 'PUBLISHED' }, data: { status: 'DELETING' } });
    const photo = await this.find(id);
    if (!photo) throw notFound();
    if (photo.uploaderId !== actorId) throw new PhotoError('FORBIDDEN', 403, 'Chỉ chủ ảnh được xóa.');
    return photo;
  }
  async removeDeleting(id: string): Promise<void> {
    await this.db.photo.deleteMany({ where: { id, status: 'DELETING' } });
  }
  async referenceStatus(key: string): Promise<'PUBLISHED' | 'DELETING' | null> {
    const chunk = await this.db.photoChunk.findUnique({ where: { storageKey: key }, select: { variant: { select: { photo: { select: { status: true } } } } } });
    return chunk?.variant.photo.status ?? null;
  }
  async *pendingTasks(): AsyncIterable<CleanupTask> {
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.db.storageCleanupTask.findMany({ where: { status: 'PENDING' }, take: 100, orderBy: { id: 'asc' }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!rows.length) return;
      for (const row of rows) yield { storageKey: row.storageKey, createdAt: row.createdAt };
      cursor = rows[rows.length - 1]!.id;
    }
  }
  async *deletingPhotos(): AsyncIterable<StoredPhoto> {
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.db.photo.findMany({ where: { status: 'DELETING', ...(cursor ? { id: { gt: cursor } } : {}) }, include: includePhoto, take: 100, orderBy: { id: 'asc' } });
      if (!rows.length) return;
      for (const row of rows) yield map(row);
      cursor = rows[rows.length - 1]!.id;
    }
  }
  async taskDone(key: string): Promise<void> {
    await this.db.storageCleanupTask.updateMany({ where: { storageKey: key }, data: { status: 'DONE', lastErrorCode: null } });
  }
  async taskFailed(key: string, code: string): Promise<void> {
    await this.db.storageCleanupTask.updateMany({ where: { storageKey: key }, data: { status: 'PENDING', attempts: { increment: 1 }, lastErrorCode: code } });
  }
}
