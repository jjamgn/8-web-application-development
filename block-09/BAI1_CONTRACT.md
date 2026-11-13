# Block 9 — Bài 1 (CSR): contract nhóm và phân công

> **Trạng thái:** Bản baseline đã chốt để cả nhóm và coding agent cùng làm theo. Nhóm có thể ghi nhận đồng thuận trong buổi họp; mọi thay đổi sau đó phải được cả nhóm thống nhất và cập nhật tại đây trước khi triển khai.
>
> **Phạm vi:** Bài 1 Block 9, CSR. Đây là tài liệu quyết định kỹ thuật và phân công; yêu cầu trong đề bài Block 9 vẫn là chuẩn cuối cùng.

## 1. Mục tiêu và nền code

- Tạo working copy cho Bài 1 tại `block-09/BAI1/api` và `block-09/BAI1/web`, lấy thẳng API và web hiện tại của **Block 7** làm snapshot bắt đầu. Block 7 kế thừa nền Block 6 và đã có tìm kiếm/phân trang cần giữ, nên không cần chép Block 6 rồi ghép lại các thay đổi đó lần nữa.
- Cách lấy Block 7 làm snapshot vẫn đáp ứng yêu cầu đề dùng API/web Block 6 và giữ tìm kiếm/phân trang Block 7: Block 6 là nền kế thừa, còn Block 7 là bản đã tích hợp các chức năng cần tiếp tục.
- Giữ nguyên source Block 6/7/8 để làm bản tham chiếu; mọi thay đổi Bài 1 thực hiện trong working copy `block-09/BAI1`.
- Chuyển phần nghiệp vụ phù hợp từ **Block 8**: bcryptjs và chính sách mật khẩu, OTP email, chống brute force, CAPTCHA, gửi email và reset password. Chuyển sang API JSON theo hợp đồng Bài 1; không bê nguyên routes EJS, Express session cookie hay cơ chế cấp quyền admin của SSR. Refresh cookie ở Bài 1 là credential riêng của CSR, không phải session cookie của Block 8.
- Nguồn auth đang chạy của Block 8 là `block-08/src/auth/**` được mount qua `block-08/src/app.ts`. Các module đăng ký cũ còn giữ trong `block-08/src/routes/registration.ts` và `block-08/src/services/**` không phải router đang chạy; coding agent không dùng chúng làm chuẩn.
- Bài 1 không yêu cầu mã mời dành cho nhân viên của Block 8. Không yêu cầu `ADMIN_REGISTRATION_CODE`; tài khoản CSR mới vẫn pending cho tới khi xác minh email và role gửi từ client bị bỏ qua.
- Không sửa trực tiếp source Block 6, Block 7 hoặc Block 8; không dựng lại framework/app từ đầu và không xóa migration/schema của bản working copy.
- Bài 1 không triển khai RBAC/ABAC hay MFA/TOTP. Các tài khoản đã kích hoạt có cùng quyền CRUD theo yêu cầu của Bài 1.

## 2. Quyết định công nghệ và bảo mật

