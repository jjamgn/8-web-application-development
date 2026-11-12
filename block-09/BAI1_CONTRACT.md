# Block 9 — Bài 1 (CSR): contract nhóm và phân công

> **Trạng thái:** Bản baseline đã chốt để cả nhóm và coding agent cùng làm theo. Nhóm có thể ghi nhận đồng thuận trong buổi họp; mọi thay đổi sau đó phải được cả nhóm thống nhất và cập nhật tại đây trước khi triển khai.
>
> **Phạm vi:** Bài 1 Block 9, CSR. Đây là tài liệu quyết định kỹ thuật và phân công; yêu cầu trong đề bài Block 9 vẫn là chuẩn cuối cùng.

## 1. Mục tiêu và nền code

- Tạo working copy cho Bài 1 tại `block-09/BAI1/api` và `block-09/BAI1/web`, lấy thẳng API và web hiện tại của **Block 7** làm snapshot bắt đầu. Block 7 kế thừa nền Block 6 và đã có tìm kiếm/phân trang cần giữ, nên không cần chép Block 6 rồi ghép lại các thay đổi đó lần nữa.
- Cách lấy Block 7 làm snapshot vẫn đáp ứng yêu cầu đề dùng API/web Block 6 và giữ tìm kiếm/phân trang Block 7: Block 6 là nền kế thừa, còn Block 7 là bản đã tích hợp các chức năng cần tiếp tục.
- Giữ nguyên source Block 6/7/8 để làm bản tham chiếu; mọi thay đổi Bài 1 thực hiện trong working copy `block-09/BAI1`.
- Chuyển phần nghiệp vụ phù hợp từ **Block 8**: bcryptjs và chính sách mật khẩu, OTP email, chống brute force, CAPTCHA, gửi email và reset password. Chuyển sang API JSON theo hợp đồng Bài 1; không bê nguyên routes EJS, session cookie hay cơ chế cấp quyền admin của SSR.
- Nguồn auth đang chạy của Block 8 là `block-08/src/auth/**` được mount qua `block-08/src/app.ts`. Các module đăng ký cũ còn giữ trong `block-08/src/routes/registration.ts` và `block-08/src/services/**` không phải router đang chạy; coding agent không dùng chúng làm chuẩn.
- Bài 1 không yêu cầu mã mời dành cho nhân viên của Block 8. Không yêu cầu `ADMIN_REGISTRATION_CODE`; tài khoản CSR mới vẫn pending cho tới khi xác minh email và role gửi từ client bị bỏ qua.
- Không sửa trực tiếp source Block 6, Block 7 hoặc Block 8; không dựng lại framework/app từ đầu và không xóa migration/schema của bản working copy.
- Bài 1 không triển khai RBAC/ABAC hay MFA/TOTP. Các tài khoản đã kích hoạt có cùng quyền CRUD theo yêu cầu của Bài 1.

## 2. Quyết định công nghệ và bảo mật

