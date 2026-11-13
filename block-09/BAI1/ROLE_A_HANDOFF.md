# Bàn giao Role A — dữ liệu và nghiệp vụ auth

Ngày: 13/11/2026. Căn cứ: [contract](../BAI1_CONTRACT.md), [kế hoạch](../plan.md), [nhật ký thực hiện](../history.md).

## Trạng thái

Đã có schema/migration bổ sung và các service auth độc lập với HTTP. API/web được chép từ Block 7. **Chưa mount endpoint auth hoặc bảo vệ resource routes**; app hiện tại vẫn chạy theo snapshot Block 7. B cần tích hợp route/JWT/cookie/Origin/CSRF/CORS/IP rate limit; C làm giao diện và single-flight. Không coi working copy này là API auth hoàn chỉnh để triển khai công khai.

Đã kiểm chứng bằng PostgreSQL 17 cô lập và email/CAPTCHA giả lập, không gửi email thật, không dùng DB chung.

## File và nguồn chuyển đổi

| File | Nguồn/cách xử lý |
|---|---|
| `api/prisma/schema.prisma` | Giữ nguyên phần nghiệp vụ Block 7; thêm User, EmailVerification, LoginAttempt, PasswordResetToken, RefreshToken. Không thêm Session. |
| `api/prisma/migrations/202611130001_csr_auth/migration.sql` | Prisma diff từ schema Block 7; bổ sung bảng/index/FK và RLS auth. |
| `api/src/validation/auth.ts` | Từ validation auth đang chạy Block 8; bỏ invitationCode, strip role, thêm DTO CSR/CAPTCHA. |
| `api/src/services/auth/registration.ts` | Tách issue/verify OTP, register/resend từ `block-08/src/auth/routes.ts`. |
| `api/src/services/auth/password-recovery.ts` | Từ password-recovery Block 8; thay xóa Session bằng revoke mọi refresh family. |
| `api/src/services/auth/email.ts` | Từ mailer auth Block 8; reset link dùng WEB_ORIGIN và `/reset`. |
| `api/src/services/auth/tokens.ts` | Từ helper Block 8; bỏ fallback SESSION_SECRET; thêm công thức refresh/CSRF đúng contract. |
| `api/src/services/auth/login-attempts.ts` | Tách nghiệp vụ bộ đếm/login Block 8; không còn Express/session/redirect. |
| `api/src/services/auth/refresh.ts`, `types.ts`, `index.ts` | Mới cho CSR: family, rotation/reuse/revoke, snapshot passwordVersion, DTO nội bộ, factory. |
| `api/tests/auth-services.test.ts`, `auth-postgres.test.ts` | Unit và integration PostgreSQL cho bảo mật, quota và transaction đồng thời. |
| `api/tests/api.test.ts` | Sửa stub kế thừa: bỏ qua undefined như Prisma; giữ nguyên code resource. |
| `api/package.json`, `package-lock.json` | Thêm bcryptjs, Nodemailer/type và script test theo xác nhận của người dùng. Không nâng Prisma/framework. |

Nguồn Block 7/8 không bị sửa. Web là snapshot, chưa làm phần C. `.env` thật/node_modules/cache/build không nằm trong snapshot source; dependency được cài riêng ở working copy.

## Điểm vào và phụ thuộc

```ts
import { createAuthServices, csrfTokenForFamily } from './services/auth/index.js';

const auth = createAuthServices({
  verifyCaptcha: verifyTurnstileOnServer, // (token: string, ip?: string) => Promise<boolean>
});
```

Factory mặc định dùng Prisma singleton của API, clock thực và Nodemailer. Có thể tiêm `db`, `now`, `sendEmail`, `verifyCaptcha` cho test. CAPTCHA mặc định **từ chối**; B phải cung cấp adapter Turnstile thật, kiểm tra hostname theo cấu hình và giới hạn thời gian gọi mạng. Không đưa kết quả boolean từ client vào thay cho xác minh server.

Register/forgot gọi adapter trước bcrypt hoặc tạo reset token. B áp quota HTTP/IP trước khi gọi service. Service tự validate input bằng Zod; B map ZodError thành lỗi validation theo envelope hiện có, không trả raw error/stack/input ra log hoặc client.

