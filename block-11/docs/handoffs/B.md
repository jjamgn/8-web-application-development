# B — Multipart, xử lý ảnh và tích hợp API

**Cập nhật upload/profile 27/11/2026:** so sánh trước/sau mặc định đóng, title/alt có dấu bắt buộc; nút avatar chuyển cạnh chỉnh sửa hồ sơ. Localhost/127.0.0.1 được cho phép explicit trong env development để sửa lỗi Origin/CSRF khi APP_ORIGIN là LAN; production vẫn chỉ một origin. Xem [quy cách và kiểm chứng](../evidence/compact-upload-profile/README.md).

**Cập nhật tác giả/tải ảnh 27/11/2026:** avatar + tên người đăng nằm trong lớp hover, chi tiết luôn hiện avatar/tên; Tải WebP có dropdown gắn liền, chọn size tải ngay. DTO uploader bổ sung avatarUrl công khai/null; không đổi schema/env. Xem [quy cách và kiểm chứng](../evidence/author-download/README.md). Các mô tả bố cục cũ bên dưới được thay thế bởi bản cập nhật này.

**Mở rộng đã duyệt 27/11/2026:** tìm kiếm, modal có slug/URL, download WebP, yêu thích, bộ sưu tập riêng tư, hồ sơ công khai, follow và sửa avatar đã tích hợp. Avatar dùng SeaweedFS qua PhotoKind AVATAR và không xuất hiện trong gallery. Các bảng xã hội mới thuộc Block 11. Migration bổ sung `202611270003_social_profiles`; không cần đổi env hoặc cài thư viện frontend mới. Xem [API, cách dùng và kiểm chứng](../evidence/social-profile/README.md). Các kết quả cũ trong tài liệu này là lịch sử trước mở rộng.

> **SNAPSHOT LỊCH SỬ:** báo cáo/bàn giao này giữ kết quả tại thời điểm lập. Trạng thái tích hợp và môi trường thật mới nhất xem [báo cáo chạy thật](../evidence/review-20261127/REVIEW.md) và [ma trận hiện hành](../evidence/README.md). Các câu “chưa chạy/chưa có môi trường thật” bên dưới không phải kết luận hiện tại.

Ngày bàn giao: 27/11/2026. Phạm vi: **role B** theo BLOCK11_CONTRACT.md. Không thay baseline, không triển khai schema/S3/media của A hoặc giao diện của C.

Cập nhật tích hợp: đã kéo GitHub main tới **`0bee219`** và ghép phần A với B. **Build đạt, 69/69 test đạt**. Tài liệu dưới đây mô tả interface đang dùng sau khi ghép; [AB-integration.md](../evidence/AB-integration.md) ghi chi tiết kết quả và giới hạn.

## Source bàn giao

| Thành phần | File |
| --- | --- |
| DTO, limits và đếm Unicode | `contracts/index.ts` |
| App factory, error envelope, production SPA | `api/src/app.ts`, `api/src/errors.ts` |
| Bootstrap ghép module A, adapter repository, env | `api/src/server.ts`, `api/src/config/dependencies.ts`, `api/src/config/env.ts` |
| Auth/session/CSRF/rate limit | `api/src/auth/*` |
| Multipart staging hai giai đoạn | `api/src/upload/parser.ts` |
| Signature, PNG/APNG, decoder, orientation/WebP | `api/src/images/prepare-image.ts` |
| Route photos và truyền identity | `api/src/routes/photos.ts` |
| Interface nội bộ A/B | `api/src/types.ts`, `api/src/integration.ts`, `api/src/auth/ports.ts` |
| Package, lockfile, cấu hình mẫu, hướng dẫn B | `api/package*.json`, `api/tsconfig.json`, `api/.env.example`, `api/README.md` |
| Test B và bài kiểm thử HTTP live | `api/tests/*` |

## Interface A đã nối

