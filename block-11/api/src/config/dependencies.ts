import { PrismaClient, type Prisma } from '@prisma/client';
import type { SessionData } from 'express-session';
import { PrismaPhotoRepository } from '../repositories/photo-repository.js';
import { PrismaUserRepository, PrismaSessionRepository } from '../repositories/user-session-repository.js';
import { PhotoService } from '../services/photo-service.js';
import { S3ObjectStorage, storageConfigFromEnv } from '../storage/s3-storage.js';
import { socialRouter } from '../routes/social.js';
import { createMediaRouter } from '../routes/media.js';
import type { Config } from './env.js';
import type { Dependencies } from '../integration.js';
import type { UserRepository, SessionRepository } from '../auth/ports.js';

const jsonSession = (data: SessionData): Prisma.InputJsonObject => JSON.parse(JSON.stringify(data));

// Adapt A's repository names and Prisma JSON values to B's session/auth ports.
export function adaptAuthRepositories(userRepository: PrismaUserRepository, sessionRepository: PrismaSessionRepository): {
  users: UserRepository; sessions: SessionRepository;
} {
  return {
    users: {
      byEmail: email => userRepository.findForLogin(email),
      byId: id => userRepository.findPublic(id),
      create: input => userRepository.create(input)
    },
    sessions: {
      async read(sid) {
        const row = await sessionRepository.find(sid);
        if (!row || typeof row.data !== 'object' || row.data === null || Array.isArray(row.data)) return null;
        const data = row.data;
        if (typeof data.absoluteExpiresAt !== 'number' || !Number.isFinite(data.absoluteExpiresAt) ||
          typeof data.csrfToken !== 'string' || typeof data.cookie !== 'object' || data.cookie === null || Array.isArray(data.cookie) ||
          (row.userId !== null && data.userId !== row.userId)) return null;
        return { ...row, data: JSON.parse(JSON.stringify(data)) as SessionData };
      },
      create: row => sessionRepository.create({ ...row, data: jsonSession(row.data) }),
      updateActive: (sid, data, userId) => sessionRepository.saveExisting(sid, jsonSession(data), userId),
      destroy: sid => sessionRepository.destroy(sid)
    }
  };
}

export function createDependencies(config: Config) {
  const storageConfig = storageConfigFromEnv({
    S3_ENDPOINT: config.S3_ENDPOINT, S3_BUCKET: config.S3_BUCKET, S3_REGION: config.S3_REGION,
    S3_ACCESS_KEY_ID: config.S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY: config.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: config.S3_FORCE_PATH_STYLE
  });
  const db = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
  const storage = new S3ObjectStorage(storageConfig);
  const photos = new PhotoService(new PrismaPhotoRepository(db), storage, {
    tempRoot: config.UPLOAD_TMP_DIR, warn: code => console.warn(code)
  });
  const auth = adaptAuthRepositories(new PrismaUserRepository(db), new PrismaSessionRepository(db));
  const dependencies: Dependencies = { ...auth, photos, mediaRouter: createMediaRouter(photos) };
  dependencies.socialRouter = socialRouter(config, dependencies, db);
  return {
    dependencies,
    async ready() { await db.$connect(); await storage.check(); },
    async close() { storage.close(); await db.$disconnect(); }
  };
}
