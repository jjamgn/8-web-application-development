# Block 08 - Xác thực tài khoản trên SSR

> **Trạng thái:** Bản đề xuất để 3 thành viên thống nhất. Các mục `[ ]` chỉ được xem là đã chốt sau khi cả nhóm đồng ý.

## 1. Mục tiêu và nền tảng

- Phát triển tiếp ứng dụng nhà hàng từ `block-05` trong thư mục `block-08`; giữ `block-05` làm phiên bản bài cũ để có thể đối chiếu.
- Tái sử dụng Express, EJS, TypeScript, Prisma/PostgreSQL và các màn hình CRUD hiện có.
- Bổ sung đăng ký, CAPTCHA, xác minh email bằng OTP, đăng nhập, session lưu bền vững, chống brute force, đăng xuất, quên mật khẩu và reset token.
- Không tính `DEMO_MODE` hoặc việc ẩn nút trên giao diện là cơ chế xác thực. Server phải kiểm tra mọi request được bảo vệ.

## 2. Phân công dự kiến

| Thành viên | Phần việc chính | Công việc cụ thể | Điều kiện hoàn thành |
|---|---|---|---|
| **Người 1: Thuyết — Đăng ký và xác minh email** | Yêu cầu 01 | Làm form/route đăng ký; chuẩn hóa và kiểm tra email trùng; băm mật khẩu; CAPTCHA đăng ký; tạo tài khoản chưa xác minh; gửi OTP qua tiện ích email dùng chung; xác minh email và gửi lại OTP có giới hạn. Thiết kế bảng User và EmailVerification, đồng thời đẩy schema chung lên. | Đăng ký hợp lệ gửi email OTP; email trùng không tạo bản ghi thứ hai; OTP sai/hết hạn/dùng rồi bị từ chối; OTP chỉ dùng một lần; tài khoản chưa xác minh không đăng nhập được; đăng ký không tự cấp quyền quản trị. |
| **Người 2: Vy — Đăng nhập, session và bảo vệ CRUD** | Yêu cầu 02 và 04 | Chuyển đăng nhập từ tài khoản cấu hình trong `.env` sang bảng user; kiểm tra trạng thái active; chống brute force; lưu session bền vững trong PostgreSQL; cấu hình cookie; logout; middleware bảo vệ `/admin` và các thao tác CRUD. | Đăng nhập hợp lệ dùng được các quyền đã thống nhất; đăng nhập sai đủ ngưỡng bị giới hạn; session còn hiệu lực sau khi restart server; logout hủy session ở server; gọi trực tiếp URL CRUD khi chưa đăng nhập vẫn bị chặn. |
| **Người 3: Trang — Quên mật khẩu và kiểm thử tích hợp** | Yêu cầu 03 và tích hợp | Làm form quên mật khẩu, gửi link reset qua tiện ích email của Thuyết; form đặt mật khẩu mới; token có hạn và dùng một lần; vô hiệu session cũ sau reset; nối các router/trang và chuẩn bị kịch bản demo toàn hệ thống. | Link hợp lệ đổi được mật khẩu; token sai/hết hạn/đã dùng bị từ chối; session cũ không dùng được sau reset; phản hồi quên mật khẩu không tiết lộ email có tài khoản hay không. |

### Quy ước để tránh conflict

- Mỗi thành viên làm router/service và view riêng theo luồng; không cùng sửa một file route lớn.
- **Thuyết (Người 1)** đẩy schema chung lên; Vy gửi yêu cầu model Session/LoginAttempt và Trang gửi yêu cầu model PasswordReset trước khi Thuyết tạo migration.
- Thuyết phụ trách tiện ích email dùng chung; Trang gọi tiện ích này cho luồng reset.
- **Trang (Người 3)** là đầu mối tích hợp; chỉ Trang mount các router vào `src/app.ts`. Thành viên khác gửi PR theo module của mình.
- Dùng branch riêng và review trước khi merge theo workflow của repository. Khi đổi hợp đồng route hoặc schema, cập nhật README này trước khi code phụ thuộc vào thay đổi đó.

## 3. Các quyết định chung