## Giao tiếp service thực tế

Các kết quả dưới đây là object nội bộ, **không phải envelope HTTP**.

| Hàm | Input | Kết quả/trách nhiệm B |
|---|---|---|
| `register(input, ip?)` | name, email, password, confirmPassword, captchaToken | `accepted` chung cho email mới/trùng; `captcha-required` hoặc `invalid-captcha`. Không có user/OTP trong response. |
| `activate(email, otp)` | Email và OTP dạng string | `activated` hoặc `invalid`; invalid → `200 INVALID_OTP`. Không cấp token. Email sai cũng cho invalid. |
| `resendActivation(email)` | Email hợp lệ | `accepted` chung cho unknown/active/cooldown/quota/exhausted; quota IP do B trả 429. |
| `requestPasswordReset(input, ip?)` | email, captchaToken | `accepted` chung, kể cả pending/unknown/cooldown/quota tài khoản/SMTP failure; hoặc lỗi CAPTCHA. Quota IP do B trả 429. |
| `resetPassword(input)` | token, password, confirmPassword | `reset` hoặc `invalid`; invalid → `200 INVALID_RESET_TOKEN`; không auto-login. Thiếu/sai kiểu token được coi là invalid khi mật khẩu hợp lệ. |
| `loginState(email, ip)` | Email/IP | `{captchaRequired, lockedUntil}`; B có thể dùng state để cho C biết lúc cần hiển thị CAPTCHA. |
| `recordLoginFailure(email, ip)` | Email/IP | Ghi failure account/IP trong transaction, trả LoginState. Không gọi thêm hàm này sau authenticateLogin vì sẽ đếm hai lần. |
| `authenticateLogin(input, ip)` | email, password, captchaToken khi cần | `authenticated` kèm PublicUser/passwordVersion; hoặc `invalid-credentials`, `account-not-activated`, `rate-limited` kèm lockedUntil, lỗi CAPTCHA. Chưa tạo family/JWT. |
| `createRefreshFamily({userId, passwordVersion})` | Snapshot từ login đã xác thực | SessionGrant hoặc null nếu user/pv đổi trước khi ghi. Không được đọc pv mới rồi thay snapshot login cũ để vượt kiểm tra này. |
| `inspectRefresh(raw)` | Raw refresh từ cookie | RefreshContext hoặc null; chỉ token chưa dùng/chưa revoke/chưa hết hạn, user active/pv khớp. Không rotate/gia hạn. Dùng cho GET /csrf. |
| `refreshFamilyForCsrf(raw)` | Raw refresh từ cookie | familyId hoặc null, kể cả record đã dùng/revoke; **chỉ phục vụ kiểm tra CSRF trước POST**, không xác thực phiên và không cấp CSRF mới. |
| `rotateRefresh(raw)` | Raw refresh sau kiểm tra Origin/CSRF | `rotated` kèm grant; `invalid`; `reused` sau khi revoke family đã commit. Map 401 theo contract. |
| `revokeFamily(familyId)` | Family đã được B kiểm tra Origin/CSRF | void, idempotent; B xóa cookie đúng path/flags. |

`revokeUserFamilies(tx, userId, now)` được export riêng nếu cần phối hợp đổi mật khẩu: gọi trong cùng transaction với tăng passwordVersion. Không gọi như một thao tác tách rời sau khi đã commit mật khẩu.

### DTO nội bộ

```ts
type PublicUser = { id: number; name: string; email: string; role: string };
type SessionGrant = {
  user: PublicUser;
  passwordVersion: number;
  familyId: string;
  refreshToken: string; // raw, nội bộ cho Set-Cookie
  expiresAt: Date;
  absoluteExpiresAt: Date;
};
```

Không `res.json(grant)`. B chỉ chọn `user`, access JWT, tokenType Bearer, expiresIn 600, csrfToken cho JSON. `refreshToken` chỉ vào cookie HttpOnly/Secure/SameSite=Strict/Path=/api/auth, không Domain. Max-Age phải tính từ expiresAt tại lúc gửi response, không vượt hạn DB.