| Hạng mục | Quyết định chung |
|---|---|
| API | Giữ Express 5, TypeScript, Prisma 6 và PostgreSQL từ source Block 7, kế thừa nền Block 6. |
| CSR | Giữ React, Vite và React Router từ source Block 7, kế thừa nền Block 6. |
| JWT | Dùng `jose` ở API; ký HS256. Access token sống 10 phút và có `sid` để gắn với phiên refresh đang hoạt động. |
| Bí mật JWT | Dùng `JWT_SECRET` riêng, tối thiểu 32 bytes ngẫu nhiên; không dùng `SESSION_SECRET`, không commit giá trị bí mật. |
| Refresh token | Opaque random 32 bytes, không phải JWT; chỉ lưu HMAC-SHA-256 hash trong DB. Hạn nhàn rỗi 7 ngày, hạn tuyệt đối 30 ngày tính từ đăng nhập. Mỗi lần refresh phải xoay token trong transaction; dùng lại token đã xoay sẽ thu hồi cả family và yêu cầu đăng nhập lại. |
| Lưu token ở trình duyệt | Access token chỉ ở memory của React, gửi bằng `Authorization: Bearer <token>`; không lưu access/refresh token trong Web Storage. Refresh token chỉ ở cookie host-only `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`, không đặt `Domain`. Sau reload, CSR lấy CSRF token rồi gọi refresh để khôi phục access token. |
| CSRF và CORS có cookie | Với `/login`, `/csrf`, `/refresh`, `/logout`, dùng `credentials: "include"` phía web; API chỉ cho origin SPA trong allowlist với `Access-Control-Allow-Credentials: true`, không dùng wildcard. Kiểm tra `Origin`; POST refresh/logout phải có `X-CSRF-Token = HMAC-SHA-256(AUTH_TOKEN_SECRET, "csrf:" + familyId)`, mã hóa base64url và so sánh constant-time. Login/refresh trả CSRF token; `/csrf` tính lại sau reload. Cookie SameSite không thay thế kiểm tra Origin/CSRF. |
| Gia hạn phía CSR | Khi API trả 401 cho request cần đăng nhập, API client dùng single-flight để gọi refresh một lần rồi retry request gốc tối đa một lần. Nếu refresh thất bại thì xóa access/CSRF state trong memory và chuyển về login; không refresh/retry vòng lặp hoặc sau 403. |
| Mật khẩu | Auth đang chạy ở Block 8 dùng bcryptjs cost 12. Dùng cùng giới hạn tối thiểu 8 ký tự, tối đa 72 byte UTF-8; xác nhận mật khẩu phải khớp. Không tự đổi sang Argon2id hoặc thêm quy tắc độ phức tạp khác. |
| Xác minh email | OTP 6 chữ số, hết hạn sau 10 phút; lưu HMAC-SHA-256 có khóa và phân tách mục đích/user, không lưu OTP rõ. Tối đa 5 lần nhập sai; OTP bị tiêu thụ sau lần sai thứ 5 và gửi lại không đặt lại số lần thử. Chờ ít nhất 60 giây giữa lần gửi, tối đa 5 email/tài khoản/giờ. Dùng `AUTH_TOKEN_SECRET`. |
| Quên mật khẩu | Token ngẫu nhiên 32 bytes, mã hóa thành 64 ký tự hex; lưu HMAC-SHA-256 có khóa, hết hạn sau 30 phút, chỉ tiêu thụ khi POST reset thành công. Chờ ít nhất 60 giây giữa lần gửi, tối đa 5 email/tài khoản/giờ. GET form reset không tiêu thụ token. Giới hạn theo IP: forgot 10 POST/15 phút, reset 20 POST/15 phút. |
| Đăng nhập | Dùng chính sách Block 8: cửa sổ 15 phút; yêu cầu CAPTCHA sau 3 lần sai; khóa 15 phút từ 5 lần sai theo tài khoản hoặc 20 lần theo IP; giới hạn phụ 120 POST/IP/15 phút. Lưu bộ đếm trong DB, khóa HMAC cho email/IP dùng `AUTH_TOKEN_SECRET`. |
| CAPTCHA và email | Auth đang chạy ở Block 8 dùng CAPTCHA SVG 6 ký tự, gắn với session, hết hạn sau 5 phút và dùng một lần. Bài 1 giữ Turnstile như lựa chọn thích ứng cho SPA/API không dùng cookie session; đây là thay đổi giao thức của CSR, không phải công nghệ của router Block 8. Server xác minh CAPTCHA trước khi hash mật khẩu đăng ký; dùng Nodemailer/SMTP theo cấu hình Block 8. |
| CORS | Chỉ cho phép origin cấu hình rõ ràng; môi trường dev mặc định `http://localhost:5173` và `http://127.0.0.1:5173`, nhưng web/API phải dùng cùng hostname (`localhost` hoặc `127.0.0.1`) để cookie SameSite hoạt động đúng. Cho phép header `Content-Type`, `Authorization`, `X-CSRF-Token`, xử lý preflight OPTIONS. Credentials chỉ bật cho origin allowlist, không wildcard. |
| Lỗi API | Giữ envelope và quy ước lỗi Block 6/7; không để `ApiError` phía web làm mất HTTP status. Các mã/status ngoại lệ bắt buộc ở mục 4 phải được giữ nguyên. |