| Chủ đề | Đề xuất để nhóm chốt | Xác nhận |
|---|---|---|
| **Nguồn yêu cầu** | PDF Block 08 là tiêu chí nghiệm thu; các quyết định vận hành trong bảng này theo thống nhất của nhóm. | [x] |
| **Đường dẫn route** | Dùng `GET/POST /auth/register`, `GET/POST /auth/verify-email`, `POST /auth/verify-email/resend`, `GET/POST /auth/login`, `POST /auth/logout`, `POST /auth/forgot-password`, `GET/POST /auth/reset-password`. Form đăng ký nhận email/password/confirmPassword. Luồng OTP dùng pendingRegistrationUserId trong session, chưa cấp session đăng nhập. | [x] |
| **Email và đăng nhập** | Chuẩn hóa email theo chính sách trim/lowercase và đặt unique. `emailVerifiedAt = null` nghĩa là chưa xác minh; chỉ cho đăng nhập khi đã xác minh. Đăng ký không tự cấp quyền quản trị. Để khớp PDF, role do server gán mặc định `viewer`; không nhận role từ form. Xác minh email không tự đăng nhập. | [x] |
| **Bảng User và EmailVerification** | User có id/email/passwordHash/emailVerifiedAt/createdAt, role String mặc định viewer, status enum pending/active mặc định pending. Chưa xác minh thì status=pending và emailVerifiedAt=null; active thì emailVerifiedAt có giá trị. EmailVerification có userId/otpHash/expiresAt/attempts/lastSentAt, usedAt nullable và lockedUntil nullable. Xác minh thành công đánh dấu usedAt, giữ bản ghi. | [x] |
| **OTP và reset token** | Chỉ lưu hash; có hạn dùng và dấu đã sử dụng. OTP gắn với tài khoản; reset token gắn với user. Không trả token trong response và không ghi vào log. Thời hạn, số lần thử và cooldown gửi lại cần chốt riêng bên dưới. | [x] |
| **Tiện ích email** | Dùng Nodemailer qua Gmail SMTP cho một tiện ích gửi email chung cho OTP xác minh và link đặt lại mật khẩu. Thuyết phụ trách; Trang gọi cùng tiện ích đó cho luồng reset. Gmail dùng App Password theo lựa chọn đã xác nhận. | [x] |
| **Session** | Session lưu phía server trong database và có liên kết `userId`; cookie chỉ mang mã session. Vy chỉ cho đăng nhập nếu email đã xác minh. Chốt chi tiết store/cookie theo cấu hình Block 08 khi triển khai. | [x] |
| **CSRF** | Giữ cơ chế CSRF đang có trong Block 05 và áp dụng cho các form mới có thay đổi dữ liệu. | [x] |
| **Quyền CRUD** | Việc tài khoản đã xác minh được phép xem/tạo/sửa/xóa đến đâu chưa được ảnh chốt; nhóm thống nhất riêng. Việc đăng ký không tự cấp quyền admin. | [ ] |
| **Phạm vi route cần đăng nhập** | Chốt `/admin/*` và các route CRUD nào bắt buộc đăng nhập; xác định riêng trang thực đơn công khai `/dishes`, `/dish/:id` có giữ công khai hay không. Tài khoản chưa xác minh luôn bị chặn khỏi vùng cần đăng nhập. | [ ] |
| **CAPTCHA và brute force** | Đã chọn Cloudflare Turnstile cho đăng ký. Thời điểm yêu cầu CAPTCHA ở luồng đăng nhập, cửa sổ đếm sai, ngưỡng khóa, thời gian chờ và giới hạn theo IP còn cần chốt. Giữ bộ đếm phía server; giải đúng CAPTCHA không xóa bộ đếm và CAPTCHA đúng không vượt qua thời gian khóa. | [ ] |
| **Thời hạn và giới hạn OTP** | OTP 6 số, hạn 5 phút, tối đa 5 lần sai, gửi lại cách 60 giây và giữ attempts. Đủ 5 lần sai khóa 15 phút bằng lockedUntil; hết khóa, yêu cầu mã mới mở chu kỳ mới và reset attempts. Giới hạn 5 form đăng ký/15 phút/IP, 10 yêu cầu gửi lại/giờ/IP; bộ đếm IP trong tiến trình, cooldown/attempts/khóa tài khoản trong DB. SMTP lỗi giữ pending và vẫn áp dụng cooldown. | [x] |
| **Reset token** | Chốt thời hạn token và giới hạn số yêu cầu forgot. GET chỉ hiện form; POST mới dùng token. Reset thành công không tự đăng nhập và phải làm session cũ mất hiệu lực. | [ ] |
| **Email môi trường phát triển** | Chọn Gmail SMTP bằng App Password: `smtp.gmail.com:465`, `SMTP_SECURE=true`, `MAIL_FROM` dùng chính Gmail gửi. Người dùng tự điền tài khoản/App Password vào `.env`; địa chỉ nhận thư kiểm thử sẽ được cung cấp trước khi gửi thật. | [x] |
| **Cookie/session policy** | Chốt thời hạn session, `HttpOnly`, `SameSite`, `Secure` khi production; đổi session ID lúc login; logout hủy session ở server rồi xóa cookie. Session phải còn hợp lệ sau khi server restart. | [ ] |
| **Password hashing/admin bootstrap** | Đã chốt bcryptjs cho đăng ký, mật khẩu ít nhất 8 ký tự và không quá 72 byte UTF-8; OTP dùng HMAC-SHA256 với OTP_SECRET riêng trong .env. Admin bootstrap cần nhóm chốt riêng; không commit mật khẩu/secrets. | [ ] |

