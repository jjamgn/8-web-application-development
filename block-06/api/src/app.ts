import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { resourceRouter } from './routes/resources.js';
import { BusinessError, databaseBusinessError } from './services/resources.js';

export const app = express();
const spaOrigins = new Set<string>();
for (const value of (process.env.SPA_ORIGIN || 'http://localhost:5173').split(',')) {
  const origin = value.trim();
  const parsedOrigin = new URL(origin);
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
    throw new Error('SPA_ORIGIN phải gồm các origin HTTP(S) chính xác, cách nhau bằng dấu phẩy, không chứa path hoặc dấu / cuối.');
  }
  spaOrigins.add(origin);
  // Vite can be opened using either loopback hostname on the configured port.
  if (parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1') {
    parsedOrigin.hostname = parsedOrigin.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    spaOrigins.add(parsedOrigin.origin);
  }
}
app.disable('x-powered-by');
// CORS precedes parsers, routes and errors so the SPA can inspect error statuses.
app.use((req, res, next) => {
  res.vary('Origin');
  const origin = req.get('Origin');
  if (origin && spaOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});
app.use(helmet());
app.use(express.json({ limit: '100kb', strict: false }));
for (const kind of ['dishes', 'chefs', 'ingredients'] as const) {
  app.use(`/api/${kind}`, resourceRouter(kind));
}
app.use((_req, res) => { res.status(404).json({ message: 'Không tìm thấy endpoint.' }); });
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
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
