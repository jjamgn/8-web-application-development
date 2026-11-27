# Kiểm tra bản ghép A/B/C trên máy người dùng — 27/11/2026

## Nền và môi trường

- Kéo GitHub main tại `e5a8492` (A `0bee219`, B `223c6e9`, C `e5a8492`). Kiểm tra trong worktree `.block11-review`, nhánh local `codex/block11-integration-review`, không ghi đè các thay đổi Block 7–9 ở worktree gốc.
- Windows, Node 26.13.0, npm 11.20.0; dependency cài bằng npm ci từ lockfile API/web chính thức.
- Supabase **project mới `swuswowkpsffkrvvyblo`**, Session pooler port 5432, TLS. Đã đối chiếu project cũ của Block 8–9 là project khác; không sử dụng project cũ.
- Project mới đã có Chef/Dish/Ingredient và lịch sử migration. Đã chạy `prisma migrate deploy` để thêm migration `202611270001_photo_gallery`, không reset/seed/drop các bảng có sẵn.
- SeaweedFS **4.55 bản Windows chính thức**, tải từ GitHub release và kiểm tra checksum MD5 do release cung cấp. Máy chưa có Docker; chạy `weed mini` với cả `-ip=127.0.0.1` và `-ip.bind=127.0.0.1`, S3 port 8333; data directory riêng có thể dùng lại khi khởi động.
- Credential chỉ nằm ở .env local được Git bỏ qua. Không có mật khẩu/cookie/CSRF token trong báo cáo hoặc ảnh chụp.

## Lỗi tìm được và bản sửa local

1. **Server đã compile không khởi động:** NodeNext xuất contracts/index.ts thành CommonJS vì không có package boundary ESM, trong khi output nằm dưới API package type=module. Thêm `contracts/package.json` type=module; thêm regression test compile vào output tạm và import server/contracts bằng Node native, không dùng tsx.
2. **Upload thật rollback với P2028:** interactive transaction mặc định 5 giây hết hạn qua Supabase Session pooler khi tạo Photo/Variant/Chunk. Giới hạn transaction ghi và snapshot list được đặt rõ maxWait 10 giây, timeout 30 giây, vẫn hữu hạn. Thêm log chỉ mã Prisma đã lọc, không log message/credential.
3. **E2E live hết hạn chờ cloud:** tăng expect timeout của live suite lên 20 giây và tổng thời gian test lên 240 giây; controlled suite giữ 120 giây. Không nới giới hạn validation hoặc assertion nghiệp vụ.
4. **Race trong bài test logout:** chờ POST logout trả 204 và UI hiện liên kết Đăng nhập trước khi full-page goto upload. Điều hướng ngay sau click từng làm hủy request logout đang tới cloud; mock/controlled nhanh nên không lộ race.
5. **Vite Windows bị EBUSY khi ghi Playwright report:** bỏ qua playwright-report và test-results trong watcher, tránh hot reload/crash khi live reporter ghi file.

Các sửa lỗi này đang ở nhánh local kiểm tra, chưa push GitHub trong lượt này.

## Kết quả cuối cùng

| Kiểm tra | Kết quả |
| --- | --- |
| API Prisma generate + TypeScript build | Đạt |
| React/Vite build | Đạt |
| Backend A/B + regression compiled ESM | **71/71**, không skip |
| Playwright UI với fixtures | **28/28**; không thay thế live DB/S3 |
| Playwright controlled A/B/C | **1/1**, Express/sharp/service/media thật, DB/S3 test double |
| S3 storage:check thật | Bucket/versioning hợp lệ, PUT/GET/HEAD đạt, anonymous bị chặn, probe đã xóa |
| A live smoke thật | Đạt; WebP nhiều mảnh có chunkCounts `[1,1,2]`, ghép khớp SHA-256, HEAD đúng bytes và xóa các mảnh sau thử |
| HTTP live A/B thật | **1/1**, khoảng 35 giây: auth, PNG + file giả, metadata người đăng, media công khai, xóa đúng chủ, logout |
| Playwright live React → API → Supabase → SeaweedFS | **1/1**, khoảng 1,2 phút: hai tài khoản, JPEG/PNG, variants, media MIME/cache, guest 401/khác chủ 403, chủ xóa, reload và logout |

Ảnh [gallery-live.png](./gallery-live.png) được chụp từ giao diện public đang chạy, sau khi số ảnh DOM khớp response và ảnh đã decode xong. Hình minh họa xanh là fixture canvas của live test, không phải ảnh tải sẵn/mock API.

Lượt thử đầu đã phát hiện lỗi/timeout nêu trên; các kết quả đạt trong bảng là lượt chạy lại sau sửa. Không coi các lượt lỗi ban đầu là pass.

## Chạy lại và dịch vụ hiện tại

- Web: `http://localhost:5173/photos`; API: `http://127.0.0.1:3000/api/photos`; S3: localhost:8333, không truy cập bằng browser ẩn danh.
- API hiện chạy bằng output build, frontend chạy Vite. Source thực tế nằm trong `.block11-review/block-11/`.
- Các process được khởi động nền, PID và log nằm trong `.block11-review/.runtime-tools/` (Git bỏ qua). Không tải log thô lên GitHub vì có thể chứa dữ liệu vận hành.
- Nếu cần chạy lại API/web, dùng npm scripts trong README của bản checkout này. SeaweedFS Windows phải dùng cùng data directory và hai cờ IP loopback ở trên; credential lấy từ env local, không đặt trên command line.
- Test live tạo tài khoản thử; baseline không có endpoint xóa tài khoản nên các tài khoản đó có thể còn trong DB. Các ảnh thử được dọn bằng finally; không xóa tài khoản/ảnh ngoài lượt kiểm tra.

## Phạm vi chưa kết luận

- Chưa nghiệm thu Docker Compose trên máy này; SeaweedFS thật được chạy bằng binary Windows.
- Chưa thực hiện restart/recreate có dữ liệu đang tồn tại để kết luận E10, chưa kiểm tra ngắt mạng/process crash thật và toàn bộ fault matrix trên cloud. Unit tests về recovery/rollback không thay bằng chứng này.
- Chưa thử HTTPS deployment, reverse proxy hoặc nhiều instance. Đây là chạy local nối Supabase cloud, không phải publish website.
- Bộ tests đạt không đồng nghĩa toàn bộ E01–E20 đã hoàn tất mọi bằng chứng nộp.