## 4. Điều kiện nghiệm thu chung

- Tài khoản `pending` không nhận session; OTP hợp lệ kích hoạt đúng tài khoản nhưng không tự đăng nhập.
- Sai, hết hạn hoặc dùng lại OTP/reset token đều bị từ chối; OTP và reset token không xuất hiện dạng đọc được trong database, response hoặc log.
- Email không tồn tại và email đã đăng ký nhận phản hồi quên mật khẩu giống nhau; đăng ký email trùng không tiết lộ trạng thái tài khoản.
- CAPTCHA thiếu/sai khi được yêu cầu bị chặn ở server; đạt ngưỡng khóa thì CAPTCHA đúng cũng không cho đăng nhập.
- Session tồn tại sau khi restart server; logout/reset làm session cũ mất hiệu lực.
- Gọi trực tiếp route CRUD bằng request HTTP khi chưa đăng nhập vẫn bị chặn; không có GET nào làm thay đổi hoặc tiêu thụ dữ liệu.
- Nhóm chuẩn bị ảnh giao diện, Network, cookie trong Application, request trực tiếp, bản ghi database đã che dữ liệu nhạy cảm và sơ đồ các luồng theo yêu cầu nộp.

## 5. Ghi nhận thống nhất

| Thành viên | Đã xem và đồng ý | Ghi chú |
|---|---|---|
| Thuyết — Người 1 | [ ] | |
| Vy — Người 2 | [ ] | |
| Trang — Người 3 | [ ] | |

## 6. Cập nhật triển khai yêu cầu 1

Các quyết định dưới đây được người phụ trách yêu cầu 1 xác nhận trong chat ngày 06/11/2026; không thay cho xác nhận của Vy hoặc Trang ở mục 5.

