import { PhotoError } from './errors.js';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^photos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[1-9][0-9]*\/[0-9]{6}\.part$/i;
export function assertStorageKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new PhotoError('INVALID_STORAGE_KEY', 500, 'Storage key không hợp lệ.');
}
export function chunkKey(photoId: string, width: number, part: number): string {
  if (!UUID_PATTERN.test(photoId) || !Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(part) || part < 1 || part > 999999) {
    throw new PhotoError('INVALID_STORAGE_KEY', 500, 'Storage key không hợp lệ.');
  }
  return `photos/${photoId}/${width}/${String(part).padStart(6, '0')}.part`;
}
