# Bài 1 Block 9 — CSR

## Nền code đã lấy

`api/` và `web/` là working copy trực tiếp từ `block-07/api` và `block-07/web`. Giữ nguyên schema nghiệp vụ, cả ba migration, seed, ảnh, giao diện, tìm kiếm và phân trang. Không copy `.env`, dependency cache, `node_modules` hay build output. Không sửa source Block 7/8.

Từ **auth đang chạy** của Block 8 (`src/auth/**`), đã copy và điều chỉnh các phần dùng chung vào API:

| Nguồn Block 8 | Working copy | Điều chỉnh CSR |
| --- | --- | --- |
| `src/auth/email.ts` | `api/src/services/auth/email.ts` | SMTP giữ nguyên; link reset dùng `WEB_ORIGIN/reset?token=...`. |
| `src/auth/validation.ts` | `api/src/validation/auth.ts` | Giữ chính sách mật khẩu 8 ký tự/72 byte; bỏ invitation code; nhận CAPTCHA token; strip role client. |
| `src/auth/tokens.ts` | `api/src/services/auth/tokens.ts` | Giữ HMAC OTP/reset và transaction retry; bỏ fallback session; bổ sung random/hash refresh theo contract. |
| bcrypt trong `routes.ts`, `login.ts`, `password-recovery.ts` | `api/src/services/auth/password.ts` | Tách hash cost 12 và compare ra helper. |
| `src/auth/captcha.ts` | `api/src/services/auth/captcha.ts` | Thay SVG/session bằng xác minh Turnstile phía server và hostname allowlist. |

Toàn bộ `src/auth/*.ts` đang chạy, `src/app.ts`, schema và README Block 8 còn được copy nguyên trạng vào `reference/block-08/`. Đây là source để A tiếp tục chuyển OTP/login/quota/reset sang service JSON; thư mục này không nằm trong TypeScript build, không mount SSR/EJS/session vào API.

## Trạng thái phần B

Đã có routes auth, JWT HS256 10 phút, middleware xác minh JWT và trạng thái DB qua adapter, refresh/logout/CSRF, cookie và CORS credentials. Hai GET dishes public; mọi thao tác ghi dishes và toàn bộ chefs/ingredients cần Bearer token, không phân quyền theo role.

**Chưa có schema/migration/service DB của A.** Theo lựa chọn của người giao việc, B dùng interface `AuthServices` và được kiểm thử bằng test double. App mặc định trả `503 AUTH_SERVICE_UNAVAILABLE` cho thao tác cần service chưa nối; không tạo tài khoản/phiên đăng nhập giả. Web vẫn là snapshot Block 7 để C làm tiếp.

Xem [B_HANDOFF.md](docs/B_HANDOFF.md) để nối adapter A, cấu hình env và kiểm tra tích hợp thật.

## Kiểm tra phần B

Trong `BAI1/api`:

```powershell
npm ci
npm run db:generate
npm run build
npm test
npm run demo:agent-bug
```

Trong `BAI1`:

```powershell
node scripts/verify-snapshot.mjs
```

Không cần DB/SMTP/Turnstile thật để chạy các test trên. Supertest cần được phép mở kết nối localhost. Chưa chạy migration, seed hoặc sửa dữ liệu DB thật. Không dùng `db:push` để thay thế migration của A.

## Bằng chứng

- `docs/test-results.tap`: 41 test đạt, gồm 16 test API kế thừa đã thêm token của viewer, 24 test auth và 1 test catalog.
- `docs/snapshot-manifest.json`: SHA-256 của 1.116 file; 1.110 file khớp, 6 file API thay đổi có chủ đích, không có chênh lệch ngoài kế hoạch. Script so sánh với nguồn local hiện tại.
- `docs/agent-bug-demo.json`: minh họa lỗi bỏ kiểm tra passwordVersion JWT trong module tạm cô lập; middleware thật từ chối JWT cũ. Module lỗi đã được xóa sau thử nghiệm.
