import { Router } from 'express';
import { z } from 'zod';
import { mkdir } from 'node:fs/promises';
import type { Config } from '../config/env.js';
import type { Dependencies } from '../integration.js';
import type { UploadResult, UploadData } from '../../../contracts/index.js';
import { AppError, notFound } from '../errors.js';
import { requireSession, csrfGuard, assertActiveSession } from '../auth/session.js';
import { stageUpload } from '../upload/parser.js';
import { prepareImage } from '../images/prepare-image.js';

const uuid = z.uuid();
const fileErrorCodes = new Set(['FILE_TOO_LARGE', 'UNSUPPORTED_IMAGE_TYPE', 'PIXEL_LIMIT_EXCEEDED', 'INVALID_IMAGE', 'IMAGE_PROCESSING_FAILED']);
export function photosRouter(config: Config, dependencies: Dependencies) {
  const router = Router();
  const { photos, sessions } = dependencies;
  router.get('/', async (req, res) => {
    const query = z.object({ page: z.string().regex(/^[1-9]\d*$/).default('1'), mine: z.literal('true').optional(), q: z.string().trim().max(120).optional(), user: z.uuid().optional(), favorites: z.literal('true').optional(), following: z.literal('true').optional(), collection: z.uuid().optional() }).strict().safeParse(req.query);
    if (!query.success || !Number.isSafeInteger(Number(query.data.page))) throw new AppError('INVALID_QUERY', 400, 'Số trang hoặc bộ lọc không hợp lệ.');
    const v = query.data;
    const privateFeed = v.mine || v.favorites || v.following || v.collection;
    const viewerId = privateFeed ? await assertActiveSession(req, sessions) : undefined;
    if (privateFeed) res.set('Cache-Control', 'no-store');
    if (v.mine && v.user) throw new AppError('INVALID_QUERY', 400, 'Chỉ chọn một tác giả.');
    res.json({ ok: true, data: await photos.listPhotos({ page: Number(v.page),
      ...(v.mine ? { uploaderId: viewerId! } : v.user ? { uploaderId: v.user } : {}),
      ...(v.q ? { q: v.q } : {}), ...(v.favorites ? { favoritesBy: viewerId! } : {}),
      ...(v.following ? { followingBy: viewerId! } : {}), ...(v.collection ? { collectionId: v.collection, viewerId: viewerId! } : {}) }) });
  });
  router.get('/:id', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound();
    res.json({ ok: true, data: await photos.getPhoto(req.params.id!) });
  });
  router.post('/', requireSession(sessions), csrfGuard(config.APP_ORIGIN, config.ADDITIONAL_APP_ORIGINS), async (req, res) => {
    // No disk operations occur until authentication and Origin/CSRF checks succeed.
    await mkdir(config.UPLOAD_TMP_DIR, { recursive: true });
    const staged = await stageUpload(req, config.UPLOAD_TMP_DIR);
    let data: UploadData | undefined;
    try {
      const userId = await assertActiveSession(req, sessions);
      const results: UploadResult[] = [];
      for (const file of staged.files) {
        if (req.aborted || res.destroyed) break;
        if (file.error) { results.push({ index: file.index, ok: false, error: file.error }); continue; }
        try {
          const prepared = await prepareImage({ tempPath: file.tempPath, ...staged.metadata[file.index]! });
          // A owns generated variant files from this call, including rollback/finally cleanup.
          const photo = await photos.publishPhoto(prepared, { userId });
          results.push({ index: file.index, ok: true, photo });
        } catch (error) {
          const code = error instanceof AppError && fileErrorCodes.has(error.code) ? error.code : 'PHOTO_SAVE_FAILED';
          results.push({ index: file.index, ok: false, error: { code,
            message: code === 'PHOTO_SAVE_FAILED' ? 'Không thể lưu ảnh. Vui lòng kiểm tra gallery trước khi thử lại.' : (error as Error).message } });
        }
      }
      if (!res.destroyed) {
        const succeeded = results.filter(item => item.ok).length;
        data = { results, succeeded, failed: results.length - succeeded };
      }
    } finally { await staged.dispose(); }
    if (data && !res.destroyed) res.json({ ok: true, data });
  });
  router.delete('/:id', requireSession(sessions), csrfGuard(config.APP_ORIGIN, config.ADDITIONAL_APP_ORIGINS), async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound();
    const userId = await assertActiveSession(req, sessions);
    const outcome = await photos.deletePhoto(String(req.params.id), { userId });
    if (outcome === 'DELETED') res.status(204).end();
    else res.status(202).json({ ok: true, data: { id: req.params.id, status: 'DELETING' } });
  });
  return router;
}