`server.ts` dùng factory `createDependencies(config)` từ `config/dependencies.ts`. Factory tạo một PrismaClient/S3 client, service và các adapter sau. Không có adapter DB/storage giả ở production.

1. **`repositories/user-session-repository.ts`**: `PrismaUserRepository.findForLogin/findPublic/create` → B `users.byEmail/byId/create`; `PrismaSessionRepository.find/create/saveExisting/destroy` → B `sessions.read/create/updateActive/destroy`. Adapter chuyển SessionData sang Prisma JSON khi ghi, kiểm tra hình dạng trước khi đọc.
2. **`repositories/photo-repository.ts`** và **`services/photo-service.ts`**: khởi tạo `new PhotoService(new PrismaPhotoRepository(db), storage, {tempRoot})`. Instance thỏa `PhotoService` trong `integration.ts`, đúng chữ ký contract mục 10.
3. **`routes/media.ts`**: gọi **`createMediaRouter(photos)`**; đường dẫn tương đối `/photos/:photoId/:filename`, B mount tại `/media` trước session middleware. Router đọc DB/SeaweedFS và tự kiểm tra manifest/hash/cache/cancel.

Các type `StagedVariant`, `PreparedPhoto`, `Actor` nằm tại `src/types.ts`. B chuẩn bị WebP đầy đủ tạm và truyền ownership cho `publishPhoto`; A phải dọn variant cả khi thành công/lỗi và không được trả về trước khi việc sử dụng file kết thúc. B dọn toàn bộ thư mục request sau khi publisher trả về; nếu chuẩn bị ảnh thất bại B tự dọn output từng phần.

### Session repository: yêu cầu quan trọng

- `read(sid)` trả `{sid,userId,data,expiresAt}` hoặc null; `expiresAt` là Date, `data` được deserialize từ JSON.
- `create(record)` là INSERT riêng, không upsert. B chỉ gọi sau khi khởi tạo session CSRF mới hoặc sau login regenerate.
- `updateActive(sid,data,userId)` là UPDATE có điều kiện `sid` và `expiresAt > now`, **không cập nhật expiresAt**, trả false nếu không có dòng. Không tạo lại session khi request cũ save sau logout. Đây là điều kiện bắt buộc cho store của B.
- `destroy(sid)` xóa idempotent. Các thao tác phải hoàn tất trước khi Promise resolve và không giấu lỗi DB.
- Dữ liệu session bao gồm cookie, csrfToken, userId tùy chọn và absoluteExpiresAt. Lưu JSON theo type được cung cấp; không log sid/token/cookie.
- Store B kiểm tra expiry khi read; touch không gia hạn. DB session phải sống qua restart; có thể dọn row expired trong script bảo trì A.

`users.create` trả public `{id,name}`; `byEmail` thêm passwordHash phục vụ bcrypt, không trả hash ra API. `email` unique chuẩn hóa; race unique trả code `EMAIL_ALREADY_EXISTS` hoặc Prisma `P2002` để B chuyển HTTP 409. `byId` trả public user hoặc null.

### Lỗi A → route B

Service A throw `PhotoError` có `.code` ổn định: `NOT_FOUND`, `FORBIDDEN`, `AUTH_REQUIRED`, `INVALID_QUERY`, `MEDIA_INTEGRITY_ERROR`, `STORAGE_UNAVAILABLE`; app B chuyển status theo contract và dùng message công khai. Không suy luận lỗi bằng chuỗi message. Lỗi publish được trả riêng file `PHOTO_SAVE_FAILED`, không lộ lỗi DB/credential. `deletePhoto` kiểm tra owner trong cùng transaction đổi trạng thái; B không thay kiểm tra này bằng UI hoặc pre-read ngoài transaction.

### Source A và hạ tầng

