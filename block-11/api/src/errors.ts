export class AppError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export const notFound = () => new AppError('NOT_FOUND', 404, 'Không tìm thấy nội dung.');
export const integrityError = () => new AppError('MEDIA_INTEGRITY_ERROR', 502, 'Không thể xác minh dữ liệu ảnh.');
export const storageError = () => new AppError('STORAGE_UNAVAILABLE', 503, 'Kho ảnh tạm thời không sẵn sàng.');