### Luồng tích hợp B cần giữ

1. **Login:** kiểm tra Origin + quota IP → authenticateLogin → createRefreshFamily với snapshot nhận được → ký JWT có sid=familyId/pv → CSRF bằng csrfTokenForFamily → cookie + JSON đúng envelope. Nếu createRefreshFamily trả null, không cấp JWT.
2. **GET /csrf:** kiểm tra Origin/credentials → inspectRefresh → tính CSRF nếu context hợp lệ. Không dùng refreshFamilyForCsrf để cấp CSRF cho record đã dùng hoặc user không hợp lệ.
3. **POST /refresh:** Origin + quota IP → refreshFamilyForCsrf từ cookie → so sánh constant-time X-CSRF-Token với csrfTokenForFamily → rotateRefresh → map result sau commit. **Không dùng inspectRefresh làm điều kiện chặn trước rotate:** cách đó chặn token đã dùng trước khi service phát hiện reuse và thu hồi family.
4. **Logout:** Origin hợp lệ; khi refresh cookie có context hợp lệ, CSRF phải đúng trước revokeFamily. Cookie không còn hợp lệ thì xử lý idempotent theo contract; xóa cookie. Không có side effect revoke trước khi qua Origin/CSRF.
5. **Middleware access:** verify JWT claims/chữ ký → user active, passwordVersion khớp → tồn tại RefreshToken cùng sid/userId, chưa used/revoked và còn cả hai hạn dùng. Không cấp quyền CRUD theo role.
6. **Reset:** service đã tăng passwordVersion và revoke tất cả family cùng transaction; B không tự tạo phiên đăng nhập mới.

Mapping lỗi: `invalid-credentials` → 200 INVALID_CREDENTIALS; `account-not-activated` → 200 ACCOUNT_NOT_ACTIVATED; CAPTCHA → 200 CAPTCHA_REQUIRED/INVALID_CAPTCHA; `rate-limited` → 429 RATE_LIMITED. Token access/refresh sai → 401; Origin/CSRF do B xử lý theo contract. Trả state captchaRequired sau lần login sai thứ ba nếu C cần thông tin để dựng widget ngay.

## Chính sách đã triển khai

- bcryptjs cost 12; mật khẩu ít nhất 8 ký tự, tối đa 72 byte UTF-8, confirm khớp.
- OTP 6 chữ số, TTL 10 phút, HMAC theo purpose/user; tối đa 5 lần sai, lần thứ 5 tiêu thụ mã; resend không reset attempts và không mở lại lượt đã hết.
- OTP/reset cooldown 60 giây, tối đa 5 email/tài khoản/giờ theo chính sách kế thừa Block 8. SMTP sau commit; lỗi gửi vô hiệu đúng token vừa phát. Lỗi SMTP muộn không vô hiệu nhầm OTP mới hơn.
- Reset random 32 bytes → 64 ký tự hex, HMAC, TTL 30 phút, chỉ consume khi POST thành công. Reset consume/update password/version/revoke tất cả family trong cùng transaction.
- Login cửa sổ 15 phút, CAPTCHA sau 3 lần sai, khóa 15 phút từ 5 lần/account hoặc 20 lần/IP. Login thành công chỉ xóa failure account, giữ lịch sử IP.
- Refresh random 32 bytes base64url, DB chỉ HMAC, idle 7 ngày/absolute 30 ngày từ login; mỗi rotation giữ absoluteExpiresAt và passwordVersion gốc.
- Transaction Serializable có tối đa 3 lần thử khi P2034. Reuse trả result sau commit, không throw làm rollback việc revoke.
- Không xóa record refresh đã dùng chỉ theo idle expiry: cần giữ đến hết đời family để nhận biết reuse của token cũ. Chưa thêm job dọn dữ liệu.

## Migration và env

Migration mới: `202611130001_csr_auth`. 7 migration Block 7 và migration_lock.toml khớp hash nguồn; schema nghiệp vụ Block 7 được giữ nguyên.

