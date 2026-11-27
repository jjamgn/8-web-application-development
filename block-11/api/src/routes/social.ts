import { Router, json, type Request } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import sharp from 'sharp';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { AppError, notFound } from '../errors.js';
import { requireSession, csrfGuard, assertActiveSession } from '../auth/session.js';
import type { Dependencies } from '../integration.js';
import type { Config } from '../config/env.js';
import { stageUpload } from '../upload/parser.js';
import { prepareImage } from '../images/prepare-image.js';

const profileSelect = { id: true, name: true, bio: true, avatarPhoto: { select: { id: true, status: true, variants: { select: { width: true }, orderBy: { width: 'desc' as const }, take: 1 } } } };
const uuid = (value: unknown) => { const result = z.uuid().safeParse(value); if (!result.success) throw notFound(); return result.data; };
const titleSchema = z.object({ title: z.string().trim().min(1).max(120) }).strict();
const invalid = () => new AppError('VALIDATION_ERROR', 400, 'Thông tin không hợp lệ.');
const profileDto = (user: { id: string; name: string; bio: string; avatarPhoto: { id: string; status: string; variants: { width: number }[] } | null }) => ({ id: user.id, name: user.name, bio: user.bio,
  avatarUrl: user.avatarPhoto?.status === 'PUBLISHED' && user.avatarPhoto.variants[0] ? '/media/photos/' + user.avatarPhoto.id + '/' + user.avatarPhoto.variants[0].width + '.webp' : null });

