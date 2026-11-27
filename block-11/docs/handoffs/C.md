# Bàn giao C — React và kiểm chứng trình duyệt

> **SNAPSHOT LỊCH SỬ:** báo cáo/bàn giao này giữ kết quả tại thời điểm lập. Trạng thái tích hợp và môi trường thật mới nhất xem [báo cáo chạy thật](../evidence/review-20261127/REVIEW.md) và [ma trận hiện hành](../evidence/README.md). Các câu “chưa chạy/chưa có môi trường thật” bên dưới không phải kết luận hiện tại.

Ngày: 27/11/2026. C dựng ban đầu trên `codex/block11-c`; đã ghép vào `main` từ nền A+B `223c6e9`. Source tại `web/**`, README và bằng chứng tại `docs/evidence/**`. Contract giữ nguyên byte; SHA-256 `A372866885DDB50EC70B556E97AB79D01E75AB8E38DD8DB4E6CC1066DC8CF6F1`. Báo cáo hiện tại: [ABC-integration.md](../evidence/ABC-integration.md).

## Đã triển khai

- React 19, Vite 7, React Router 7, TypeScript; npm lockfile riêng. Proxy `/api` và `/media`, không đổi Origin. `/` về `/photos`; deep link xử lý bằng BrowserRouter.
- Gallery gọi API công khai độc lập `/me`, loading/rỗng/error/retry/404, query page nguyên dương, phân trang theo DTO 12 ảnh.
- Gallery 1/2/3 cột ở breakpoint contract; srcset từ width thực, sizes tính padding 24px, gap 24px và content max-width 1200px. Fallback gần 960; ảnh gallery lazy, detail eager/high; width/height, alt đầy đủ.
- Register validation Unicode/name, mật khẩu 8 ký tự/72 bytes UTF-8 và confirm; register không auto-login. Login/logout/CSRF, token xoay sau login; session chỉ ở server, frontend không lưu credential/token vào web storage. `returnTo` allowlist chỉ `/photos/upload`, fallback `/photos`.
- Upload guard, preview object URL có thu hồi, title/alt từng file, FormData giữ thứ tự photos/metadata, đếm code point, cảnh báo 1–5 file/10 MiB. Khóa form/submit trong khi gửi và sau một lần gửi; lượt mới phải chọn lại, không retry ảnh đã thành công. Lỗi từng file, toàn request, mất kết nối và hết phiên tách rõ.
- Hiện tên uploader, ẩn nút xóa khi không sở hữu. Native dialog hỗ trợ focus/ESC/Hủy không DELETE. 204 và 202 thông báo khác nhau; lỗi server không báo xóa thành công. Backend vẫn phải kiểm tra quyền.
- Playwright mock, ảnh minh họa chỉ trong test, DOM/currentSrc/Network/screenshot ở nhiều viewport/DPR. Live suite riêng không mock, sử dụng hai tài khoản và ảnh canvas.

## Điểm ghép A/B

1. `web/src/types.ts` đã re-export DTO và LIMITS/codePoints trực tiếp từ `contracts/index.ts` của B, không định nghĩa DTO riêng. Vite chỉ cho phép web và contracts trong allowlist nguồn; không đưa Prisma/fs/S3 vào browser.
2. `GET /api/auth/me` trả `{ok:true,data:{user:{id,name}}}` hoặc 401. CSRF `{csrfToken}`, login `{user,csrfToken}`, register `{user}` không tự login, logout 204. Ghi dữ liệu yêu cầu Origin chính xác và `X-CSRF-Token`; Vite giữ nguyên Origin `http://localhost:5173`.
3. Upload gửi phần file lặp `photos` trước, rồi `metadata` JSON `{title,alt}[]`. B phải hỗ trợ text trước/sau theo contract. Không có uploaderId ở payload. Response 200 `{results,succeeded,failed}` trong envelope; mixed/all-failed đều hiển thị theo từng index.
4. List data `{items,page,pageSize:12,total,totalPages}`, detail data là PhotoDto trực tiếp. variants sắp width tăng, URL tương đối `/media/photos/:id/:width.webp`, uploader chỉ `{id,name}`.
5. DELETE 204 không có body, hoặc 202 data `{id,status:'DELETING'}`. GET list/detail/media sau ẩn phải không còn ảnh. Lỗi envelope theo contract, không trả HTML cho `/api`.
6. B đã mount media A và phục vụ `web/dist`. Theo yêu cầu ghép A/B/C của người dùng, đã sửa điểm ghép production trong app/server: đường dẫn web theo module, fallback hoạt động dưới thư mục có dấu chấm. Không đổi API/schema/contract hoặc hạ tầng.

## Chạy / kiểm tra

Tại `web/`, Node 22.23.3 đã kiểm chứng: `npm ci`, `npm run dev`, `npm run build`, `npm run test:e2e`. Chrome được dùng mặc định; xem README để dùng Chromium. Live: chạy API/DB/SeaweedFS thật, đặt `LIVE_BASE_URL`, `LIVE_RUN_MUTATIONS=1`, chạy `npm run test:e2e:live`.

Kết quả độc lập C ban đầu ở [validation.md](../evidence/validation.md); kết quả sau ghép ở [ABC-integration.md](../evidence/ABC-integration.md). `npm run test:e2e:integration` chạy browser qua Express/sharp/PhotoService/media thật, DB/S3 test double. Không dùng kết quả có kiểm soát để ký nghiệm thu storage thật.

## Chưa hoàn thành / phụ thuộc

- Code A/B, migration, Compose và cấu hình mẫu đã có sau khi kéo main `223c6e9`. Chưa có endpoint/credential PostgreSQL và SeaweedFS thật để chạy live suite, restart storage, SQL/key/hash hoặc cleanup trên hạ tầng thật.
- C có live suite và quy trình demo; các hàng E01–E20 vẫn chưa được ký đạt toàn bộ. Phân biệt browser qua API có kiểm soát với nghiệm thu persistence/S3 thật.
- `.env.example` API/infra, lệnh backend/storage và volume `block11-storage_seaweed-data` có trong source A/B; người chạy cần điền secret riêng. Frontend không cần credential.
