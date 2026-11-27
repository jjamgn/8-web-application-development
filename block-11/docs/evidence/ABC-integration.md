# Ghép A + B + C — 27/11/2026

> **SNAPSHOT LỊCH SỬ:** báo cáo/bàn giao này giữ kết quả tại thời điểm lập. Trạng thái tích hợp và môi trường thật mới nhất xem [báo cáo chạy thật](review-20261127/REVIEW.md) và [ma trận hiện hành](README.md). Các câu “chưa chạy/chưa có môi trường thật” bên dưới không phải kết luận hiện tại.

Nền GitHub main: `223c6e9` (B tích hợp A tại `0bee219`). C được ghép vào bản nền này trong checkout riêng, giữ lịch sử A/B và các thay đổi chưa commit ở block khác. Contract giữ nguyên SHA-256 `A372866885DDB50EC70B556E97AB79D01E75AB8E38DD8DB4E6CC1066DC8CF6F1`.

## Kết nối đã hoàn thành

- React dùng type DTO, LIMITS và codePoints trực tiếp từ `contracts/index.ts` của B. Vite cho phép import contracts và proxy `/api`/`/media`, giữ Origin của browser.
- Auth UI gọi register/login/logout/me/CSRF của B; cookie cùng origin, token xoay sau login, không giữ credential trong web storage. Upload FormData theo contract; service A nhận actor từ session B.
- Production Express phục vụ React build và các deep link sau API/media routes; unknown API/media vẫn JSON 404. Đường dẫn build được tính từ module source hoặc output TypeScript thay vì cwd.
- Sửa SPA fallback: `sendFile('index.html', {root:webDist})` để source dưới thư mục có dấu chấm không bị xử lý như truy cập dotfile rồi trả 500. Regression test dùng build dưới `.private/`.
- Bỏ tải font ngoài để ứng dụng chạy độc lập mạng bên ngoài; dùng font hệ thống dự phòng. Tách output mock/integration/live để các bộ test không dọn artefact của nhau.

## Kiểm tra đã chạy

Windows, Node **22.23.3**, npm **10.7.0**, Chrome **158.0.8127.38**. Cài API và web bằng `npm ci` từ hai lockfile. Prisma generate dùng URL placeholder, không kết nối hoặc migrate DB.

| Thư mục | Lệnh | Kết quả |
| --- | --- | --- |
| api | `npm run db:generate` | Prisma Client 6.12.0 sinh thành công |
| api | `npm run build` | TypeScript đạt |
| api | `npm test` | **70/70 đạt**, không fail/skip; 29 A + 38 B + 2 A/B + 1 đường dẫn production |
| web | `npm run build` | TypeScript và Vite đạt, 47 modules |
| web | `npm run test:e2e` | **28/28 đạt**, không retry; mock UI, auth/upload/delete/responsive |
| web | `npm run test:e2e:integration` | **1/1 đạt**, không retry; Chrome → React build → Express B → sharp → PhotoService/chunker/media A |

Các lệnh được thực thi qua `npm exec --yes --package=node@22.23.3 -- npm ...` vì Node mặc định trên máy là 20.14. Không thay major stack đã chốt. Log API: [ABC-api-tests.txt](ABC-api-tests.txt). Report browser điểm ghép: [abc-browser-results.json](abc-browser-results.json). UI mock: [mock-browser/playwright-results.json](mock-browser/playwright-results.json) và các ảnh/DOM/Network trong cùng thư mục.

## Luồng browser xuyên A/B/C

Không intercept API hoặc media trong browser. Test khởi động `api/tests/browser-server.ts` chỉ cho kiểm thử, phục vụ đúng React build bằng app factory thực tế. User/session/photo repositories và object storage dùng test double; các thành phần Express, cookie/CSRF/bcrypt, multipart, sharp/WebP, publish/chunk/manifest/assemble và media router là code thật.

Luồng kiểm tra:

1. Đăng ký và đăng nhập tài khoản thứ nhất; upload JPEG + PNG 1200×800 tạo từ canvas.
2. API trả 2 ảnh thành công, mỗi ảnh có variants 320/960/1200, đúng tên uploader và không lộ email/passwordHash/storageKey/tempPath.
3. Khách tải detail và WebP, decode được ảnh; MIME `image/webp`, cache immutable. Khách DELETE trả 401.
4. Tài khoản thứ hai đăng nhập, `/me` 200 trước/sau reload; không có nút xóa, direct DELETE với CSRF hợp lệ trả 403.
5. Chủ ảnh reload detail, Hủy không xóa; xác nhận xóa và request mới tới API/media trả 404. Logout chặn upload và chuyển login.
6. Test dọn ảnh còn lại của lượt chạy; không giữ trace/cookie/password trong report. Tài khoản/kho kiểm thử chỉ trong memory của process và biến mất khi process dừng.

Đã sửa điều kiện chờ trong live helper: kiểm tra `URL.pathname` thay vì regex cuối URL, tránh nhận nhầm `/login?returnTo=/photos/upload` là đã hoàn tất login.

## Giới hạn

Chưa có `DATABASE_URL`, endpoint/credential SeaweedFS thật hoặc Docker để chạy môi trường đầy đủ. Chưa migrate DB thật, chạy storage:check/cleanup, live browser/API, kiểm kê SQL/S3, restart Express/SeaweedFS hoặc outage trên dịch vụ thật. Đây là bằng chứng kết nối source A/B/C và kiểm tra có kiểm soát; không thay nghiệm thu PostgreSQL/S3. E01–E20 chưa được ký đạt toàn bộ.

Production không có memory repository, fake S3 hay local fallback. Khởi động thật vẫn yêu cầu cấu hình `api/.env`, `infra/seaweedfs/.env`, DB Block 11 riêng và volume SeaweedFS theo README.
