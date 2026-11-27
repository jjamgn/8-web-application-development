# Block 11 — API A+B, tích hợp bởi role B

Triển khai theo `../BLOCK11_CONTRACT.md`, mục 3, 4, 7 và 10. Phần A đã kéo từ GitHub main `0bee219`; B nối repository Prisma, PhotoService và media router trong `src/config/dependencies.ts`. Không thay baseline contract.

## Phạm vi đã có

- Express 5 + TypeScript, Zod; DTO chung trong `../contracts/`.
- Đăng ký/đăng nhập/đăng xuất/me/CSRF; bcrypt cost 12, rate limit trong tiến trình; cookie `block11.sid`.
- Session store dùng repository PostgreSQL do A cung cấp; expiry tuyệt đối hai giờ, không rolling, không upsert session đã bị logout.
- `busboy` stream xuống staging, kiểm tra toàn request trước khi xử lý ảnh. Lỗi cấu trúc không gọi publisher; lỗi từng file giữ ảnh tốt, trả HTTP 200 với kết quả theo index.
- `sharp` kiểm tra signature, PNG tĩnh, pixel, full decode nghiêm ngặt; auto orientation gồm flip; WebP quality 80 không EXIF/GPS, giữ alpha và không phóng lớn.
- Route ảnh công khai; upload truyền `userId` từ session; DELETE truyền actor để A kiểm tra quyền trong transaction.
- Mount router media của A; production phục vụ React build và reload deep link; `/api`/`/media` không tồn tại trả JSON 404.

## Cài đặt và kiểm thử A+B

Đã kiểm chứng trên Windows, Node **26.12.1**, npm **11.20.0**. Dependency được khóa chính xác trong package/lockfile; Prisma **6.12.0**. Chạy từ thư mục `block-11/api/`:

```powershell
npm ci
npm run db:generate
npm run build
npm test
# Có thể chạy riêng từng phần:
npm run test:role-a
npm run test:role-b
```

`npm test` chạy 69 test: 29 của A, 38 của B và 2 điểm ghép. Script tự đặt cwd về root repo để test migration A tìm đúng SQL; dùng node_modules chính thức của API, không cần toolchain A riêng. `test:role-b` gồm 40 test (38 B và 2 điểm ghép).

Test dùng sharp và HTTP server thật. Kiểm thử điểm ghép dùng PhotoService/chunker/media router thật của A, còn DB và object storage là test double; test migration dùng PostgreSQL nhúng PGlite. Không cần `.env`, PostgreSQL server hoặc SeaweedFS để chạy bộ test này. `db:generate` chỉ sinh Prisma Client, không migrate/ghi DB. Không coi kết quả đó là nghiệm thu DB/storage thật. Native sharp cần executor cho phép tải native module trên sandbox Windows đang dùng.

## Chạy ứng dụng với DB/SeaweedFS thật

Source A đã có và đã ghép. Bootstrap tạo một PrismaClient và S3 client, nối user/session repository A vào store B, khởi tạo PhotoService A và mount `createMediaRouter(photos)` tại `/media`. Trước khi listen, server kiểm tra kết nối DB và bucket/versioning. Không có DB/storage giả hoặc local fallback ở runtime.

1. Chuẩn bị PostgreSQL riêng và SeaweedFS theo `../infra/seaweedfs/README.md`.
2. Sao chép `.env.example` thành `.env`, điền DB **riêng của Block 11**, credential SeaweedFS và SESSION_SECRET ngẫu nhiên tối thiểu 32 bytes. Không dùng DB của các block trước.
3. `UPLOAD_TMP_DIR` phải là đường dẫn tuyệt đối ngoài source. Thư mục chỉ chứa file đang nhận/xử lý; không phục vụ media từ đây.
4. Chạy SeaweedFS theo cấu hình của A, bucket riêng có xác thực, không public anonymous; chạy các lệnh sau:

```powershell
npm run db:generate
npm run db:migrate
npm run storage:check
npm run dev
```

Dev backend ở `http://localhost:3000`. C cần proxy `/api` và `/media` từ Vite. `APP_ORIGIN` phải khớp origin trên thanh địa chỉ, ví dụ `http://localhost:5173`; `localhost` và `127.0.0.1` là hai origin khác nhau. Frontend dùng URL tương đối, cookie same-origin và không đặt `Content-Type` khi gửi FormData.

Production: C build `block-11/web/dist/`, B build API, đặt `NODE_ENV=production`, `APP_ORIGIN` là origin HTTPS, cấu hình `TRUST_PROXY_HOPS` đúng reverse proxy, rồi `npm start` từ `api/`. Backend bind loopback, TLS kết thúc ở reverse proxy. Cần chạy `npm run build` sau khi ghép source A để output chứa cả module A.

Để cleanup, **dừng mọi API instance và chờ hết request** rồi đặt `$env:BLOCK11_API_STOPPED = 'yes'` và chạy `npm run storage:cleanup`. Script đã trỏ đúng `scripts/role-a-cleanup.ts --maintenance` và nạp `.env`. Không chạy sweep khi còn publisher/media request hoạt động.

## Kiểm thử HTTP với DB/SeaweedFS thật

Sau khi A+B đã chạy, trên instance nghiệm thu dùng DB/bucket riêng:

```powershell
$env:BLOCK11_LIVE_BASE_URL = 'http://localhost:3000'
$env:APP_ORIGIN = 'http://localhost:5173'
npm run test:live
```

Test tạo một tài khoản riêng, đăng nhập, upload PNG + file giả, đọc media công khai, kiểm tra owner, xóa ảnh và logout. Tài khoản test còn lại vì contract không có endpoint xóa tài khoản; không chạy vào DB chứa dữ liệu thật. Test yêu cầu xóa hoàn tất 204, 202 sẽ làm test thất bại để người nghiệm thu xử lý cleanup. Test live **chưa chạy** tại thời điểm bàn giao B.

## Gọi API từ C

1. `GET /api/auth/csrf` lấy `{ok:true,data:{csrfToken}}`, giữ token trong memory.
2. Mọi POST/DELETE gửi `X-CSRF-Token`; browser tự gửi Origin và cookie. Register không tự login.
3. Login trả user và **token mới**; thay token cũ. `/me` có thể trả 401 nhưng gallery/detail/media vẫn xem được.
4. Upload FormData: 1–5 trường file cùng tên `photos` và đúng một trường text `metadata` chứa JSON `[{title,alt},...]`. Thứ tự file khớp metadata; vị trí text part có thể trước/sau file.
5. Phân biệt envelope request `ok:false` và từng `results[i].ok`; không tự retry upload nếu mất response, vì có thể ảnh đã commit.
6. DELETE trả 204 nếu dọn đủ, 202 nếu đã ẩn/chờ dọn. Chỉ hiện nút xóa khi user.id trùng uploader.id; server A vẫn quyết định quyền.

Giới hạn: 10 MiB/file, 55 MiB/body bao gồm multipart overhead, 16 KiB metadata, 40 triệu pixel; title/alt đếm Unicode code point, trim, lần lượt 1–120/1–300. Chi tiết endpoint/status xem contract mục 7.
