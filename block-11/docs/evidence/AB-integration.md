# Ghép A+B sau pull GitHub — 27/11/2026

Đã fetch `origin`, fast-forward `main` từ `5ef7427` tới **`0bee219`** (`feat(block11): implement role A photo storage and media`). Khôi phục thay đổi cục bộ từ stash và giữ stash dự phòng. Phần B cùng bản ghép A+B được đưa vào commit riêng của Block 11 theo yêu cầu người dùng.

## Điểm ghép đã hoàn tất

- `config/dependencies.ts` dùng các class/factory A thực tế, một PrismaClient và S3 client: user/session repository → port auth B; PrismaPhotoRepository + PhotoService → route B; createMediaRouter → `/media`.
- SessionData được serialize JSON và kiểm tra hình dạng khi deserialize; cập nhật bằng `saveExisting`, không upsert hoặc kéo dài expiry.
- Bootstrap kiểm tra DB/bucket trước listen; đóng S3/Prisma khi shutdown. Không có kho ảnh local hoặc DB/storage fake ở production.
- Script storage trỏ đúng file `role-a-*`, nạp `.env`; cleanup giữ chế độ maintenance. Test runner dùng cwd root và main API toolchain, có PGlite 0.6.0 cho test migration A.
- Giữ TypeScript `strict` và `noUncheckedIndexedAccess`; sửa các truy cập index đã được giới hạn trong repository/service A, thêm guard thiếu chunk/manifest. Không đổi schema, API, công thức variant hoặc baseline contract.
- Lỗi `INVALID_QUERY` của A được ánh xạ HTTP 400 thay vì lỗi 500.

## Kiểm chứng đã thực hiện

| Lệnh | Kết quả |
| --- | --- |
| `npm run db:generate` tại `block-11/api` | Prisma Client 6.12.0 sinh từ schema Block 11; không chạy migration hoặc ghi DB |
| `npm run build` tại `block-11/api` | Đạt, biên dịch cả A+B |
| `npm test` tại `block-11/api` | **69/69 đạt**, 0 fail, 0 skip: 29 A + 38 B + 2 điểm ghép |
| `npm run build` tại `block-09/BAI1/api` | Đạt sau ghép xung đột stash/upstream |
| `npm test` tại `block-09/BAI1/api` | **60/60 đạt**, giữ kiểm thử cục bộ và kiểm thử production/profile mới từ GitHub |

Hai test điểm ghép dùng HTTP/parser/sharp B và PhotoService/chunker/media A thật. Ảnh PNG tổng hợp dưới 10 MiB sinh WebP lớn hơn 1 MiB, manifest có nhiều mảnh, media trả WebP hoàn chỉnh/public/cache đúng, người khác xóa 403, chủ xóa 204 và dọn hết mảnh. Test còn lại dùng repository class A qua adapter B để xác nhận normalization, JSON session, expiry tuyệt đối và save sau logout bị từ chối.

Repository/object store trong test là fake có kiểm soát; migration SQL chạy PostgreSQL nhúng PGlite. Đây không phải chứng cứ Prisma/PostgreSQL server hoặc SeaweedFS thật.

## Bảo toàn thay đổi Block 9 khi pull

Pull có các commit Block 9 cùng phần A Block 11. Đã ghép các xung đột README, package, app/auth, test và script snapshot. Giữ adapter Prisma cục bộ với login transactional; bổ sung tương thích profile/change-password/refresh-CSRF mới từ upstream. Entry point production vẫn dùng adapter `auth-production.ts` của bản GitHub; các port/test cục bộ được giữ. Stash trước pull vẫn còn để đối chiếu.

## Chưa thực hiện

Chưa có `.env` riêng của Block 11 trong workspace, chưa có cấu hình endpoint/credential DB và SeaweedFS để chạy nghiệm thu live. Không lấy credential của Block 9. Chưa chạy `db:migrate`, `storage:check`, `storage:cleanup`, live HTTP, restart DB/SeaweedFS hoặc Playwright. Frontend C chưa có ở lần pull này; không đánh dấu E01–E20 hoàn tất toàn hệ thống.

Hướng dẫn tiếp theo: `api/README.md` và `infra/seaweedfs/README.md`.
