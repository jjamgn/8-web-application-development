# Bài 1 Block 9 — CSR

## Nền code đã lấy

`api/` và `web/` là working copy trực tiếp từ `block-07/api` và `block-07/web`. Giữ nguyên schema nghiệp vụ, 7 migration nền, seed, ảnh, giao diện, tìm kiếm và phân trang; A bổ sung migration auth riêng. Không copy `.env`, dependency cache, `node_modules` hay build output. Không sửa source Block 7/8.

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

**Đã tích hợp A+B+C local từ GitHub main `5ef7427`.** Runtime dùng `api/src/lib/auth-production.ts` để nối factory A vào interface B. Frontend C có trang auth, token trong memory, khôi phục sau reload, refresh single-flight và logout server. Tìm kiếm/phân trang cùng chỉnh sửa chữ header local được giữ lại.

Adapter ánh xạ kết quả `kind` thành AuthError, giữ snapshot passwordVersion khi tạo phiên, dùng lookup family riêng cho CSRF trước rotation, và áp quota HTTP bằng transaction DB. CAPTCHA được xác minh một lần trong từng request rồi chia sẻ kết quả giữa route B và service A. Bộ 52 test API cùng 4 test client auth pass; API/web build pass. Test adapter dùng Prisma-shaped test double để kiểm tra nối module; chưa chạy lại PostgreSQL, SMTP hoặc Turnstile thật.

Xem [INTEGRATION.md](docs/INTEGRATION.md) để cấu hình và chạy bản ghép. Bàn giao A/B giữ lại làm lịch sử thiết kế.

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

- `docs/test-results.tap`: bằng chứng lịch sử 41 test của B trước merge; kết quả bản merge được ghi trong `../history.md`.
- `docs/snapshot-manifest.json`: manifest được tạo lại sau merge theo baseline đầy đủ của A; script chuẩn hóa CRLF cho file text và so sánh binary nguyên byte, cho phép các thay đổi API/schema/docs có chủ đích.
- `docs/agent-bug-demo.json`: minh họa lỗi bỏ kiểm tra passwordVersion JWT trong module tạm cô lập; middleware thật từ chối JWT cũ. Module lỗi đã được xóa sau thử nghiệm.
