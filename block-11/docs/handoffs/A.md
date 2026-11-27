# Bàn giao A — Database, SeaweedFS, mảnh dữ liệu và media

> **SNAPSHOT LỊCH SỬ:** báo cáo/bàn giao này giữ kết quả tại thời điểm lập. Trạng thái tích hợp và môi trường thật mới nhất xem [báo cáo chạy thật](../evidence/review-20261127/REVIEW.md) và [ma trận hiện hành](../evidence/README.md). Các câu “chưa chạy/chưa có môi trường thật” bên dưới không phải kết luận hiện tại.

Ngày thực hiện: **27/11/2026**. Phạm vi theo [contract Block 11](../../BLOCK11_CONTRACT.md), mục 5–10 và các phần nghiệm thu của A.

## 1. Đã triển khai

- Schema độc lập gồm User, Session, Photo có uploaderId, PhotoVariant, PhotoChunk và StorageCleanupTask. Migration SQL từ Prisma 6.12.0 cộng CHECK constraint về kích thước/hash/offset/count. Không kế thừa bảng/migration Restaurant App.
- `PrismaPhotoRepository`: transaction tạo Photo/Variant/Chunk và hoàn tất journal; list snapshot repeatable-read; lookup public được service kiểm tra status; đổi DELETING có điều kiện chủ sở hữu; truy xuất task và ảnh chờ xóa theo lô.
- `PrismaUserRepository` và `PrismaSessionRepository` cho B: email chuẩn hóa/unique, lookup hash server-only; session phân biệt create và saveExisting, không upsert/không gia hạn tuyệt đối để tránh resurrect sau logout.
- `S3ObjectStorage`: SDK v3, path-style, credential server-only, timeout/retry hữu hạn; PUT mỗi mảnh dưới 1 MiB, GET giới hạn memory, HEAD, DELETE kiểm tra vắng object, LIST có continuation token, kiểm tra bucket và versioning.
- Chia mảnh theo byte sau khi B sinh WebP; key `photos/<photoId>/<width>/000001.part`, hash từng mảnh/full variant. Mỗi mảnh là application/octet-stream. Không lưu WebP đầy đủ bền vững.
- Ghép có kiểm tra manifest, thứ tự/offset/size/hash mảnh và hash đầy đủ vào file tạm trước khi gửi headers; dọn sau gửi/lỗi/abort. Không đọc toàn bộ variant vào RAM.
- Service công bố journal mọi key trước PUT, transaction DB sau PUT đủ; rollback/retry. Commit response không rõ được kiểm tra lại; không xóa object khi không xác định được kết quả DB.
- Xóa đúng chủ, ẩn trước khi dọn, giữ DELETING nếu storage lỗi. Cleanup bảo trì xử lý DELETING/task PENDING/object mồ côi và temp >24 giờ; không xóa key còn thuộc ảnh PUBLISHED.
- Media router public, MIME/cache đúng, URL ngoài quy ước trả 404; mảnh hỏng/thiếu trả 502 no-store, storage outage 503 no-store; bỏ qua Range và trả ảnh đầy đủ.
- Compose SeaweedFS 4.55, persistent volume, credential mẫu, hướng dẫn restart/sao lưu; probe S3 thật và live-smoke opt-in đã có sẵn.

Không tạo `api/package.json`, `app.ts`, auth router, upload parser, sharp pipeline hoặc web của B/C. Package nhỏ dưới `api/tests/role-a-toolchain/` chỉ là công cụ kiểm chứng độc lập của A, có lockfile. Dependency B cần đưa vào package chính được liệt kê ở mục 3.

## 2. Interface đã bàn giao cho B

```ts
import { PrismaPhotoRepository } from './repositories/photo-repository.js';
import { PrismaUserRepository, PrismaSessionRepository } from './repositories/user-session-repository.js';
import { S3ObjectStorage, storageConfigFromEnv } from './storage/s3-storage.js';
import { PhotoService } from './services/photo-service.js';
import { createMediaRouter } from './routes/media.js';
import { PhotoError } from './storage/errors.js';

// B khởi tạo PrismaClient/config một lần rồi inject:
const repository = new PrismaPhotoRepository(prisma);
const storage = new S3ObjectStorage(storageConfigFromEnv());
const photos = new PhotoService(repository, storage, { tempRoot: config.uploadTmpDir });
app.use('/media', createMediaRouter(photos));
```

Ví dụ trên là đoạn ghép, không phải entrypoint độc lập; B sở hữu `app.ts` và config. `createRoleARuntime()` tại `storage/runtime.ts` là factory dùng cho scripts A, cũng có thể tham chiếu để bootstrap B. Không tạo thêm PrismaClient mỗi request.

