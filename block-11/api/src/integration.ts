import type { Router } from 'express';
import type { GalleryData, PhotoDto } from '../../contracts/index.js';
import type { Actor, PreparedPhoto } from './types.js';
import type { UserRepository, SessionRepository } from './auth/ports.js';

// Internal seam for A/B. No storage, Prisma, or filesystem code enters contracts/.
export interface PhotoService {
  publishPhoto(input: PreparedPhoto, actor: Actor): Promise<PhotoDto>;
  listPhotos(input: { page: number; uploaderId?: string } & import('./storage/types.js').PhotoFilter): Promise<GalleryData>;
  getPhoto(id: string): Promise<PhotoDto>;
  deletePhoto(id: string, actor: Actor): Promise<'DELETED' | 'DELETING'>;
}
export interface Dependencies {
  users: UserRepository;
  sessions: SessionRepository;
  photos: PhotoService;
  mediaRouter: Router;
  socialRouter?: Router;
}