export function socialRouter(config: Config, dependencies: Dependencies, db: PrismaClient) {
  const router = Router();
  const { sessions, photos } = dependencies;
  const auth = requireSession(sessions), csrf = csrfGuard(config.APP_ORIGIN, config.ADDITIONAL_APP_ORIGINS);
  const body = json({ limit: '16kb' });
  const actor = (req: Request) => assertActiveSession(req, sessions);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  async function publishedPhoto(id: string) {
    if (!await db.photo.findFirst({ where: { id, kind: 'PHOTO', status: 'PUBLISHED' }, select: { id: true } })) throw notFound();
  }
  async function ownedCollection(id: string, ownerId: string) {
    if (!await db.collection.findFirst({ where: { id, ownerId }, select: { id: true } })) throw notFound();
  }
  router.get('/users/:id', async (req, res) => {
    const id = uuid(req.params.id);
    const user = await db.user.findUnique({ where: { id }, select: profileSelect });
    if (!user) throw notFound();
    let viewer: string | undefined;
    if (req.session.userId) { try { viewer = await actor(req); } catch { /* Expired viewers see public data only. */ } }
    const [photoCount, followers, following, relation] = await Promise.all([
      db.photo.count({ where: { uploaderId: id, status: 'PUBLISHED', kind: 'PHOTO' } }),
      db.follow.count({ where: { followeeId: id } }), db.follow.count({ where: { followerId: id } }),
      viewer ? db.follow.findUnique({ where: { followerId_followeeId: { followerId: viewer, followeeId: id } } }) : null,
    ]);
    res.json({ ok: true, data: { ...profileDto(user), photoCount, followers, following, isFollowing: !!relation } });
  });
  router.patch('/me/profile', auth, csrf, body, async (req, res) => {
    const parsed = z.object({ name: z.string().trim().refine(v => Array.from(v).length >= 1 && Array.from(v).length <= 120), bio: z.string().trim().refine(v => Array.from(v).length <= 300) }).strict().safeParse(req.body);
    if (!parsed.success) throw invalid();
    const user = await db.user.update({ where: { id: await actor(req) }, data: parsed.data, select: profileSelect });
    res.json({ ok: true, data: profileDto(user) });
  });
  const avatarLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Bạn đổi avatar quá nhanh. Vui lòng thử lại sau.' } }) });
  router.post('/me/avatar', auth, csrf, avatarLimit, async (req, res) => {
    await mkdir(config.UPLOAD_TMP_DIR, { recursive: true });
    const staged = await stageUpload(req, config.UPLOAD_TMP_DIR);
    let created: string | undefined;
    let linked = false;
    try {
      const userId = await actor(req);
      if (staged.files.length !== 1) throw new AppError('INVALID_FILE_COUNT', 400, 'Avatar cần đúng một ảnh.');
      const file = staged.files[0]!;
      if (file.error) throw new AppError(file.error.code, 400, file.error.message);
      const prepared = await prepareImage({ tempPath: file.tempPath, title: 'Ảnh đại diện', alt: 'Ảnh đại diện' });
      const source = [...prepared.variants].sort((a, b) => b.width - a.width)[0]!;
      const square = path.join(path.dirname(file.tempPath), randomUUID() + '.png');
      const metadata = await sharp(source.tempPath).metadata();
      const side = Math.min(512, metadata.width!, metadata.height!);
      await sharp(source.tempPath).resize(side, side, { fit: 'cover' }).png().toFile(square);
      const avatar = await photos.publishPhoto(await prepareImage({ tempPath: square, title: 'Ảnh đại diện', alt: 'Ảnh đại diện' }), { userId, purpose: 'AVATAR' });
      created = avatar.id;
      await actor(req);
      const result = await db.$transaction(async tx => {
        const rows = await tx.$queryRaw<{ avatarPhotoId: string | null }[]>(Prisma.sql`SELECT "avatarPhotoId" FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`);
        if (!rows[0]) throw notFound();
        const user = await tx.user.update({ where: { id: userId }, data: { avatarPhotoId: avatar.id }, select: profileSelect });
        return { old: rows[0].avatarPhotoId, user };
      }, { maxWait: 10_000, timeout: 30_000 });
      linked = true;
      if (result.old) { try { await photos.deletePhoto(result.old, { userId }); } catch { console.warn('AVATAR_CLEANUP_PENDING'); } }
      res.json({ ok: true, data: profileDto(result.user) });
    } catch (error) {
      // Lost commit responses must never lead to deleting the current avatar.
      if (created && !linked) {
        try { if (!await db.user.findFirst({ where: { avatarPhotoId: created }, select: { id: true } })) await photos.deletePhoto(created, { userId: req.session.userId! }); }
        catch { console.warn('AVATAR_CLEANUP_PENDING'); }
      }
      throw error;
    } finally { await staged.dispose(); }
  });
  router.post('/users/:id/follow', auth, csrf, async (req, res) => {
    const followeeId = uuid(req.params.id), followerId = await actor(req);
    if (followerId === followeeId) throw invalid();
    if (!await db.user.findUnique({ where: { id: followeeId }, select: { id: true } })) throw notFound();
    await db.follow.upsert({ where: { followerId_followeeId: { followerId, followeeId } }, create: { followerId, followeeId }, update: {} });
    res.status(204).end();
  });
  router.delete('/users/:id/follow', auth, csrf, async (req, res) => {
    await db.follow.deleteMany({ where: { followerId: await actor(req), followeeId: uuid(req.params.id) } }); res.status(204).end();
  });
  router.get('/photos/:id/activity', async (req, res) => {
    const photoId = uuid(req.params.id); await publishedPhoto(photoId);
    let viewer: string | undefined;
    if (req.session.userId) { try { viewer = await actor(req); } catch { /* Counts are public. */ } }
    const [likes, liked] = await Promise.all([db.favorite.count({ where: { photoId } }), viewer ? db.favorite.findUnique({ where: { userId_photoId: { userId: viewer, photoId } } }) : null]);
    res.json({ ok: true, data: { likes, liked: !!liked } });
  });
  router.post('/photos/:id/favorite', auth, csrf, async (req, res) => {
    const photoId = uuid(req.params.id), userId = await actor(req); await publishedPhoto(photoId);
    await db.favorite.upsert({ where: { userId_photoId: { userId, photoId } }, create: { userId, photoId }, update: {} }); res.status(204).end();
  });
  router.delete('/photos/:id/favorite', auth, csrf, async (req, res) => {
    await db.favorite.deleteMany({ where: { userId: await actor(req), photoId: uuid(req.params.id) } }); res.status(204).end();
  });
  router.get('/me/collections', auth, async (req, res) => {
    const ownerId = await actor(req);
    const items = await db.collection.findMany({ where: { ownerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, title: true, _count: { select: { items: { where: { photo: { status: 'PUBLISHED', kind: 'PHOTO' } } } } } } });
    res.json({ ok: true, data: { items: items.map(c => ({ id: c.id, title: c.title, count: c._count.items })) } });
  });
  router.post('/me/collections', auth, csrf, body, async (req, res) => {
    const parsed = titleSchema.safeParse(req.body); if (!parsed.success) throw invalid();
    const ownerId = await actor(req);
    const collection = await db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${ownerId}::uuid FOR UPDATE`);
      if (await tx.collection.count({ where: { ownerId } }) >= 100) throw new AppError('COLLECTION_LIMIT', 400, 'Tối đa 100 bộ sưu tập.');
      return tx.collection.create({ data: { ownerId, title: parsed.data.title }, select: { id: true, title: true } });
    }, { maxWait: 10_000, timeout: 30_000 });
    res.status(201).json({ ok: true, data: collection });
  });
  router.patch('/me/collections/:id', auth, csrf, body, async (req, res) => {
    const id = uuid(req.params.id), ownerId = await actor(req), parsed = titleSchema.safeParse(req.body); if (!parsed.success) throw invalid();
    const changed = await db.collection.updateMany({ where: { id, ownerId }, data: parsed.data }); if (!changed.count) throw notFound(); res.status(204).end();
  });
  router.delete('/me/collections/:id', auth, csrf, async (req, res) => {
    const changed = await db.collection.deleteMany({ where: { id: uuid(req.params.id), ownerId: await actor(req) } }); if (!changed.count) throw notFound(); res.status(204).end();
  });
  router.post('/me/collections/:id/photos/:photoId', auth, csrf, async (req, res) => {
    const collectionId = uuid(req.params.id), photoId = uuid(req.params.photoId), ownerId = await actor(req);
    await ownedCollection(collectionId, ownerId); await publishedPhoto(photoId);
    await db.collectionItem.upsert({ where: { collectionId_photoId: { collectionId, photoId } }, create: { collectionId, photoId }, update: {} }); res.status(204).end();
  });
  router.delete('/me/collections/:id/photos/:photoId', auth, csrf, async (req, res) => {
    const collectionId = uuid(req.params.id); await ownedCollection(collectionId, await actor(req));
    await db.collectionItem.deleteMany({ where: { collectionId, photoId: uuid(req.params.photoId) } }); res.status(204).end();
  });
  return router;
}