- `publishPhoto(prepared, {userId})`: B giao WebP tạm đã được xác minh và title/alt đã trim, W/H sau orientation, đủ các chiều rộng theo contract. A kiểm tra thêm hình dạng và bytes, chia mảnh, công bố và **nhận trách nhiệm dọn mọi tempPath hợp lệ trong staging** sau lời gọi, kể cả thất bại. B vẫn dọn file upload gốc và variant nếu sharp thất bại trước khi gọi A.
- `listPhotos({page})`, `getPhoto(id)`, `deletePhoto(id,{userId})`: đúng chữ ký contract; delete trả DELETED hoặc DELETING để B map 204/202. Service phát `PhotoError` có code/status/message an toàn; B map lỗi, không parse chuỗi message.
- Actor phải lấy từ session B sau guard. A không xác thực cookie thay B; A xác nhận UUID actor và kiểm tra ownership DELETE ở DB. Không truyền userId client.
- DTO/PreparedPhoto/Actor nằm tạm tại `api/src/storage/types.ts` (file A); đúng hình dạng contract, `PhotoDto` không chứa key/hash/email. B có thể re-export type DTO từ `contracts/` mà không import runtime storage vào web. Không chỉnh type một phía.
- `PrismaUserRepository.create({name,email,passwordHash})` trả `{id,name}`; `findForLogin(email)` trả `{id,name,passwordHash}|null` **chỉ ở server**; `findPublic(id)` trả `{id,name}|null`.
- `PrismaSessionRepository.create({sid,userId,data,expiresAt})`: chỉ dùng cho SID mới/pre-login/regenerate, hạn tối đa 2 giờ. `find(sid)` lọc expiry; `saveExisting(sid,data,userId)` update có điều kiện, trả false nếu logout/hết hạn; `destroy(sid)`, `removeExpired()`. Store B phải phân biệt session loaded và session mới, không dùng create khi saveExisting trả false. Không rolling/touch kéo dài expiry; B chịu bcrypt/CSRF/cookie/regenerate/rate-limit.

## 3. Dependency, scripts và cấu hình cần B tích hợp

Phiên bản A đã kiểm chứng: Node **26.13.0**, npm **11.20.0**, TypeScript **5.8.3**, Prisma/client **6.12.0**, Express **5.1.0**, AWS S3 client **3.1178.0**. Không đổi stack major của contract. Phiên bản Node khác cần B chạy lại bộ kiểm tra.

Runtime A cần `@prisma/client@6.12.0`, `@aws-sdk/client-s3@3.1178.0`, `express@5.1.0`. Dev tools của A: `prisma@6.12.0`, `tsx@4.19.3`, `typescript@5.8.3`, `@types/node`, `@types/express`, `@types/supertest`, `supertest@7.1.4`, `sharp@0.34.5` (fixture cũng là dependency B dùng cho pipeline), `@electric-sql/pglite@0.6.0` (chỉ test migration, không thay PostgreSQL runtime).

B bổ sung scripts ở api/package.json:

```json
{
  "db:generate": "prisma generate",
  "db:migrate": "prisma migrate deploy",
  "storage:check": "tsx scripts/role-a-storage-check.ts",
  "storage:cleanup": "tsx scripts/role-a-cleanup.ts --maintenance"
}
```

Scripts đọc biến môi trường đã nạp; B chịu cách nạp `.env` trong bootstrap (hoặc dùng Node `--env-file`). Cleanup cần thêm `BLOCK11_API_STOPPED=yes` và **thực sự dừng tất cả API instance/publisher/media request trước khi chạy**. Đây là quy trình bảo trì đã chốt, không là online worker. Không chạy orphan sweep khi upload còn chạy.

Cấu hình server mẫu để B đưa vào `.env.example` (không phải credential thật):

```dotenv
DATABASE_URL=postgresql://block11:replace-password@127.0.0.1:5432/block11_gallery
S3_ENDPOINT=http://127.0.0.1:8333
S3_REGION=us-east-1
S3_BUCKET=block11-gallery
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=replace-local-access-key
S3_SECRET_ACCESS_KEY=replace-random-local-secret
UPLOAD_TMP_DIR=D:/gallery-tmp/block11
```

Prisma schema hiện chỉ sử dụng DATABASE_URL, không có DIRECT_URL thừa. Nếu nhà cung cấp dùng pooled connection cho runtime, truyền direct DATABASE_URL cho lệnh migration trong môi trường riêng; không chạy migration vào DB Block 8/9. A chưa có kết nối DB riêng để migrate deploy và chưa sửa DB nào của nhóm.

