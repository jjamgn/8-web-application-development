import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { resourceRouter } from './routes/resources.js';
import { BusinessError, databaseBusinessError } from './services/resources.js';
import { authRouter } from './routes/auth.js';
import { requireAuth } from './middleware/require-auth.js';
import { AuthError } from './lib/auth-errors.js';
import { spaOrigins } from './lib/auth-http.js';
import { unavailableAuthServices, type AuthServices } from './lib/auth-services.js';

/** A's production adapter is injected here after its migration/services arrive. */
export function createApp(services: AuthServices = unavailableAuthServices) {
  const app = express();
  const origins = spaOrigins();
  app.disable('x-powered-by');
  // CORS precedes parsers, routes and errors so the SPA can inspect error statuses.
  app.use((req, res, next) => {
    res.vary('Origin');
    const origin = req.get('Origin');
    if (origin && origins.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  app.use(helmet());
  app.use(express.json({ limit: '100kb', strict: false }));
  app.use('/api/auth', authRouter(services, origins));
  for (const kind of ['dishes', 'chefs', 'ingredients'] as const) {
    app.use(`/api/${kind}`, resourceRouter(kind, requireAuth(services)));
  }
  app.use((_req, res) => { res.status(404).json({ message: 'Không tìm thấy endpoint.' }); });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AuthError) {
      if (error.status === 401) res.set('WWW-Authenticate', 'Bearer');
      if (error.retryAfter !== undefined) res.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfter))));
      res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
      return;
    }
    const business = error instanceof BusinessError ? error : databaseBusinessError(error);
    if (business) {
      res.status(200).json({ ok: false, error: { code: business.code, message: business.message, fields: business.fields } });
      return;
    }
    const type = (error as { type?: string } | null)?.type;
    if (type === 'entity.parse.failed' || type === 'entity.too.large' || type === 'charset.unsupported' || type === 'encoding.unsupported') {
      res.status(type === 'entity.too.large' ? 413 : type?.endsWith('unsupported') ? 415 : 400).json({ message: 'JSON hoặc định dạng request không hợp lệ.' });
      return;
    }
    // Never expose database errors, stack traces or connection strings.
    res.status(500).json({ message: 'Không thể xử lý yêu cầu. Vui lòng thử lại sau.' });
  });
  return app;
}

export const app = createApp();
