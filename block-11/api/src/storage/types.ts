/** A-owned integration types; B can re-export the public DTOs from contracts/. */
export const CHUNK_SIZE = 1_048_576;
export type Actor = { userId: string };
export type VariantDto = { width: number; height: number; mime: 'image/webp'; bytes: number; url: string };
export type PhotoDto = {
  id: string; title: string; alt: string; uploader: { id: string; name: string };
  width: number; height: number; createdAt: string; variants: VariantDto[];
};
export type StagedVariant = { tempPath: string; width: number; height: number; mime: 'image/webp'; bytes: number };
export type PreparedPhoto = { title: string; alt: string; width: number; height: number; variants: StagedVariant[] };
export type ChunkManifest = { partNumber: number; offset: number; bytes: number; sha256: string; storageKey: string };
export type VariantManifest = {
  width: number; height: number; mime: 'image/webp'; bytes: number; sha256: string;
  chunkSize: number; chunkCount: number; storagePrefix: string; chunks: ChunkManifest[];
};
export type StoredPhoto = {
  id: string; uploaderId: string; uploader: { id: string; name: string };
  title: string; alt: string; width: number; height: number;
  status: 'PUBLISHED' | 'DELETING'; createdAt: Date; variants: VariantManifest[];
};
export type NewPhoto = Omit<StoredPhoto, 'uploader' | 'createdAt' | 'status'>;
export type CleanupTask = { storageKey: string; createdAt: Date };
export type ObjectEntry = { key: string; lastModified: Date };

export interface ObjectStorage {
  put(key: string, body: Uint8Array, signal?: AbortSignal): Promise<void>;
  get(key: string, signal?: AbortSignal): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<{ bytes: number } | null>;
  list(): AsyncIterable<ObjectEntry>;
  check(): Promise<void>;
}

export interface PhotoRepository {
  journal(keys: string[]): Promise<void>;
  commit(photo: NewPhoto): Promise<StoredPhoto>;
  find(id: string): Promise<StoredPhoto | null>;
  list(page: number, uploaderId?: string): Promise<{ items: StoredPhoto[]; total: number }>;
  markDeleting(id: string, actorId: string): Promise<StoredPhoto>;
  removeDeleting(id: string): Promise<void>;
  referenceStatus(key: string): Promise<'PUBLISHED' | 'DELETING' | null>;
  pendingTasks(): AsyncIterable<CleanupTask>;
  deletingPhotos(): AsyncIterable<StoredPhoto>;
  taskDone(key: string): Promise<void>;
  taskFailed(key: string, code: string): Promise<void>;
}
