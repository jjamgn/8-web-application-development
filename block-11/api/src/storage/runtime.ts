import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPhotoRepository } from '../repositories/photo-repository.js';
import { PhotoService } from '../services/photo-service.js';
import { S3ObjectStorage, storageConfigFromEnv } from './s3-storage.js';

export async function createRoleARuntime() {
  if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
  const tempRoot = process.env.UPLOAD_TMP_DIR;
  if (!tempRoot || !path.isAbsolute(tempRoot) || path.resolve(tempRoot) === path.parse(path.resolve(tempRoot)).root) throw new Error('UPLOAD_TMP_DIR must be an absolute dedicated staging directory');
  const storage = new S3ObjectStorage(storageConfigFromEnv());
  await mkdir(tempRoot, { recursive: true });
  const db = new PrismaClient();
  const repository = new PrismaPhotoRepository(db);
  const service = new PhotoService(repository, storage, { tempRoot, warn: code => console.warn(code) });
  return { db, repository, storage, service, async close() { storage.close(); await db.$disconnect(); } };
}
