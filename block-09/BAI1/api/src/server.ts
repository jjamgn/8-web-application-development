import { app } from './app.js';
import { prisma } from './db.js';

if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL. Xem .env.example.');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT không hợp lệ.');
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => console.log(`Bếp Nhà API: http://${host}:${port}/api/dishes`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); }));
}
