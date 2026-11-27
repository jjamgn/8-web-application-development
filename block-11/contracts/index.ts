export type ApiError = { code: string; message: string };
export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export type UserDto = { id: string; name: string };
export type UploaderDto = UserDto & { avatarUrl?: string | null };
export type VariantDto = { width: number; height: number; mime: 'image/webp'; bytes: number; url: string };
export type PhotoDto = {
  id: string; title: string; alt: string; uploader: UploaderDto;
  width: number; height: number; createdAt: string; variants: VariantDto[];
};
export type UploadResult = { index: number; ok: true; photo: PhotoDto } | { index: number; ok: false; error: ApiError };
export type UploadData = { results: UploadResult[]; succeeded: number; failed: number };
export type GalleryData = { items: PhotoDto[]; page: number; pageSize: 12; total: number; totalPages: number };
export const LIMITS = { files: 5, fileBytes: 10_485_760, bodyBytes: 57_671_680, metadataBytes: 16_384, pixels: 40_000_000, chunkBytes: 1_048_576 } as const;
export const codePoints = (value: string) => Array.from(value).length;

export type PublicProfile = { id: string; name: string; bio: string; avatarUrl: string | null; photoCount: number; followers: number; following: number; isFollowing: boolean };
export type CollectionDto = { id: string; title: string; count: number };
export type ProfileIdentity = Pick<PublicProfile, 'id' | 'name' | 'bio' | 'avatarUrl'>;
