export class PhotoError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message); this.name = 'PhotoError';
  }
}
export const notFound = () => new PhotoError('NOT_FOUND', 404, 'Không tìm thấy ảnh.');
export const integrityError = () => new PhotoError('MEDIA_INTEGRITY_ERROR', 502, 'Dữ liệu ảnh không toàn vẹn.');
export const storageError = () => new PhotoError('STORAGE_UNAVAILABLE', 503, 'Kho ảnh tạm thời không khả dụng.');
export const invalidPrepared = () => new PhotoError('PHOTO_SAVE_FAILED', 500, 'Không thể lưu ảnh đã xử lý.');
export function safeErrorCode(error: unknown): string {
  return error instanceof PhotoError ? error.code : 'STORAGE_OPERATION_FAILED';
}