## 4. Tái hiện kiểm chứng A

Đã kiểm chứng: **29/29 test đạt**, Prisma validate/generate và TypeScript strict đạt. Xem [báo cáo kiểm chứng và giới hạn](../evidence/role-a/verification.md).

Từ root repository, PowerShell:

```powershell
./block-11/api/scripts/role-a-verify.ps1
```

Script cài toolchain A nếu chưa có, tạo **junction ignored** `api/node_modules` tới toolchain nếu API chưa có node_modules; không thay node_modules hiện có của B. Chạy Prisma validate/generate bằng URL placeholder, không kết nối DB, rồi tsc và bộ test. Node --import trên Windows được chuyển sang file URL. Nếu sandbox chặn HTTP localhost, chạy trong terminal người dùng có quyền loopback.

Khi B có package/node_modules chính thức: B cài các test dependency ở mục 3 vào package chính và generate schema Block 11 tại đó. Không để @prisma/client của schema Restaurant App xuất hiện trong API Block 11. Junction chỉ là cách kiểm chứng trước khi B dựng package, không phải hạ tầng production.

Bộ test kiểm tra các nhánh lỗi có ý nghĩa; object storage và PhotoRepository trong service tests là fake có fault injection. Media tests chạy HTTP Express/Supertest thật với storage fake. Migration test chạy SQL đầy đủ trên PostgreSQL nhúng PGlite và xác nhận CHECK/FK/unique/cascade/transaction rollback; **không thay test Prisma với PostgreSQL server hoặc SeaweedFS thật**.

## 5. Nghiệm thu thật còn cần môi trường

Các script bên dưới đã có nhưng **chưa chạy** vì máy hiện không có Docker/SeaweedFS endpoint hay DATABASE_URL Block 11 riêng. Không lấy credential/DB Restaurant App để thay thế. Hướng dẫn SeaweedFS: [infra README](../../infra/seaweedfs/README.md).

Sau khi setup bucket có xác thực và migrate deploy DB riêng, từ root repository có thể chạy (Node hỗ trợ --env-file):

```powershell
node --env-file=block-11/api/.env --import ./block-11/api/tests/role-a-toolchain/node_modules/tsx/dist/loader.mjs block-11/api/scripts/role-a-storage-check.ts
$env:BLOCK11_LIVE_TEST = 'yes'
node --env-file=block-11/api/.env --import ./block-11/api/tests/role-a-toolchain/node_modules/tsx/dist/loader.mjs block-11/api/tests/role-a/live-smoke.ts
```

Live-smoke tạo user fixture riêng (không có mật khẩu đăng nhập hợp lệ), sinh WebP lớn có nhiều mảnh, publish với Prisma/S3 thật, GET/HEAD/ghép/so hash rồi xóa đúng user/ảnh/mảnh của lượt thử; không seed/reset/migrate. Nếu dọn thất bại thì giữ DELETING/journal để maintenance xử lý, không xóa user còn ảnh. Script không chứng minh login/session HTTP của B hoặc restart process/SeaweedFS.

Để cleanup sau khi dừng API:

```powershell
$env:BLOCK11_API_STOPPED = 'yes'
node --env-file=block-11/api/.env --import ./block-11/api/tests/role-a-toolchain/node_modules/tsx/dist/loader.mjs block-11/api/scripts/role-a-cleanup.ts --maintenance
```

Cần ghi bằng chứng live cho E08–E10, E12–E13, E15, E18–E20: restart cả Express/SeaweedFS giữ volume; ảnh cũ vẫn GET/hash đúng; storage outage và retry; quyền chủ qua auth thật; bucket anonymous bị chặn; mọi mảnh không còn sau xóa. Không đánh dấu toàn bộ rubric đạt chỉ từ unit tests. B/C tiếp tục phần auth/upload/UI và nghiệm thu tích hợp.

## 6. Giới hạn có chủ ý

- Chỉ hỗ trợ baseline một bucket không versioning; không local fallback, CDN, presigned URL hoặc online cleanup worker.
- Assembly ghép vào temp theo contract để kiểm tra integrity trước khi gửi cache dài hạn; tăng latency lần đọc đầu. Không quảng cáo Range hoặc cache bền vững tại Express.
- Cleanup trả đếm thao tác/object/temp đã xử lý, pending và failed; lỗi dọn không được báo sạch. Journal DONE được giữ làm lịch sử, chưa triển khai chính sách prune.
- Session store callback/auth guard thuộc B; repository A không thay server-side guard. URL ảnh public và cache không phụ thuộc session/cookie.
