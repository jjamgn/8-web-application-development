// Controlled browser integration only: actual Express/auth/parser/sharp/A service/media.
// Database, sessions and object storage are test doubles; never imported by src/.
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { PhotoService } from '../src/services/photo-service.js';
import { createMediaRouter } from '../src/routes/media.js';
import { MemoryRepository, MemoryStorage } from './role-a/fakes.js';
import { testContext } from './helpers.js';

const context = await testContext();
context.config.APP_ORIGIN = 'http://localhost:3000';
await mkdir(context.config.UPLOAD_TMP_DIR, { recursive: true });
const repository = new MemoryRepository();
const commit = repository.commit.bind(repository);
repository.commit = async input => {
  const photo = await commit(input);
  const uploader = await context.users.byId(input.uploaderId);
  if (!uploader) throw new Error('Controlled uploader fixture missing');
  photo.uploader = uploader;
  return photo;
};
const storage = new MemoryStorage();
const photos = new PhotoService(repository, storage, { tempRoot: context.config.UPLOAD_TMP_DIR });
const app = createApp(context.config, {
  users: context.users, sessions: context.sessions, photos, mediaRouter: createMediaRouter(photos),
}, { webDist: fileURLToPath(new URL('../../web/dist/', import.meta.url)) });
const server = app.listen(3000, '127.0.0.1', () => console.log('Controlled A+B+C browser server: http://localhost:3000'));
server.once('error', error => {
  console.error(error.message); void context.dispose().finally(() => { process.exitCode = 1; });
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => { void context.dispose().finally(() => process.exit(0)); });
  server.closeIdleConnections();
}
process.once('SIGTERM', stop); process.once('SIGINT', stop);
