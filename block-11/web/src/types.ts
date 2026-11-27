// Shared browser-safe contracts owned by B; no server/runtime dependencies.
export type {
  UserDto as User, ApiError, VariantDto, PhotoDto,
  GalleryData, UploadResult, UploadData,
} from '../../contracts/index.js';
export { LIMITS, codePoints } from '../../contracts/index.js';
