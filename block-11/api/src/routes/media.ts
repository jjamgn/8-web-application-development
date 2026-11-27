import { Router } from 'express';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { PhotoService } from '../services/photo-service.js';
import { PhotoError, notFound } from '../storage/errors.js';
import type { AssembledMedia } from '../storage/chunks.js';

/** B mounts app.use('/media', createMediaRouter(photoService)); no auth/session required. */
export function createMediaRouter(service: Pick<PhotoService, 'assembleMedia'>): Router {
  const router = Router();
  router.get('/photos/:photoId/:filename', async (req, res) => {
    const abort = new AbortController();
    const close = () => { if (!res.writableFinished) abort.abort(); };
    res.once('close', close);
    let assembled: AssembledMedia | undefined;
    try {
      const match = /^([1-9][0-9]*)\.webp$/.exec(req.params.filename);
      if (!match || !Number.isSafeInteger(Number(match[1]))) throw notFound();
      assembled = await service.assembleMedia(req.params.photoId, Number(match[1]), abort.signal);
      abort.signal.throwIfAborted();
      if (req.query.download !== undefined) {
        if (req.query.download !== '1') throw notFound();
        res.set('Content-Disposition', 'attachment; filename="photo-' + req.params.photoId + '-' + match[1] + '.webp"');
      }
      res.set({ 'Content-Type': 'image/webp', 'Content-Length': String(assembled.bytes), 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      // Range is intentionally ignored: always a verified, complete 200 representation.
      await pipeline(createReadStream(assembled.filename), res, { signal: abort.signal });
    } catch (error) {
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      res.removeHeader('Content-Length');
      const safe = error instanceof PhotoError ? error : new PhotoError('INTERNAL_ERROR', 500, 'Không thể tải ảnh.');
      res.status(safe.status).set('Cache-Control', 'no-store').json({ ok: false, error: { code: safe.code, message: safe.message } });
    } finally {
      res.off('close', close);
      await assembled?.dispose();
    }
  });
  router.use((_req, res) => { res.status(404).set('Cache-Control', 'no-store').json({ ok: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy ảnh.' } }); });
  return router;
}