DB thử nghiệm được dựng mới từ 7 migration Block 7; có dữ liệu món/chef/ingredient trước auth migration; sau auth vẫn giữ dữ liệu, quan hệ và search vector. Không áp migration lên DB chung.

**DB đã chạy Block 8:** không chạy thẳng migration tạo bảng auth vì sẽ trùng bảng/history. Nhóm cần đối chiếu và chuẩn bị cách baseline/roll-forward riêng; không sửa checksum migration đã áp dụng hoặc reset DB để né lỗi.

Prisma migrate status báo up to date ở DB thử nghiệm. `migrate diff` DB → schema báo hai index Dish (`price,id` và GIN searchVector) không được khai báo trong Prisma schema; cả hai do migration gốc Block 7 tạo. Giữ nguyên để bảo toàn tìm kiếm; diff không báo khác biệt model auth. Không dùng db push để xóa các index này.

Env của A cần B điền placeholder vào `.env.example`: DATABASE_URL, DIRECT_URL theo cấu hình Prisma hiện có, AUTH_TOKEN_SECRET (ít nhất 32 ký tự ngẫu nhiên, không fallback SESSION_SECRET), WEB_ORIGIN và SMTP_HOST/PORT/SECURE/REQUIRE_TLS/USER/PASSWORD/FROM. JWT_SECRET/ISSUER/AUDIENCE, Turnstile và origin allowlist do B tích hợp theo contract. Không đưa giá trị secret thật vào tài liệu/log.

## Cách chạy kiểm tra

Từ `BAI1/api`, sau `npm ci` và cấu hình Prisma phù hợp:

```powershell
npx --no-install prisma validate
npm run db:generate
npm run build
npm test
```

`npm test` gồm API/search/catalog Block 7 và unit auth, không ghi DB thật hoặc gửi SMTP. `npm run test:auth` chạy riêng unit auth.

Integration phải dùng DB PostgreSQL cô lập đã áp các migration, user `role_a`, tên DB `role_a_test`, host `127.0.0.1`. Test từ chối URL khác trước khi truy cập DB và không kế thừa DATABASE_URL của app.

```powershell
# URL dưới đây chỉ cho cluster local thử nghiệm của lần làm việc này.
$env:AUTH_TEST_DATABASE_URL = 'postgresql://role_a@127.0.0.1:55439/role_a_test'
npm run test:auth:db
```

Test integration xóa User/LoginAttempt trong DB thử nghiệm giữa các ca, không chạm dữ liệu món. Mặc định ca kiểm tra dữ liệu trước migration được skip nếu chưa có probe. Trong lần kiểm chứng này đã tạo probe tên `__role_a_baseline__` trước migration auth và chạy với `AUTH_TEST_EXPECT_BASELINE=1`, nên không có test skip. Cluster local tạm nằm trong `.local` đã gitignore; đó là dữ liệu thử nghiệm, không phải thành phần runtime của app.

### Bằng chứng lần triển khai này

| Kiểm tra | Kết quả |
|---|---|
| Prisma validate/generate | Pass, Prisma 6.12.0 |
| TypeScript build | Pass |
| `npm test` | 25/25 pass, không skip |
| PostgreSQL `test:auth:db` | 29/29 pass, không skip |
| Migration incremental | 7 migration nền → dữ liệu probe → migration auth, pass |
| Double activate/reset, rotate/reuse, reset–rotate, logout–rotate | Pass trên PostgreSQL thật |
| Concurrent resend/forgot/login attempts | Pass, không vượt cooldown hoặc mất counter |
| SMTP lỗi muộn | Pass, OTP mới không bị retire nhầm |

Minh họa lỗi coding agent nằm **chỉ trong test cô lập**: update revoke rồi throw trong transaction làm rollback. Test xác nhận lỗi, sau đó gọi service đúng với return result và xác nhận revoke commit. Không có nhánh code lỗi trong service sản xuất.

Chưa kiểm chứng: SMTP/Turnstile thật, endpoint/status/cookie/JWT/Origin/CSRF, middleware resource và luồng UI/reload/single-flight. Các phần này chờ B/C tích hợp.