- Dùng các mục `[x]` trong README làm chuẩn khi đồng bộ `skill.md` và schema. Các mục `[ ]` vẫn là đề xuất cần nhóm chốt.
- Dùng lại Supabase/database của Block 05. Người dùng đã điền hai URL trong `.env`; kiểm tra kết nối và metadata ở chế độ chỉ đọc thành công, sau đó đã cho phép áp dụng đúng hai migration xác thực mới.
- Giữ nguyên migration `202611060001_add_registration_models`; tạo migration bổ sung `202611060002_align_registration_contract` cho `role`, `status`, `usedAt`.
- `role` tạm dùng String vì chưa chốt đầy đủ danh sách role; server gán `viewer` khi đăng ký. `status` dùng enum vì đã chốt hai giá trị `pending/active`.
- Sau xác minh, cập nhật `status=active`, `emailVerifiedAt` và `usedAt` trong cùng transaction; không tự đăng nhập. Một user vẫn có tối đa một bản ghi xác minh, không phải bảng lịch sử mọi OTP.
- Đã chọn Gmail App Password, Turnstile, chính sách OTP/khóa, bcryptjs và HMAC-SHA256. Đã chốt route GET/form/session đăng ký tạm và giới hạn IP như mục 3. Không tự quyết định quyền CRUD, admin bootstrap hoặc chính sách login/reset của các thành viên khác.
- Đã có router, service và hai view đăng ký/xác minh trong source. Chưa mount vào app chính hoặc nghiệm thu toàn hệ thống thật; xem mục 11 để bàn giao cho Trang.
- Đã xác nhận dùng Nodemailer qua Gmail SMTP; đã cài thư viện và type TypeScript, cập nhật lockfile. Đã đặt host/port/secure cho Gmail trong cấu hình mẫu và điền các giá trị đó vào những mục còn trống của `.env`, giữ nguyên credential người dùng. Người dùng đã điền tài khoản/App Password; kết nối TLS và xác thực Gmail SMTP thành công bằng `verify()`.
- Đã tạo `.env` khung từ `.env.example`; `.gitignore` đã loại `.env`. Người dùng đã tự điền thông tin kết nối của Supabase Block 05. Việc chạy server với database thật vẫn cần đủ cấu hình quản trị hiện có.
- Hợp đồng hàm đã xác nhận: `sendMail({ to, subject, text, html? }): Promise<void>`, báo lỗi nếu cấu hình không hợp lệ hoặc gửi thất bại; không tự retry hay tạo OTP.
- Đã viết `src/services/mailer.ts` và 7 test email giả lập. Build và toàn bộ 21/21 test đạt tại mốc hoàn thành mailer. Sau khi người dùng đồng ý, đã gọi module để gửi đúng một email kiểm thử đến chính `SMTP_USER`, tiêu đề `[Block 08] Kiểm tra gửi email`; SMTP chấp nhận thành công, không tự retry. Người dùng đã xác nhận nhận được thư ngày 06/11/2026; hoàn tất kiểm tra gửi/nhận email thật.
- Kiểm tra database chỉ đọc ban đầu thấy 7 migration cũ. Đã bổ sung 6 file lịch sử từ `block-07/api/prisma/migrations`, giữ nội dung và chọn kiểu xuống dòng để checksum khớp bản đã chạy. Migration khởi tạo hiện có khớp nội dung khi chuẩn hóa xuống dòng; không sửa migration đó.
- Database đã có cấu trúc Block 07: `Chef.specialty` không còn, `Dish` có `searchVector`. Chưa sửa schema/CRUD theo cấu trúc này. `block-07/api/prisma/schema.prisma` còn conflict marker, không dùng trực tiếp làm schema chuẩn.
- Người dùng đã chọn đồng bộ lịch sử và thêm xác thực trước; phần điều chỉnh CRUD chốt riêng. Đã áp dụng `202611060001_add_registration_models` và `202611060002_align_registration_contract` tại mốc database có 9 migration. Sau đó nhóm chạy thêm hai migration khác, được ghi nhận dưới đây.
- Kiểm tra sau migration: đủ hai bảng xác thực, default `role=viewer`/`status=pending`, enum `pending/active`, `usedAt` nullable, unique email, xóa OTP theo user và RLS bật. Số bản ghi của 6 bảng CRUD trước/sau giữ nguyên: Chef 3, Ingredient 110, Dish 1000, DishIngredient 5310, Specialty 5, ChefSpecialty 5. Không reset database hoặc sửa nghiệp vụ CRUD.
- Người dùng đã chọn Cloudflare Turnstile. Đã kiểm tra `.env` có Site key, Secret key và đủ hai hostname local, không hiển thị giá trị key; chưa kiểm chứng key/token với Cloudflare hoặc tạo giao diện Turnstile. Gmail đã xác thực, gửi một thư thử và người dùng xác nhận đã nhận thư.
- Đã chốt hợp đồng `verifyCaptcha(token): Promise<void>`: gọi Cloudflare Siteverify, timeout toàn bộ quá trình 5 giây, không retry, báo lỗi khi token thiếu/sai/hết hạn, dịch vụ lỗi hoặc timeout. Chọn widget Managed cho môi trường local, hai hostname `localhost`, `127.0.0.1`; backend đối chiếu hostname qua `TURNSTILE_ALLOWED_HOSTNAMES`.
- Đã viết `src/services/captcha.ts` và 10 test giả lập. Build và toàn bộ 31/31 test đạt; người dùng đã điền key nhưng chưa gọi Cloudflare bằng token thật hoặc gắn CAPTCHA vào form đăng ký. Phần tích hợp `src/app.ts` vẫn do Trang phụ trách.
- Đã tạo OTP_SECRET ngẫu nhiên riêng trong .env, không hiển thị giá trị. Code OTP dùng HMAC gắn với user, lưu attempts/lockedUntil, thay mã khi gửi lại và cập nhật usedAt/active/emailVerifiedAt trong transaction; không tự đăng nhập.
- Database hiện ghi nhận thêm `202611060003_vy_sessions` và `202611060004_auth_flow_support`. Đã lấy đúng file vy_sessions từ origin/master và đối chiếu checksum khớp. Auth_flow_support đã chạy nhưng chưa push; người dùng yêu cầu tạm gác phần đồng bộ/chạy migration trên Supabase.
- Migration riêng chưa chạy của người 1 đã đổi tên thành `202611060005_add_otp_lock` theo xác nhận. Chỉ thêm lockedUntil nullable; preflight trước đó dừng do thiếu lịch sử, không thay đổi database. Hiện Supabase chưa có lockedUntil; chưa được dùng module OTP mới trên DB này trước khi đồng bộ/apply xong.
- Metadata mới của nhóm còn có User.name/passwordVersion/updatedAt và EmailVerification.sendWindowStartedAt/sendCount; chưa tự dựng lại SQL gốc hoặc thay mô hình của Vy/Trang. Không dùng db:push/reset để vượt khác biệt schema/lịch sử này.
- Kiểm tra cuối phần đăng ký: Prisma validate/generate, đối chiếu migration 005 với schema diff và TypeScript build đạt; toàn bộ 61/61 test đạt. Chưa thực hiện vòng đăng ký–OTP thật, test concurrency PostgreSQL hoặc gắn router vào app chính.