`jose` được chọn vì hỗ trợ ký JWT và xác minh chữ ký/claims trong môi trường Node.js; chốt major version 6 và khóa phiên bản thực tế trong lockfile khi tích hợp. Tham khảo [repository chính thức của jose](https://github.com/panva/jose).

### Biến môi trường

- **API, chỉ ở máy chạy API/secret manager:** `DATABASE_URL`, `JWT_SECRET`, `JWT_ISSUER=bep-nha-api`, `JWT_AUDIENCE=bep-nha-web`, `AUTH_TOKEN_SECRET`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAMES`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `WEB_ORIGIN`, `SPA_ORIGINS`.
- **Web, biến public có tiền tố Vite:** `VITE_API_BASE_URL`, `VITE_TURNSTILE_SITE_KEY`.
- `AUTH_TOKEN_SECRET` là khóa riêng, tối thiểu 32 ký tự ngẫu nhiên, cho HMAC OTP/reset/login-attempt/refresh-token hash và CSRF token; Block 8 có fallback sang `SESSION_SECRET` vì SSR cần session, còn CSR không dùng fallback session. `WEB_ORIGIN` là origin của SPA để gửi link reset (tương đương vai trò `APP_URL` trong Block 8).
- Chỉ commit `.env.example` với tên biến và giá trị minh họa không dùng được; không commit `.env`, key, mật khẩu SMTP hoặc token thật.
- Link trong email reset được tạo từ `WEB_ORIGIN`, trỏ tới `/reset?token=...`.

## 3. Quy ước dữ liệu và JWT

- Giữ schema, dữ liệu nghiệp vụ, migration history và tìm kiếm/phân trang của source Block 7 trong working copy; đây là bản kế thừa Block 6 đã có các chức năng Block 7 cần giữ. Chỉ bổ sung model auth tương thích với luồng đang chạy ở Block 8.
- `User` có `name`, email duy nhất, `passwordHash`, `emailVerifiedAt`, trạng thái `pending`/`active`, `role` mặc định `viewer` và `passwordVersion` (số nguyên, mặc định 0). Đăng ký luôn gán role phía server; bỏ qua mọi `role` client gửi lên. Không mang mã mời/admin-promotion flow của Block 8 sang Bài 1.
- `EmailVerification` lưu `otpHash`, hạn dùng, số lần thử, thời điểm/lượt gửi và trạng thái đã dùng; `LoginAttempt` lưu khóa HMAC, bộ đếm và thời gian khóa; `PasswordResetToken` lưu HMAC token hash, hạn dùng và trạng thái đã dùng. Giới hạn gửi/thử theo mục 2.
- Không dùng Express `Session`/server-side session cookie. Dùng `RefreshToken` làm sổ phiên CSR: mỗi lần đăng nhập tạo `familyId`; mỗi record lưu `userId`, `familyId`, `tokenHash` unique, `createdAt`, `expiresAt`, `absoluteExpiresAt`, `usedAt`, `revokedAt`, `replacedById`. Chỉ lưu hash, không lưu refresh token rõ. Hạn mỗi token mới là `min(now + 7 ngày, absoluteExpiresAt)`; `absoluteExpiresAt` cố định bằng login time + 30 ngày.
- JWT chứa tối thiểu `sub`, `jti`, `sid` (refresh `familyId`), `iat`, `exp`, `iss`, `aud` và phiên bản mật khẩu (`pv`). Không dùng role trong JWT để cấp quyền. Middleware xác minh chữ ký/claims, đọc user từ DB và xác nhận user active, `passwordVersion` khớp, cùng `sid` có ít nhất một record refresh chưa dùng/chưa thu hồi và chưa hết hạn.
- Refresh token 32 bytes ngẫu nhiên, encode base64url; lưu `HMAC-SHA-256(AUTH_TOKEN_SECRET, token)`. Hạn nhàn rỗi 7 ngày; hạn tuyệt đối 30 ngày tính từ login, không thể kéo dài qua giới hạn tuyệt đối. Mỗi refresh dùng transaction để đánh dấu token cũ `usedAt`, tạo token mới cùng family và ghi `replacedById`.
- Refresh phải xác nhận user còn active và `passwordVersion` khớp; nếu không, thu hồi family, xóa cookie và trả 401. Nếu token đã dùng lại được trình bày lần nữa, thu hồi mọi record thuộc `familyId`, trả `401 REFRESH_TOKEN_REUSED`, xóa cookie và yêu cầu login mới. Frontend phải single-flight refresh để nhiều request đồng thời không vô tình kích hoạt phát hiện reuse.
- Khi logout, thu hồi family hiện tại để access JWT cùng `sid` bị từ chối ở request kế tiếp. Khi đổi/reset mật khẩu, tăng `passwordVersion` và thu hồi mọi family của user trong cùng transaction. Reset không tự đăng nhập.
- Không lưu OTP, reset token hoặc refresh token dạng rõ trong DB. Không đưa password, hash, OTP, token hay cookie vào log.

## 4. Hợp đồng endpoint

Tất cả endpoint dùng tiền tố `/api`. Payload phản hồi dùng envelope Block 6 (`ok`, `data` hoặc `error`); không tự tạo envelope thứ hai.

| Method và path | Quyền | Payload/yêu cầu và kết quả |
|---|---|---|
| `POST /api/auth/register` | Public | Nhận `name`, `email`, `password`, `confirmPassword`, `captchaToken`; bỏ qua `role`, không nhận mã mời. Xác minh CAPTCHA trước khi hash. Trả cùng thông báo chung dù email mới hay đã tồn tại. |
| `POST /api/auth/activate` | Public | Nhận `email`, `otp`; kích hoạt tài khoản. OTP sai, hết hạn, đã dùng hoặc vượt số lần đều trả `INVALID_OTP`, HTTP 200. Kích hoạt không tự đăng nhập. |
| `POST /api/auth/activate/resend` | Public | Nhận `email`; Bài 1 dùng phản hồi chung để không tiết lộ trạng thái email (khác phản hồi SSR hiện tại của Block 8); giữ cooldown 60 giây, giới hạn 5 email/tài khoản/giờ và giới hạn IP. Gửi lại không mở lại OTP đã hết lượt. |
| `POST /api/auth/login` | Public | Nhận `email`, `password`, `captchaToken` khi bộ đếm yêu cầu CAPTCHA. Kiểm tra `Origin`. Sai thông tin trả `INVALID_CREDENTIALS`, HTTP 200. Pending trả `ACCOUNT_NOT_ACTIVATED`, HTTP 200, không cấp token. Thành công trả access JWT + `csrfToken`, đặt refresh cookie HttpOnly. CAPTCHA thiếu/sai trả lỗi nghiệp vụ HTTP 200; khóa/rate limit trả `429 RATE_LIMITED`. |
| `GET /api/auth/csrf` | Refresh cookie | Khi có family refresh hợp lệ và user còn active với `passwordVersion` hiện tại, trả `csrfToken = HMAC-SHA-256(AUTH_TOKEN_SECRET, "csrf:" + familyId)` mã hóa base64url cho frontend sau reload; không cấp access token, không xoay refresh token. Origin phải thuộc allowlist và CORS credentials được bật cho origin đó. |
| `POST /api/auth/refresh` | Refresh cookie + `X-CSRF-Token` | Kiểm tra `Origin`/CSRF và trạng thái user (`active`, `passwordVersion` hiện tại), xoay refresh token theo transaction, đặt cookie mới và trả access JWT mới, `expiresIn`, `csrfToken`. Token thiếu/sai/hết hạn/đã thu hồi hoặc user không còn hợp lệ trả `401 INVALID_REFRESH_TOKEN`; phát hiện token đã dùng lại trả `401 REFRESH_TOKEN_REUSED` và thu hồi family. |
| `POST /api/auth/logout` | Refresh cookie + `X-CSRF-Token` | Kiểm tra `Origin`/CSRF, thu hồi family hiện tại và xóa refresh cookie. Idempotent nếu cookie đã hết hạn hoặc không còn hợp lệ; nếu cookie hợp lệ nhưng CSRF sai thì trả `403 CSRF_INVALID`. |
| `GET /api/auth/me` | Bearer JWT | Trả thông tin user từ DB; xác minh `sid` còn hoạt động. CSR gọi sau refresh để khôi phục user sau reload. |
| `POST /api/auth/forgot` | Public | Nhận `email`, `captchaToken`; thêm CAPTCHA theo luồng forgot của Block 8. Trả cùng `200 ok:true` cho email có/không có tài khoản, pending, cooldown hoặc lỗi gửi email. Quá giới hạn trả `429 RATE_LIMITED`. |
| `POST /api/auth/reset` | Public, có reset token | Nhận `token`, `password`, `confirmPassword`. Token thiếu/sai/hết hạn/đã dùng trả `INVALID_RESET_TOKEN`, HTTP 200. Thành công không tự đăng nhập. |

Đăng ký/kích hoạt/forgot thành công dùng HTTP 200 với envelope Block 6; các lỗi nghiệp vụ `INVALID_CREDENTIALS`, `ACCOUNT_NOT_ACTIVATED`, `INVALID_OTP`, `INVALID_RESET_TOKEN`, `CAPTCHA_REQUIRED` và `INVALID_CAPTCHA` dùng HTTP 200 theo đề. Access token sai/hết hạn hoặc refresh token không hợp lệ trả 401; CSRF sai trả 403; vượt quota hoặc đang khóa trả `429 RATE_LIMITED`. Giữ IP rate limit Block 8: register 30, activate 40, resend 20, login 120, forgot 10, reset 20 POST/IP/15 phút; thêm refresh 60 POST/IP/15 phút. Quota theo tài khoản/cooldown OTP và reset theo mục 2.

Đăng nhập/refresh thành công trả `data.accessToken`, `data.tokenType: "Bearer"`, `data.expiresIn: 600`, `data.csrfToken` và `data.user` (id, name, email, role lấy từ DB). Refresh token chỉ gửi trong `Set-Cookie`, không bao giờ nằm trong JSON. Cookie dùng `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`, không có `Domain`; `Max-Age` không vượt idle/absolute expiry ở DB. `GET /api/auth/csrf` cho phép CSR lấy CSRF token mới sau reload bằng refresh cookie. Logout và refresh là POST, yêu cầu `Origin` allowlist; refresh/logout còn yêu cầu `X-CSRF-Token`. API client chỉ refresh một lần cho một nhóm request 401 đồng thời và retry từng request gốc tối đa một lần. Khi cookie được dùng qua CORS, chỉ cấp credentials cho origin cụ thể; không wildcard. Reset mật khẩu tăng `passwordVersion`, thu hồi mọi refresh family và không tự đăng nhập.

### Bảo vệ API món ăn và tài nguyên

- `GET /api/dishes` và `GET /api/dishes/:id` vẫn public; working copy giữ tìm kiếm và phân trang theo yêu cầu đề, tích hợp từ Block 7.
- Mọi thao tác ghi với dishes yêu cầu Bearer JWT hợp lệ và user active.
- Tất cả endpoint chefs và ingredients yêu cầu Bearer JWT hợp lệ và user active.
- Bài 1 không lọc quyền theo `role`: role từ DB chỉ được trả/đọc theo yêu cầu, không quyết định CRUD.
- Thiếu/sai/hết hạn token, user không active hoặc `passwordVersion` không khớp phải bị từ chối bằng lỗi xác thực nhất quán; không chạy handler nghiệp vụ.

## 5. Phân công cho 3 thành viên

Tên thành viên được nhóm tự điền. Mỗi người chịu trách nhiệm các file trong cột sở hữu; nếu cần sửa file của người khác thì thống nhất trước và cập nhật contract.

| Thành viên | Phần phụ trách | File/phạm vi sở hữu | Bàn giao |
|---|---|---|---|
| **A — Dữ liệu và nghiệp vụ auth** | Schema/migration và nghiệp vụ đăng ký, OTP, resend, forgot/reset; bảng refresh-token family, rotation/reuse/revoke; validation/bcryptjs; email service và quota theo Block 8. | `block-09/BAI1/api/prisma/schema.prisma`, migration mới; `block-09/BAI1/api/src/services/auth/**`; `block-09/BAI1/api/src/validation/auth.ts`; helper auth đã thống nhất. Không mount Express route. | Migration bổ sung không phá schema hoặc history Block 7; service transaction xử lý consume/rotate/reuse đúng một lần; bàn giao DTO, mã lỗi, env và luồng cho B. |
| **B — API, JWT và tích hợp** | Endpoint auth, ký/xác minh JWT, middleware kiểm tra `sid`/`passwordVersion`, refresh/logout/CSRF, CORS credentials, bảo vệ resource routes; giữ API tìm kiếm/phân trang Block 7. | `block-09/BAI1/api/src/routes/auth.ts`; `src/middleware/require-auth.ts`; `src/lib/auth-jwt.ts`, `auth-errors.ts`; `src/app.ts`; route dishes/chefs/ingredients cần gắn bảo vệ; `package.json`, lockfile và `.env.example`. | API khớp endpoint/status/envelope mục 4; xoay/thu hồi token đúng; cookie/CORS/CSRF cấu hình chính xác; tìm kiếm/phân trang vẫn hoạt động. |
| **C — CSR và luồng giao diện** | Giữ tìm kiếm/phân trang Block 7; làm form đăng ký, OTP, đăng nhập, quên/reset; giữ access token/CSRF token trong memory; refresh sau reload; single-flight khi nhiều request cùng hết hạn. | `block-09/BAI1/web/src/pages/auth/**`; `src/lib/auth.ts`; `src/lib/api.ts`; `src/app/router.tsx`; `.env.example` và component tìm kiếm/phân trang liên quan. | CSR dùng credentials chỉ ở auth endpoints cần cookie; reload khôi phục access qua `/csrf` rồi `/refresh`; nhiều 401 cùng lúc chỉ sinh một refresh; logout gọi server; không lưu token trong Web Storage. |

### Thứ tự phối hợp

1. Tạo working copy Block 7 vào `block-09/BAI1/{api,web}`; đây là bản đã kế thừa Block 6 và chứa tìm kiếm/phân trang cần giữ. Giữ Block 6/7/8 gốc làm nguồn tham chiếu. Cả nhóm thống nhất mục 3–4 và điền tên A/B/C trước khi giao việc.
2. A và B thống nhất chữ ký service/DTO/error codes trước khi hai bên triển khai; C dùng endpoint/payload cố định ở mục 4.
3. Mỗi thành viên làm trên nhánh riêng xuất phát từ cùng working copy Block 7 đã tạo. Không chép lại Block 6 hoặc thay thế phần tìm kiếm/phân trang hiện có. Không để hai agent cùng sửa một file hoặc tự đổi contract.
4. B tích hợp API sau khi có migration/service từ A; C có thể dựng trang theo DTO đã chốt, rồi kết nối API khi B sẵn sàng.
5. Tích hợp theo luồng: đăng ký → email/OTP → login → gọi API → refresh/rotation → logout → forgot/reset → xác nhận mọi token/family cũ bị vô hiệu hóa.
6. Mọi quyết định mới (dependency, schema, endpoint, status, quyền, token TTL, origin, policy) phải được nhóm ghi vào tài liệu trước khi agent áp dụng.

## 6. Quy tắc giao việc cho coding agent

Gửi đoạn này cùng phần việc cụ thể cho từng agent:

> Hãy làm đúng phần được giao trong `block-09/BAI1_CONTRACT.md`, trong `block-09/BAI1/{api,web}`. Nền làm việc là snapshot Block 7, vốn kế thừa Block 6 và đã có tìm kiếm/phân trang; auth nghiệp vụ lấy từ router đang chạy ở Block 8 (`src/auth/**`). Thực hiện đúng access JWT 10 phút, refresh rotation/family, cookie, CORS và CSRF theo contract. Trước khi sửa, liệt kê file sẽ sửa và tiêu chí contract liên quan. Không tự đổi thư viện, schema, endpoint, HTTP status, error code, token policy, quyền, origin hoặc biến môi trường. Nếu thiếu DTO/chữ ký hàm hoặc cần sửa file ngoài phần sở hữu, hỏi nhóm; vẫn có thể làm phần độc lập. Không sửa source Block 6/7/8, không xóa migration, không ghi bí mật vào source/log. Khi bàn giao, nêu file đổi, quyết định áp dụng, migration/env cần thiết và phần chưa hoàn tất.

## 7. Tiêu chí nghiệm thu và bằng chứng

Nhóm ghi lại bằng chứng cho các luồng sau, che token, mật khẩu, OTP, reset token và secret trước khi chụp/chia sẻ:

- Đăng ký mới và email đã tồn tại cho cùng phản hồi; role client gửi lên không thay đổi role server gán.
- CAPTCHA được server xác minh trước khi xử lý hash; đăng ký thành công tạo tài khoản pending, role do server gán và OTP chỉ lưu HMAC hash.
- Kích hoạt thành công; OTP sai/hết hạn/đã dùng/vượt 5 lần đều nhận `INVALID_OTP`; gửi lại không đặt lại số lần thử; kích hoạt không cấp access token.
- Đăng nhập sai nhận `INVALID_CREDENTIALS`; CAPTCHA bắt đầu sau 3 lần sai; khóa 15 phút theo ngưỡng 5 lần/tài khoản hoặc 20 lần/IP; pending nhận `ACCOUNT_NOT_ACTIVATED` và không có access token.
- Login tạo access JWT trong response và refresh cookie `HttpOnly`; không có refresh token trong JSON, log, `sessionStorage` hay `localStorage`.
- CSR giữ access token/CSRF token trong memory; sau reload dùng `/api/auth/csrf` rồi `/api/auth/refresh` để lấy access JWT mới. Client refresh single-flight khi có nhiều 401 và retry mỗi request gốc tối đa một lần. `/me` và route protected từ chối JWT thiếu/sai/hết hạn, user không active, `passwordVersion` lệch hoặc `sid` đã revoke.
- Refresh thành công tiêu thụ token cũ đúng một lần, cấp token/cookie mới cùng family; dùng lại token cũ thu hồi toàn family và yêu cầu đăng nhập lại. Nhiều request đồng thời chỉ tạo một refresh request phía client.
- Logout thu hồi family hiện tại và access token có `sid` đó bị từ chối ngay; password reset tăng `passwordVersion`, thu hồi mọi family và làm token các thiết bị khác mất hiệu lực.
- Hai route GET dishes vẫn public và tìm kiếm/phân trang có sẵn trong snapshot Block 7 còn hoạt động; các route ghi dishes cùng mọi route chefs/ingredients cần auth.
- Forgot không tiết lộ email có tồn tại; giới hạn trả `429 RATE_LIMITED`; GET trang reset không tiêu thụ token; POST reset thành công đổi mật khẩu, không tự đăng nhập và làm JWT cũ mất hiệu lực qua `passwordVersion`.
- CORS chỉ nhận origin cụ thể; cookie auth dùng credentials, preflight cho `Authorization` và `X-CSRF-Token`; POST refresh/logout thiếu Origin/CSRF hợp lệ bị từ chối. Refresh cũng từ chối user inactive hoặc `passwordVersion` đã đổi. Bằng chứng kiểm tra cookie `HttpOnly`, `Secure`, `SameSite`, refresh rotation, Network/Storage và trạng thái DB; che token/cookie.
- Có sơ đồ luồng auth và danh sách module/nghiệp vụ đã chuyển từ Block 8. Thực hiện yêu cầu minh họa một lỗi do coding agent tạo và cách sửa trong nhánh/thử nghiệm cô lập; không để commit lỗi được đưa vào nhánh tích hợp.

## 8. Ngoài phạm vi Bài 1

- RBAC/ABAC, MFA/TOTP, SSR/EJS và Express session cookie của Block 8.
- Mã mời/admin-promotion flow của Block 8; role không cấp quyền trong Bài 1.
- Thay framework, viết lại snapshot Block 7, đổi giao diện/chức năng món ăn không liên quan đến yêu cầu.
- Thay đổi quyền chỉ dựa trên role gửi từ trình duyệt.

## Nguồn đối chiếu

- Đề bài: `docs/block9.pdf` (Bài 1 nêu API/web Block 6, giữ tìm kiếm/phân trang Block 7, auth từ Block 8).
- Snapshot API/CSR để làm tiếp: `block-07/api` và `block-07/web`, kế thừa nền Block 6 và đã chứa tìm kiếm/phân trang; Block 6 gốc được giữ làm tham chiếu.
- Auth Block 8 đã chốt trên main: commit `e2a8a723`; ưu tiên `block-08/README.md`, `block-08/src/app.ts`, `block-08/src/auth/**` và `block-08/prisma/schema.prisma`. Không lấy module cũ chưa mount làm chuẩn.
- Tài liệu thư viện JWT: [panva/jose](https://github.com/panva/jose).
- Refresh rotation/reuse detection: [RFC 9700 §4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14); tránh lưu credential trong Web Storage: [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html); cookie/CORS: [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).