Schema/migration, repository, service/chunk/hash/cleanup, media router và Compose SeaweedFS đã có từ A. `db:generate` đã chạy với schema Block 11 và `db:migrate` dùng migration A. `storage:check`/`storage:cleanup` đã nối đúng script A và nạp `.env`; cleanup yêu cầu `BLOCK11_API_STOPPED=yes` sau khi thực sự dừng API. B đã bổ sung PGlite 0.6.0 cho test migration và giữ AWS S3 client 3.1178.0/Prisma 6.12.0. Chưa có `.env`/endpoint DB và SeaweedFS riêng trong lần ghép này nên chưa migrate hoặc chạy live storage.

## Điểm ghép C

Tham khảo `api/README.md`, mục Gọi API từ C. C dùng type từ `contracts/`, không import Prisma/S3/server. Chỉ GET csrf khi cần thao tác ghi/auth để lượt xem gallery công khai không tự tạo session. Xử lý 401 `/me` như khách, giữ token mới từ login, cho phép returnTo duy nhất `/photos/upload`. Register/login/password không lưu localStorage/sessionStorage.

## Kết quả kiểm chứng B

Đã chạy Windows Node 26.12.1, npm 11.20.0:

- `npm run build`: đạt.
- `npm test`: **38/38 đạt**, không skip; auth, strict multipart, boundary bytes/pixels/metadata, malformed/aborted request, PNG alpha/APNG, orientation 2/3/5/6/7/8 và loại EXIF/GPS, variant widths, guard/recheck, production deep link/JSON 404 và service fault có kiểm soát.
- Sau ghép, `npm test`: **69/69 đạt** gồm 29 A + 38 B + 2 điểm ghép. Test điểm ghép đi qua HTTP upload B → sharp B → PhotoService/chunker A → media router A → delete owner, dùng DB/S3 fake; fixture WebP >1 MiB có nhiều mảnh. Adapter user/session A+B cũng được kiểm tra JSON, absolute expiry và không hồi sinh sau logout.
- Native sharp bị sandbox Application Control chặn ở lần đầu; kết quả đạt là thực thi decoder thật qua executor có quyền, không thay bằng mock.

Ảnh JPEG đúng 10 MiB được tạo bằng segment COM hợp lệ. 55 MiB được kiểm tra độc lập với giới hạn từng file: một part lớn bị đánh dấu FILE_TOO_LARGE ở cả trường hợp body đúng ngưỡng và vượt ngưỡng; đúng body ngưỡng không bị 413, vượt ngưỡng trả 413. Cách này không khẳng định có request hợp lệ gồm <=5 file, mỗi file <=10 MiB, với tổng file payload 55 MiB.

Test double chỉ nằm trong test (`api/tests/helpers.ts`, `api/tests/role-a/fakes.ts` và fixture trong test); session restart test tái tạo app dùng cùng repository test, không phải bằng chứng persistence PostgreSQL. Fault test publisher/rollback của A kiểm tra nhánh lỗi có kiểm soát; vẫn cần xác nhận trên DB/S3 thật.

`npm run test:live` được cung cấp cho instance A+B thật, **chưa chạy**. Chưa đánh dấu E01–E20 đạt tổng thể, chưa có chứng cứ SQL/S3, restart SeaweedFS, Network/DOM/Playwright. Xem log B tại `docs/evidence/B-tests.txt`, `B-build.txt` và ma trận `B-verification.md`.

## Cách chạy và cấu hình

Chạy `npm ci`, `npm run db:generate`, `npm test`, `npm run build` từ `api/`. Để chạy ứng dụng thật, khởi động hạ tầng riêng và điền `.env` theo mẫu rồi `npm run db:migrate`, `npm run storage:check`, `npm run dev`. Production cần C build web trước `npm start`. Không migrate/seed/reset DB các block cũ, không commit secret hoặc file upload.

Nguồn tham khảo triển khai: [busboy](https://github.com/mscdex/busboy), [sharp constructor](https://sharp.pixelplumbing.com/api-constructor/), [express-session](https://expressjs.com/en/resources/middleware/session/). Đề bài được đối chiếu từ file HTML người dùng cung cấp, slide 31–37; các quyết định triển khai lấy từ contract hiện tại.