## 7. Chuẩn bị cấu hình cục bộ

Điền thông tin trực tiếp trong `.env`, không đưa mật khẩu vào README hoặc chat:

| Nhóm | Biến | Cách chuẩn bị |
| --- | --- | --- |
| Database | `DATABASE_URL`, `DIRECT_URL` | Đã điền, kiểm tra lịch sử và áp dụng 2 migration xác thực sau khi người dùng đồng ý |
| App hiện có | `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | Cần cho luồng quản trị cũ khi chạy `DEMO_MODE=false`; không dùng mật khẩu nguyên văn thay cho hash |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Đã chọn Gmail App Password; xem cấu hình và hướng dẫn bên dưới |
| Storage của CRUD | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Giữ theo project cũ khi chạy chức năng ảnh; không phải cấu hình gửi email |

`SMTP_SECURE` nhận `true` hoặc `false`: cổng 465 thường dùng `true`; cổng 587 dùng `false` để bắt đầu kết nối rồi nâng cấp STARTTLS theo cấu hình nhà cung cấp. Tham khảo [Nodemailer SMTP](https://nodemailer.com/smtp).

Đối với database khác, kiểm tra lịch sử trước khi chạy `npm run db:migrate`. Database Supabase hiện tại đã chạy đủ hai migration xác thực; không cần chạy lại để tạo bảng bằng SQL thủ công. Việc tạo bảng không có nghĩa là CRUD đã tương thích với thay đổi schema Block 07.

Gmail hỗ trợ `smtp.gmail.com:465` với TLS ngay khi kết nối, hoặc cổng 587 với STARTTLS. Nhóm đã chọn cổng 465 và App Password. App Password yêu cầu xác minh 2 bước và tài khoản có quyền tạo App Password. Tham khảo [Google SMTP](https://developers.google.com/workspace/gmail/imap/imap-smtp), [Google App Passwords](https://support.google.com/accounts/answer/185833) và [Nodemailer Gmail](https://nodemailer.com/guides/using-gmail).

Điền vào `.env` bằng thông tin riêng của người gửi:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-16-character-app-password
MAIL_FROM=your-account@gmail.com
```

