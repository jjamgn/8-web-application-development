import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config/env.js';
import type { Dependencies } from './integration.js';
import { sessionMiddleware } from './auth/session.js';
import { authRouter } from './auth/routes.js';
import { photosRouter } from './routes/photos.js';
import { AppError, notFound } from './errors.js';

// Stable codes are also accepted from A's service without relying on message parsing.
const serviceStatuses: Record<string, number> = {
  NOT_FOUND: 404, FORBIDDEN: 403, AUTH_REQUIRED: 401, INVALID_QUERY: 400,
  MEDIA_INTEGRITY_ERROR: 502, STORAGE_UNAVAILABLE: 503
};
export function createApp(config: Config, dependencies: Dependencies, options: { webDist?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  // Public media does not need to load or create sessions.
  app.use('/media', dependencies.mediaRouter);
  app.use('/media', (_req, _res, next) => next(notFound()));
  app.use('/api', sessionMiddleware(config, dependencies.sessions));
  app.use('/api/auth', authRouter(config, dependencies.users, dependencies.sessions));
  app.use('/api/photos', photosRouter(config, dependencies));
  app.use('/api', (_req, _res, next) => next(notFound()));
  if (options.webDist) {
    const index = path.join(options.webDist, 'index.html');
    if (!existsSync(index)) throw new Error('React build is missing. Build role C web/ before production startup.');
    app.use(express.static(options.webDist));
    app.get('/{*path}', (_req, res) => { res.set('Cache-Control', 'no-cache').sendFile(index); });
  }
  app.use((_req, _res, next) => next(notFound()));
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) return next(error);
    let status = 500, code = 'INTERNAL_ERROR', message = 'Có lỗi hệ thống. Vui lòng thử lại sau.';
    if (error instanceof AppError) { status = error.status; code = error.code; message = error.message; }
    else if (typeof error === 'object' && error && 'code' in error && serviceStatuses[String(error.code)]) {
      code = String(error.code); status = serviceStatuses[code]!;
      message = { NOT_FOUND: 'Không tìm thấy nội dung.', FORBIDDEN: 'Chỉ chủ ảnh được xóa.', INVALID_QUERY: 'Số trang không hợp lệ.',
        AUTH_REQUIRED: 'Vui lòng đăng nhập.', MEDIA_INTEGRITY_ERROR: 'Không thể xác minh dữ liệu ảnh.',
        STORAGE_UNAVAILABLE: 'Kho ảnh tạm thời không sẵn sàng.' }[code] ?? message;
    } else if (typeof error === 'object' && error && 'type' in error) {
      if (error.type === 'entity.too.large') { status = 413; code = 'REQUEST_TOO_LARGE'; message = 'Dữ liệu JSON vượt quá 16 KiB.'; }
      if (error.type === 'entity.parse.failed') { status = 400; code = 'VALIDATION_ERROR'; message = 'JSON không hợp lệ.'; }
    }
    res.set('Cache-Control', 'no-store').status(status).json({ ok: false, error: { code, message } });
  };
  app.use(errorHandler);
  return app;
}