| Hạng mục | Quyết định chung |
|---|---|
| API | Giữ Express 5, TypeScript, Prisma 6 và PostgreSQL từ source Block 7, kế thừa nền Block 6. |
| CSR | Giữ React, Vite và React Router từ source Block 7, kế thừa nền Block 6. |
| JWT | Dùng thư viện `jose` ở API; ký HS256, access token sống 30 phút, không làm refresh token. |
| Bí mật JWT | Dùng `JWT_SECRET` riêng, tối thiểu 32 bytes ngẫu nhiên; không dùng `SESSION_SECRET`, không commit giá trị bí mật. |
| Lưu token ở trình duyệt | Lưu access token trong `sessionStorage`; gửi bằng `Authorization: Bearer <token>`. Ghi nhận rủi ro XSS trong báo cáo. Logout phía CSR xóa token và state người dùng; token ở bản sao khác còn hiệu lực tới hết hạn nếu chưa bị từ chối theo `passwordVersion`. |
| Mật khẩu | Auth đang chạy ở Block 8 dùng bcryptjs cost 12. Dùng cùng giới hạn tối thiểu 8 ký tự, tối đa 72 byte UTF-8; xác nhận mật khẩu phải khớp. Không tự đổi sang Argon2id hoặc thêm quy tắc độ phức tạp khác. |
| Xác minh email | OTP 6 chữ số, hết hạn sau 10 phút; lưu HMAC-SHA-256 có khóa và phân tách mục đích/user, không lưu OTP rõ. Tối đa 5 lần nhập sai; OTP bị tiêu thụ sau lần sai thứ 5 và gửi lại không đặt lại số lần thử. Chờ ít nhất 60 giây giữa lần gửi, tối đa 5 email/tài khoản/giờ. Dùng `AUTH_TOKEN_SECRET`. |
| Quên mật khẩu | Token ngẫu nhiên 32 bytes, mã hóa thành 64 ký tự hex; lưu HMAC-SHA-256 có khóa, hết hạn sau 30 phút, chỉ tiêu thụ khi POST reset thành công. Chờ ít nhất 60 giây giữa lần gửi, tối đa 5 email/tài khoản/giờ. GET form reset không tiêu thụ token. Giới hạn theo IP: forgot 10 POST/15 phút, reset 20 POST/15 phút. |
| Đăng nhập | Dùng chính sách Block 8: cửa sổ 15 phút; yêu cầu CAPTCHA sau 3 lần sai; khóa 15 phút từ 5 lần sai theo tài khoản hoặc 20 lần theo IP; giới hạn phụ 120 POST/IP/15 phút. Lưu bộ đếm trong DB, khóa HMAC cho email/IP dùng `AUTH_TOKEN_SECRET`. |
| CAPTCHA và email | Auth đang chạy ở Block 8 dùng CAPTCHA SVG 6 ký tự, gắn với session, hết hạn sau 5 phút và dùng một lần. Bài 1 giữ Turnstile như lựa chọn thích ứng cho SPA/API không dùng cookie session; đây là thay đổi giao thức của CSR, không phải công nghệ của router Block 8. Server xác minh CAPTCHA trước khi hash mật khẩu đăng ký; dùng Nodemailer/SMTP theo cấu hình Block 8. |
| CORS | Chỉ cho phép origin cấu hình rõ ràng; môi trường dev mặc định `http://localhost:5173` và `http://127.0.0.1:5173`. Cho phép header `Content-Type` và `Authorization`, xử lý preflight OPTIONS. Không bật cookie credentials vì Bài 1 dùng Bearer token. |
| Lỗi API | Giữ envelope và quy ước lỗi Block 6/7; không để `ApiError` phía web làm mất HTTP status. Các mã/status ngoại lệ bắt buộc ở mục 4 phải được giữ nguyên. |