Các giá trị `your-...` chỉ là minh họa, không dùng được để gửi thư. Các bước điền Gmail:

1. Đăng nhập tài khoản Gmail sẽ dùng để gửi OTP. Mở [Bảo mật tài khoản Google](https://myaccount.google.com/security) và bật **Xác minh 2 bước** nếu chưa bật.
2. Mở [App Passwords / Mật khẩu ứng dụng](https://myaccount.google.com/apppasswords). Nếu được yêu cầu, đăng nhập lại; đặt tên ứng dụng như `Block 08` rồi tạo mật khẩu ứng dụng.
3. Sao chép App Password 16 ký tự vừa tạo, bỏ khoảng cách phân nhóm nếu có. Đây là giá trị điền vào `SMTP_PASS`, không phải mật khẩu đăng nhập Gmail thông thường. Xem [hướng dẫn Google](https://support.google.com/accounts/answer/185833?hl=vi).
4. Mở `.env` của block-08: `SMTP_USER` là địa chỉ Gmail gửi; `SMTP_PASS` là App Password; `MAIL_FROM` là cùng địa chỉ với `SMTP_USER`. Giữ `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`; không thay các URL database đã điền.
5. Lưu file, sau đó báo đã điền và cung cấp địa chỉ nhận mà người dùng cho phép gửi một email thử. Không đưa App Password vào chat hoặc README.

Nếu không có mục App Passwords, kiểm tra xác minh 2 bước và đúng tài khoản Google đang đăng nhập. Tài khoản trường/công ty, tài khoản chỉ dùng security key cho xác minh hai bước hoặc tài khoản bật Advanced Protection có thể không có tùy chọn này. Báo lại để thống nhất phương án; không đổi cách xác thực ngầm. Chưa gửi email kiểm thử khi chưa có địa chỉ nhận và yêu cầu gửi rõ ràng.

## 8. Tiện ích email bàn giao cho Trang

Trong module nằm ở `src/routes/`, gọi tiện ích dùng chung như sau:

```typescript
import { sendMail } from '../services/mailer.js';

await sendMail({
  to: recipientEmail,
  subject: mailSubject,
  text: plainTextBody,
  html: htmlBody, // Có thể bỏ nếu chỉ gửi text.
});
```

- `to` là một địa chỉ email; `subject` và `text` bắt buộc, `html` tùy chọn. Mỗi lần gọi gửi cho một người nhận, phù hợp OTP và reset mật khẩu.
- Người gửi lấy từ `MAIL_FROM`, không nhận từ form. Có thể dùng địa chỉ thuần hoặc dạng `Bếp Nhà <sender@example.com>`.
- Hàm đọc và kiểm tra đủ 6 biến SMTP/email ở mục 7 khi gọi; `SMTP_PORT` là số nguyên 1–65535, `SMTP_SECURE` phải là chuỗi `true` hoặc `false`. `SMTP_USER` và `SMTP_PASS` cần được điền cho transport SMTP hiện tại.
- Promise resolve nghĩa là SMTP đã chấp nhận email để chuyển tiếp; chưa bảo đảm email đã vào Inbox. Không trả OTP hoặc response của nhà cung cấp cho client.
- Hàm không tự retry, không tạo OTP/reset token, không cập nhật tài khoản và không ghi log nội dung email hoặc lỗi gốc của nhà cung cấp.
- Khi thất bại, hàm throw `MailError`. Caller xử lý theo `error.code`, không đánh dấu gửi thành công hoặc kích hoạt tài khoản khi Promise bị reject.

| Mã lỗi | Ý nghĩa |
| --- | --- |
| `MAIL_CONFIG_INVALID` | Thiếu/sai cấu hình; thông báo chỉ nêu tên biến, không nêu giá trị bí mật |
| `MAIL_MESSAGE_INVALID` | Địa chỉ nhận, tiêu đề hoặc nội dung không hợp lệ |
| `MAIL_SEND_FAILED` | SMTP không chấp nhận người nhận hoặc gặp lỗi gửi; lỗi gốc được che |

Kiểm thử riêng bằng `npx tsx --test tests/mailer.test.ts`. Test dùng transport giả lập/JSON của Nodemailer, không gửi thư ra ngoài. Các router nghiệp vụ và phần mount trong `src/app.ts` chưa được triển khai ở bước này.

## 9. Tạo tài khoản và cấu hình Cloudflare Turnstile

Người dùng đã chọn widget **Managed** với hai hostname local, theo quy trình [tạo tài khoản](https://developers.cloudflare.com/fundamentals/account/create-account/), [tạo widget](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/) và [phát triển local](https://developers.cloudflare.com/turnstile/troubleshooting/testing/):

1. Mở [đăng ký Cloudflare](https://dash.cloudflare.com/sign-up), nhập email/mật khẩu và tạo tài khoản.
2. Mở email Cloudflare gửi đến và xác minh địa chỉ email, sau đó đăng nhập dashboard.
3. Tìm mục **Turnstile**, chọn **Add widget**.
4. Đặt tên gợi nhớ, ví dụ `Block 08 Local`; thêm hostname `localhost` và `127.0.0.1`. Nhập từng hostname, không thêm `http://`, `:3000` hoặc đường dẫn.
5. Chọn chế độ **Managed**, tạo widget và sao chép **Site key** cùng **Secret key** vào `.env` của block-08:

```dotenv
TURNSTILE_SITE_KEY=YOUR_SITE_KEY
TURNSTILE_SECRET_KEY=YOUR_SECRET_KEY
TURNSTILE_ALLOWED_HOSTNAMES=localhost,127.0.0.1
```

Thay hai giá trị `YOUR_...` bằng key thật. Site key dùng cho widget trên giao diện; Secret key chỉ ở server, không đưa vào chat, view, response hoặc log. Sau khi lưu, báo đã điền để kiểm tra cấu hình. Chưa đánh dấu hoàn thành CAPTCHA thật chỉ vì đã tạo widget.

Widget này dành cho local; khi có domain triển khai, thống nhất cập nhật hostname trên cả Cloudflare và backend. Không tự đổi sang cho phép mọi hostname hoặc đưa test key luôn thành công vào cấu hình thật.

## 10. Module CAPTCHA bàn giao để tích hợp

Trong router ở `src/routes/`:

```typescript
import { verifyCaptcha } from '../services/captcha.js';

await verifyCaptcha(req.body?.['cf-turnstile-response']);
// Chỉ tạo User và gửi OTP sau khi xác minh thành công.
```

Backend gửi POST tới `https://challenges.cloudflare.com/turnstile/v0/siteverify`; token và Secret key nằm trong body. Hàm kiểm tra token không rỗng, dài tối đa 2048 ký tự, response có `success=true` và hostname nằm trong danh sách cho phép. Chờ tối đa 5 giây kể cả tải response body, abort khi timeout; không retry và không trả dữ liệu provider cho client. Xem [Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

`verifyCaptcha` chỉ kiểm tra Secret key và danh sách hostname khi được gọi; Site key dùng ở bước render widget. Lỗi throw dưới dạng `CaptchaError` với `code`:

| Mã lỗi | Ý nghĩa |
| --- | --- |
| `CAPTCHA_CONFIG_INVALID` | Thiếu/sai Secret key hoặc cấu hình hostname |
| `CAPTCHA_TOKEN_INVALID` | Thiếu/sai/hết hạn/đã dùng token hoặc hostname không được phép |
| `CAPTCHA_UNAVAILABLE` | Lỗi HTTP, mạng hoặc response của Cloudflare không hợp lệ |
| `CAPTCHA_TIMEOUT` | Quá 5 giây xác minh |

Caller phải dừng đăng ký khi Promise reject và cho người dùng thực hiện lại CAPTCHA. Test tự động giả lập HTTP, không dùng key thật hoặc gọi mạng ngoài. Chạy riêng bằng `npx tsx --test tests/captcha.test.ts`.

Hướng dẫn cho Trang khi tích hợp Helmet: thêm `https://challenges.cloudflare.com` vào `script-src` và `frame-src`, giữ các directive đang có, theo [CSP Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/). Nạp script widget từ `https://challenges.cloudflare.com/turnstile/v0/api.js`; chỉ render Site key. Chưa chỉnh `src/app.ts` hoặc tạo view trong bước module này.

## 11. Bàn giao module đăng ký và OTP

Source đã có:

- `src/routes/registration.ts`: factory `createRegistrationRouter({ csrf })`; các dependency khác có thể thay bằng adapter khi test.
- `src/services/registration.ts`: tạo viewer/pending; email trùng trả kết quả nội bộ để tiếp tục luồng chung, không đổi passwordHash/role/status của tài khoản cũ.
- `src/services/password.ts`, `src/validation/registration.ts`: mật khẩu ít nhất 8 ký tự Unicode, tối đa 72 byte UTF-8, không trim mật khẩu; bcrypt cost 12. Email trim/lowercase và tối đa 254 ký tự. Form không nhận role/status.
- `src/services/otp.ts`, `src/services/email-verification.ts`: OTP ngẫu nhiên 6 số, HMAC-SHA256 gắn user; thời hạn 5 phút, tối đa 5 lần sai, cooldown 60 giây, khóa 15 phút. Chỉ bắt đầu lại attempts khi hết khóa và yêu cầu mã mới.
- `views/register.ejs`, `views/verify-email.ejs`: dùng giao diện EJS/CSS có sẵn, chỉ đưa Site key ra trang; không đưa mật khẩu, OTP hoặc hash đã lưu vào HTML.

`requestVerificationEmail(userId)` lưu challenge trước, gửi SMTP sau transaction; SMTP lỗi giữ pending và cooldown, không tự gửi lại. `verifyEmailCode(userId, code)` dùng cập nhật có điều kiện theo phiên bản challenge để mã cũ/request đồng thời không tiêu thụ lại OTP. Khi nhập sai, lỗi được throw sau commit để attempts và thời gian khóa không bị rollback; kích hoạt thành công cập nhật active/emailVerifiedAt/usedAt cùng transaction.

HTTP response cho email trùng hoặc yêu cầu gửi lại dùng thông báo có điều kiện chung, không tiết lộ trạng thái tài khoản hay khẳng định thư đã gửi khi chưa thành công. Lỗi OTP trả thông báo chung; giới hạn theo IP trả 429. Giới hạn IP ở memory và sẽ reset khi tiến trình restart, còn attempts/cooldown/lockedUntil ở database.

Session dùng `pendingRegistrationUserId`, `registrationVerified`, `registrationNotice`. Đây không phải trạng thái đăng nhập; không gán userId/admin/role đăng nhập. Xác minh thành công xóa pendingRegistrationUserId và chỉ dẫn về `/auth/login` để Vy xử lý đăng nhập.

Sau khi cả schema/migration của nhóm được đồng bộ, Trang tích hợp trong `src/app.ts`:

```typescript
import { createRegistrationRouter } from './routes/registration.js';

// Sau session + res.locals, trước handler 404; dùng helper csrf hiện có.
app.use('/auth', createRegistrationRouter({ csrf }));
```

Áp dụng CSP ở mục 10. Thống nhất schema User/Session/LoginAttempt và auth_flow_support trước, generate Prisma Client và chạy migration 005 theo lịch sử đã khớp. Không thay file migration đã áp dụng. Khi chạy thật cần `DEMO_MODE=false` và đủ cấu hình server; module từ chối POST khi demo bật. Người 1 chưa sửa app.ts, header hoặc mount router thay Trang.

Kiểm thử hiện có: validation/mật khẩu, CAPTCHA, service OTP và router qua HTTP với database/email/CAPTCHA giả lập. Adapter transaction trong test là in-memory, không chứng minh chạy đồng thời trên PostgreSQL nhiều tiến trình. Cần kiểm thử lại token Turnstile thật, vòng đời OTP trên PostgreSQL, browser/mobile và tương tác với session/login của Vy sau tích hợp. Gmail gửi/nhận thật đã kiểm tra riêng trước đó.

Kết quả cuối mốc này: `npm run build` và `npm test` đạt 61/61. Migration `202611060005_add_otp_lock` khớp Prisma schema diff nhưng chưa áp dụng, theo yêu cầu tạm gác của người dùng. Khi `202611060004_auth_flow_support` được push, lấy SQL gốc và đồng bộ schema chung trước khi chạy tiếp; không đánh dấu nghiệm thu toàn hệ thống chỉ từ kết quả adapter.
