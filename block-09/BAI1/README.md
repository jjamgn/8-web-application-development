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

**Đã merge schema/migration/service DB của A và API của B.** Hai bên vẫn có giao tiếp khác nhau: A xuất factory `createAuthServices`, B nhận interface `AuthServices`; adapter production chưa nối. App mặc định trả `503 AUTH_SERVICE_UNAVAILABLE` cho thao tác cần service chưa nối; không tạo tài khoản/phiên đăng nhập giả. Web vẫn là snapshot Block 7 để C làm tiếp.

Xem [ROLE_A_HANDOFF.md](ROLE_A_HANDOFF.md) để biết service A và các khác biệt cần xử lý khi viết adapter: kết quả `kind` so với lỗi AuthError, inspectRefresh nghiêm ngặt so với lookup cả token đã dùng, tránh xác minh hai lần cùng CAPTCHA, và quota IP do interface B yêu cầu. Sau merge, `npm test` gồm 49 test A/B đã pass; build pass. Bộ PostgreSQL riêng của A trước merge đã pass 29 test. Không coi test double của B là bằng chứng adapter production đã được nối.

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

- `docs/test-results.tap`: bằng chứng lịch sử 41 test của B trước merge; kết quả bản merge được ghi trong `../history.md`.
- `docs/snapshot-manifest.json`: manifest được tạo lại sau merge theo baseline đầy đủ của A; script chuẩn hóa CRLF cho file text và so sánh binary nguyên byte, cho phép các thay đổi API/schema/docs có chủ đích.
- `docs/agent-bug-demo.json`: minh họa lỗi bỏ kiểm tra passwordVersion JWT trong module tạm cô lập; middleware thật từ chối JWT cũ. Module lỗi đã được xóa sau thử nghiệm.