`jose` được chọn vì hỗ trợ ký JWT và xác minh chữ ký/claims trong môi trường Node.js; chốt major version 6 và khóa phiên bản thực tế trong lockfile khi tích hợp. Tham khảo [repository chính thức của jose](https://github.com/panva/jose).

### Biến môi trường

- **API, chỉ ở máy chạy API/secret manager:** `DATABASE_URL`, `JWT_SECRET`, `JWT_ISSUER=bep-nha-api`, `JWT_AUDIENCE=bep-nha-web`, `AUTH_TOKEN_SECRET`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAMES`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `WEB_ORIGIN`, `SPA_ORIGINS`.
- **Web, biến public có tiền tố Vite:** `VITE_API_BASE_URL`, `VITE_TURNSTILE_SITE_KEY`.
- `AUTH_TOKEN_SECRET` là khóa riêng, tối thiểu 32 ký tự ngẫu nhiên, cho HMAC OTP/reset/login-attempt; Block 8 có fallback sang `SESSION_SECRET` vì SSR cần session, còn CSR không dùng fallback session. `WEB_ORIGIN` là origin của SPA để gửi link reset (tương đương vai trò `APP_URL` trong Block 8).
- Chỉ commit `.env.example` với tên biến và giá trị minh họa không dùng được; không commit `.env`, key, mật khẩu SMTP hoặc token thật.
- Link trong email reset được tạo từ `WEB_ORIGIN`, trỏ tới `/reset?token=...`.

## 3. Quy ước dữ liệu và JWT

- Giữ schema, dữ liệu nghiệp vụ, migration history và tìm kiếm/phân trang của source Block 7 trong working copy; đây là bản kế thừa Block 6 đã có các chức năng Block 7 cần giữ. Chỉ bổ sung model auth tương thích với luồng đang chạy ở Block 8.
- `User` có `name`, email duy nhất, `passwordHash`, `emailVerifiedAt`, trạng thái `pending`/`active`, `role` mặc định `viewer` và `passwordVersion` (số nguyên, mặc định 0). Đăng ký luôn gán role phía server; bỏ qua mọi `role` client gửi lên. Không mang mã mời/admin-promotion flow của Block 8 sang Bài 1.
- `EmailVerification` lưu `otpHash`, hạn dùng, số lần thử, thời điểm/lượt gửi và trạng thái đã dùng; `LoginAttempt` lưu khóa HMAC, bộ đếm và thời gian khóa; `PasswordResetToken` lưu HMAC token hash, hạn dùng và trạng thái đã dùng. Giới hạn gửi/thử phải theo mục 2.
- Không thêm model `Session` cho luồng CSR này. JWT không thay thế dữ liệu người dùng trong DB: middleware phải xác minh token rồi đọc user từ DB, kiểm tra user còn `active` và `passwordVersion` còn khớp.
- JWT chứa tối thiểu `sub`, `jti`, `iat`, `exp`, `iss`, `aud` và phiên bản mật khẩu (`pv`). Không dùng role trong JWT để cấp quyền. Có thể trả role từ DB cho giao diện hiển thị; role không ảnh hưởng quyền ở Bài 1.
- Khi đổi mật khẩu thành công, tăng `passwordVersion` trong cùng thao tác cập nhật mật khẩu. JWT cũ bị từ chối ở request kế tiếp; không tự đăng nhập sau reset.
- Không lưu OTP hoặc reset token dạng rõ trong DB. Không đưa password, hash, OTP hoặc reset token vào log.

## 4. Hợp đồng endpoint

Tất cả endpoint dùng tiền tố `/api`. Payload phản hồi dùng envelope Block 6 (`ok`, `data` hoặc `error`); không tự tạo envelope thứ hai.

| Method và path | Quyền | Payload/yêu cầu và kết quả |
|---|---|---|
| `POST /api/auth/register` | Public | Nhận `name`, `email`, `password`, `confirmPassword`, `captchaToken`; bỏ qua `role`, không nhận mã mời. Xác minh CAPTCHA trước khi hash. Trả cùng thông báo chung dù email mới hay đã tồn tại. |
| `POST /api/auth/activate` | Public | Nhận `email`, `otp`; kích hoạt tài khoản. OTP sai, hết hạn, đã dùng hoặc vượt số lần đều trả `INVALID_OTP`, HTTP 200. Kích hoạt không tự đăng nhập. |
| `POST /api/auth/activate/resend` | Public | Nhận `email`; Bài 1 dùng phản hồi chung để không tiết lộ trạng thái email (khác phản hồi SSR hiện tại của Block 8); giữ cooldown 60 giây, giới hạn 5 email/tài khoản/giờ và giới hạn IP. Gửi lại không mở lại OTP đã hết lượt. |
| `POST /api/auth/login` | Public | Nhận `email`, `password`, và `captchaToken` khi bộ đếm yêu cầu CAPTCHA. Sai thông tin trả `INVALID_CREDENTIALS`, HTTP 200. Pending trả `ACCOUNT_NOT_ACTIVATED`, HTTP 200, không có token. CAPTCHA thiếu/sai trả mã lỗi nghiệp vụ HTTP 200; khóa hoặc vượt rate limit trả `429 RATE_LIMITED`. |
| `GET /api/auth/me` | Bearer JWT | Trả thông tin user đang đăng nhập, lấy từ DB; dùng để khôi phục trạng thái CSR khi tải lại trang. |
| `POST /api/auth/forgot` | Public | Nhận `email`, `captchaToken`; thêm CAPTCHA theo luồng forgot của Block 8. Trả cùng `200 ok:true` cho email có/không có tài khoản, pending, cooldown hoặc lỗi gửi email. Quá giới hạn trả `429 RATE_LIMITED`. |
| `POST /api/auth/reset` | Public, có reset token | Nhận `token`, `password`, `confirmPassword`. Token thiếu/sai/hết hạn/đã dùng trả `INVALID_RESET_TOKEN`, HTTP 200. Thành công không tự đăng nhập. |

Đăng ký/kích hoạt/forgot thành công dùng HTTP 200 với envelope Block 6; các lỗi nghiệp vụ `INVALID_CREDENTIALS`, `ACCOUNT_NOT_ACTIVATED`, `INVALID_OTP`, `INVALID_RESET_TOKEN`, `CAPTCHA_REQUIRED` và `INVALID_CAPTCHA` dùng HTTP 200 theo đề. Vượt quota hoặc đang khóa trả HTTP 429 `RATE_LIMITED`. Giữ IP rate limit Block 8: register 30, activate 40, resend 20, login 120, forgot 10, reset 20 POST mỗi IP/cửa sổ 15 phút; quota theo tài khoản/cooldown OTP và reset được nêu ở mục 2.

Đăng nhập thành công trả `data.accessToken`, `data.tokenType: "Bearer"`, `data.expiresIn: 1800` và `data.user` (id, name, email, role lấy từ DB). Không tạo endpoint logout server hoặc refresh trong Bài 1: CSR xóa token khi logout; reset mật khẩu tăng `passwordVersion` trong DB để JWT cũ bị từ chối ở request kế tiếp. Không tự đăng nhập sau reset.

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
| **A — Dữ liệu và nghiệp vụ auth** | Schema/migration và nghiệp vụ đăng ký, OTP, resend, forgot/reset; validation/bcryptjs; email service và quota theo Block 8. | `block-09/BAI1/api/prisma/schema.prisma`, migration mới; `block-09/BAI1/api/src/services/auth/**`; `block-09/BAI1/api/src/validation/auth.ts`; helper auth đã thống nhất. Không mount Express route. | Migration bổ sung không phá schema hoặc migration history Block 7; danh sách hàm service, DTO, mã lỗi, biến môi trường và luồng nghiệp vụ để B tích hợp. |
| **B — API, JWT và tích hợp** | Endpoint auth, ký/xác minh JWT, middleware, CORS, bảo vệ resource routes; giữ API tìm kiếm/phân trang hiện có của Block 7; thêm dependency cần thiết và điều phối tích hợp API. | `block-09/BAI1/api/src/routes/auth.ts`; `src/middleware/require-auth.ts`; `src/lib/auth-jwt.ts`, `auth-errors.ts`; `src/app.ts`; route dishes/chefs/ingredients cần gắn bảo vệ; `package.json`, lockfile và `.env.example`. | API khớp endpoint/status/envelope mục 4; route public/private đúng; tìm kiếm/phân trang và CORS/env được giữ đúng. |
| **C — CSR và luồng giao diện** | Giữ tìm kiếm/phân trang giao diện hiện có của Block 7; làm form đăng ký, OTP, đăng nhập, quên/reset mật khẩu; lưu/gửi token; trạng thái user và lỗi API. | `block-09/BAI1/web/src/pages/auth/**`; `src/lib/auth.ts`; `src/lib/api.ts`; `src/app/router.tsx`; `.env.example` và các component tìm kiếm/phân trang liên quan. | CSR gọi đúng API; reload khôi phục bằng `/api/auth/me`; logout xóa token; luồng món ăn Block 7 vẫn hoạt động; bằng chứng UI/Network/Storage không lộ bí mật. |

### Thứ tự phối hợp

1. Tạo working copy Block 7 vào `block-09/BAI1/{api,web}`; đây là bản đã kế thừa Block 6 và chứa tìm kiếm/phân trang cần giữ. Giữ Block 6/7/8 gốc làm nguồn tham chiếu. Cả nhóm thống nhất mục 3–4 và điền tên A/B/C trước khi giao việc.
2. A và B thống nhất chữ ký service/DTO/error codes trước khi hai bên triển khai; C dùng endpoint/payload cố định ở mục 4.
3. Mỗi thành viên làm trên nhánh riêng xuất phát từ cùng working copy Block 7 đã tạo. Không chép lại Block 6 hoặc thay thế phần tìm kiếm/phân trang hiện có. Không để hai agent cùng sửa một file hoặc tự đổi contract.
4. B tích hợp API sau khi có migration/service từ A; C có thể dựng trang theo DTO đã chốt, rồi kết nối API khi B sẵn sàng.
5. Tích hợp theo luồng: đăng ký → email/OTP → đăng nhập → gọi API cần auth → quên/reset mật khẩu → xác nhận token cũ bị vô hiệu hóa.
6. Mọi quyết định mới (dependency, schema, endpoint, status, quyền, token TTL, origin, policy) phải được nhóm ghi vào tài liệu trước khi agent áp dụng.

## 6. Quy tắc giao việc cho coding agent

Gửi đoạn này cùng phần việc cụ thể cho từng agent:

> Hãy làm đúng phần được giao trong `block-09/BAI1_CONTRACT.md`, trong `block-09/BAI1/{api,web}`. Nền làm việc là snapshot Block 7, vốn kế thừa Block 6 và đã có tìm kiếm/phân trang; auth nghiệp vụ lấy từ router đang chạy ở Block 8 (`src/auth/**`). Trước khi sửa, liệt kê file sẽ sửa và tiêu chí contract liên quan. Không tự đổi thư viện, schema, endpoint, HTTP status, error code, token policy, quyền, origin hoặc biến môi trường. Nếu thiếu DTO/chữ ký hàm hoặc cần sửa file ngoài phần sở hữu, hỏi nhóm; vẫn có thể làm phần độc lập. Không sửa source Block 6/7/8, không xóa migration, không ghi bí mật vào source/log. Khi bàn giao, nêu file đổi, quyết định áp dụng, migration/env cần thiết và phần chưa hoàn tất.

## 7. Tiêu chí nghiệm thu và bằng chứng

Nhóm ghi lại bằng chứng cho các luồng sau, che token, mật khẩu, OTP, reset token và secret trước khi chụp/chia sẻ:

- Đăng ký mới và email đã tồn tại cho cùng phản hồi; role client gửi lên không thay đổi role server gán.
- CAPTCHA được server xác minh trước khi xử lý hash; đăng ký thành công tạo tài khoản pending, role do server gán và OTP chỉ lưu HMAC hash.
- Kích hoạt thành công; OTP sai/hết hạn/đã dùng/vượt 5 lần đều nhận `INVALID_OTP`; gửi lại không đặt lại số lần thử; kích hoạt không cấp access token.
- Đăng nhập sai nhận `INVALID_CREDENTIALS`; CAPTCHA bắt đầu sau 3 lần sai; khóa 15 phút theo ngưỡng 5 lần/tài khoản hoặc 20 lần/IP; pending nhận `ACCOUNT_NOT_ACTIVATED` và không có access token.
- User active dùng Bearer JWT gọi được `/api/auth/me` và route protected; thiếu token, token sai/hết hạn, user không active đều bị từ chối.
- Hai route GET dishes vẫn public và tìm kiếm/phân trang có sẵn trong snapshot Block 7 còn hoạt động; các route ghi dishes cùng mọi route chefs/ingredients cần auth.
- Forgot không tiết lộ email có tồn tại; giới hạn trả `429 RATE_LIMITED`; GET trang reset không tiêu thụ token; POST reset thành công đổi mật khẩu, không tự đăng nhập và làm JWT cũ mất hiệu lực qua `passwordVersion`.
- CORS chỉ nhận origin cấu hình, preflight có `Authorization`; UI, Network, Storage, direct request và trạng thái DB được ghi nhận tương ứng.
- Có sơ đồ luồng auth và danh sách module/nghiệp vụ đã chuyển từ Block 8. Thực hiện yêu cầu minh họa một lỗi do coding agent tạo và cách sửa trong nhánh/thử nghiệm cô lập; không để commit lỗi được đưa vào nhánh tích hợp.

## 8. Ngoài phạm vi Bài 1

- RBAC/ABAC, MFA/TOTP, refresh token, SSR/EJS/session cookie.
- Mã mời/admin-promotion flow của Block 8; role không cấp quyền trong Bài 1.
- Thay framework, viết lại snapshot Block 7, đổi giao diện/chức năng món ăn không liên quan đến yêu cầu.
- Thay đổi quyền chỉ dựa trên role gửi từ trình duyệt.

## Nguồn đối chiếu

- Đề bài: `docs/block9.pdf` (Bài 1 nêu API/web Block 6, giữ tìm kiếm/phân trang Block 7, auth từ Block 8).
- Snapshot API/CSR để làm tiếp: `block-07/api` và `block-07/web`, kế thừa nền Block 6 và đã chứa tìm kiếm/phân trang; Block 6 gốc được giữ làm tham chiếu.
- Auth Block 8 đã chốt trên main: commit `e2a8a723`; ưu tiên `block-08/README.md`, `block-08/src/app.ts`, `block-08/src/auth/**` và `block-08/prisma/schema.prisma`. Không lấy module cũ chưa mount làm chuẩn.
- Tài liệu thư viện JWT: [panva/jose](https://github.com/panva/jose).
