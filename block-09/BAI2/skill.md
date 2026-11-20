---
name: block-08-registration
description: Lập kế hoạch, theo dõi tiến độ và triển khai yêu cầu 1 của Block 08 trên source Express, EJS và Prisma hiện có: đăng ký tài khoản, CAPTCHA và kích hoạt email bằng OTP.
---

# Kế hoạch yêu cầu 1 — Đăng ký và xác minh email

Cập nhật: 06/11/2026. File này là hướng dẫn thực hiện trong project, chưa được cài thành skill dùng chung của Codex.

## 1. Mục tiêu và phạm vi

Hoàn thành luồng: mở trang đăng ký → nhập thông tin và hoàn thành CAPTCHA → backend tạo tài khoản chưa kích hoạt → gửi OTP qua email → người dùng nhập OTP → kích hoạt tài khoản.

- Thực hiện vai trò người 1: đăng ký, xác minh email, gửi lại OTP và tiện ích gửi email dùng chung.
- Giữ nguyên nghiệp vụ CRUD của Block 05 đã copy sang Block 08.
- Đăng nhập, session bền vững và bảo vệ CRUD thuộc người 2; quên mật khẩu thuộc người 3.
- Bàn giao cho người 2 quy ước tài khoản đã xác minh phải đồng thời có `User.emailVerifiedAt !== null` và `status=active`. Đăng ký do server gán `role=viewer`, `status=pending`; không nhận role từ form.
- Dùng các mục `[x]` trong `README.md` làm chuẩn đã xác nhận. Mục `[ ]` là đề xuất chưa chốt; không tự chuyển thành quyết định hoặc đánh dấu đồng ý thay các thành viên.
- Trước lựa chọn chưa được xác nhận, hỏi ý kiến người dùng và giải thích ảnh hưởng của lựa chọn. Những quyết định đã xác nhận trong chat được ghi lại trong README, không cần hỏi lại.
- Theo README, Trang là người mount router và sửa phần tích hợp trong `src/app.ts`. Người 1 chuẩn bị module và hướng dẫn tích hợp, không tự sửa file này.

## 2. Hiện trạng đã xác minh

- Stack: Express 5, TypeScript, EJS, Prisma 6 và PostgreSQL/Supabase.
- Đã có `bcryptjs`, `zod`, `express-rate-limit`, session và CSRF trong `src/app.ts`.
- Đã có hai model `User` và `EmailVerification` trong `prisma/schema.prisma`.
- Schema đã bổ sung `User.role` String mặc định `viewer`, `User.status` enum `UserStatus` mặc định `pending`, và `EmailVerification.usedAt` nullable theo xác nhận của người dùng.
- Giữ nguyên migration `prisma/migrations/202611060001_add_registration_models/migration.sql`; đã tạo migration bổ sung `202611060002_align_registration_contract` theo xác nhận của người dùng. SQL đã được đối chiếu với Prisma migrate diff; tài khoản có `emailVerifiedAt` sẵn được chuyển sang `active` để giữ đúng quy ước khi áp dụng migration.
- Mỗi user có tối đa một bản ghi OTP hiện tại qua khóa chính `EmailVerification.userId`.
- Migration bật RLS cho hai bảng mới; ứng dụng truy cập qua kết nối database phía server.
- Prisma validate/generate, TypeScript build và toàn bộ 61/61 test đạt sau đồng bộ schema xác thực chung. Đã áp dụng migration 005 và kiểm tra 34 cột xác thực khớp metadata Supabase. Chưa nghiệm thu đăng ký/CAPTCHA với PostgreSQL và token thật; Gmail gửi/nhận thật đã kiểm tra riêng.
- Đã tạo .env, người dùng điền hai URL. Đã kiểm tra lịch sử và áp dụng các migration của người 1 được đồng ý; database hiện có 12 migration thành công sau khi nhóm bổ sung 003/004 và mình chạy 005.
- Đã bổ sung 6 file lịch sử từ `block-07/api/prisma/migrations`, chọn kiểu xuống dòng khớp checksum đã ghi nhận. Không sửa migration khởi tạo hoặc hai migration xác thực hiện có.
- Database đã có thay đổi Block 07: bỏ `Chef.specialty`, thêm `Dish.searchVector`. Người dùng chọn thêm xác thực trước; phần sửa schema/CRUD hỏi riêng. Không copy trực tiếp schema Block 07 vì còn conflict marker.
- Đã kiểm tra metadata hai bảng xác thực: default, enum, usedAt nullable, unique email, cascade và RLS đều đúng. Số bản ghi của sáu bảng CRUD trước/sau giữ nguyên.
- Đã xác nhận và cài Nodemailer qua SMTP cùng type TypeScript; đã viết `src/services/mailer.ts` và test. Gmail App Password qua `smtp.gmail.com:465`, secure=true, MAIL_FROM dùng chính Gmail gửi đã xác thực thành công. Đã gửi đúng một thư kiểm thử được người dùng duyệt đến SMTP_USER; người dùng xác nhận đã nhận ngày 06/11/2026. Hoàn tất kiểm tra gửi/nhận thật, không tự gửi thêm.
- Đã chọn Turnstile Managed cho localhost/127.0.0.1 và kiểm tra hai key có giá trị trong .env. Đã có module, router và view đăng ký/xác minh; chưa mount app chính hoặc kiểm chứng token thật.
- Người dùng đã chốt chính sách OTP/khóa, bcrypt/HMAC, route GET, form, session tạm và giới hạn IP. Đã tạo OTP_SECRET ngẫu nhiên trong .env, không in giá trị.
- Đã lấy vy_sessions và auth_flow_support từ origin/master, checksum khớp Supabase; lý do tạm gác trước đó đã giải quyết khi người dùng push 004. Đã chạy 202611060005_add_otp_lock, kiểm tra lockedUntil nullable và số bản ghi CRUD giữ nguyên.
- Theo xác nhận người dùng, chỉ đồng bộ các model/field xác thực chung từ master, giữ CRUD tạm gác: User mới, Session, LoginAttempt, PasswordResetToken, sendWindowStartedAt/sendCount/index expiresAt, cùng lockedUntil của mình. Metadata kiểm tra đủ 34 cột/5 model, RLS bật; không thay chính sách login/reset hoặc counters của các thành viên khác.

## 3. Công việc tiếp theo: cấu hình môi trường và database

- [x] Chọn dùng lại Supabase/database của Block 05, theo xác nhận ngày 06/11/2026.
- [x] Người dùng điền `DATABASE_URL`, `DIRECT_URL`; kiểm tra định dạng hai URL và kết nối chỉ đọc qua DIRECT_URL thành công, không in secret.
- [x] Tạo `.env` cục bộ từ `.env.example`; `.gitignore` đã loại `.env`, credential vẫn cần người dùng tự điền.
- [x] Sửa dấu ngoặc kép thừa cuối `DIRECT_URL` trong `.env.example` khi cập nhật cấu hình mẫu.
- [ ] Khi chạy database thật, đặt `DEMO_MODE=false` và cung cấp `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` mà app hiện tại yêu cầu. Chưa thay luồng đăng nhập cũ của người 2.
- [x] Kiểm tra lịch sử migration của database đích: đã có `_prisma_migrations`, không cần baseline migration khởi tạo. Không reset hoặc xóa dữ liệu để vượt lỗi.
- [x] Người dùng chốt đồng bộ 6 file migration cũ từ Block 07 và thêm xác thực trước; đã đối chiếu/khôi phục lịch sử. Sửa lệch schema/CRUD nằm ngoài bước này và cần hỏi riêng.
- [x] Áp dụng đúng hai migration xác thực và kiểm tra bảng, default viewer/pending, enum, usedAt nullable, khóa ngoại cascade, unique email và RLS. Sáu bảng CRUD giữ nguyên số bản ghi.
- [x] Sau khi 004 được push, khớp lịch sử, áp dụng riêng 005 thêm lockedUntil và đối chiếu schema xác thực chung. Không còn tạm gác migration.

Các lệnh dùng khi cấu hình và lịch sử migration đã phù hợp:

```powershell
npm run db:generate
npm run db:migrate
```

Hoàn thành khi hai bảng tồn tại trên database phát triển và Prisma truy cập được. Không đánh dấu hoàn thành chỉ vì đã tạo file SQL.

## 4. Chuẩn bị gửi email và CAPTCHA

Đã xác nhận dùng Nodemailer qua Gmail SMTP với App Password, host `smtp.gmail.com`, cổng 465, secure=true, MAIL_FROM dùng chính tài khoản gửi. Người dùng đã chọn Cloudflare Turnstile cho đăng ký. Các chính sách chưa thống nhất khác vẫn cần hỏi trước khi triển khai.

| Nhóm | Biến cấu hình dự kiến | Ghi chú |
| --- | --- | --- |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Dùng cấu hình của nhà cung cấp email; parse rõ kiểu boolean và số |
| CAPTCHA | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAMES` | Site key cho giao diện, secret ở server; hostname local đã chốt là localhost,127.0.0.1 |
| OTP | `OTP_SECRET` | Bí mật riêng để tạo HMAC cho OTP; không hard-code |

- [x] Cài `nodemailer` và type TypeScript phù hợp; cập nhật lockfile.
- [x] Chốt hợp đồng hàm với người dùng: `sendMail({ to, subject, text, html? }): Promise<void>`, báo lỗi khi thiếu cấu hình hoặc gửi thất bại; không tự retry hoặc tạo OTP.
- [x] Tạo tiện ích email theo hợp đồng đã xác nhận để người 3 dùng lại; README mục 8 ghi cách import, cấu hình và mã lỗi. Promise resolve là SMTP đã chấp nhận, chưa bảo đảm vào Inbox.
- [x] Kiểm thử mailer không gửi thư thật: cấu hình thiếu/sai, địa chỉ/nội dung lỗi, text/HTML, secure true/false, chờ kết quả gửi, che lỗi provider, không retry và người nhận bị từ chối.
- [x] Chốt Gmail App Password và viết hướng dẫn trong README. Đã cập nhật `.env.example` và chỉ điền các giá trị host/port/secure còn trống trong `.env`, giữ nguyên credential người dùng.
- [x] Người dùng điền `SMTP_USER`, `SMTP_PASS` (App Password) và `MAIL_FROM`; đã kiểm tra đủ biến, đúng cấu hình Gmail, sender khớp và không in secret.
- [x] Kiểm tra kết nối TLS và đăng nhập Gmail SMTP thành công bằng `verify()`; không gửi thư trong bước xác thực này.
- [x] Gửi đúng một email thử được người dùng duyệt đến SMTP_USER qua module sendMail; SMTP chấp nhận, không tự retry hoặc in secret.
- [x] Người dùng xác nhận đã nhận thư `[Block 08] Kiểm tra gửi email` ngày 06/11/2026. Không tự gửi lại khi chưa có yêu cầu mới.
- [x] Người dùng chọn Cloudflare Turnstile; thêm chỗ điền `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` trong cấu hình, chưa tự tạo widget hoặc key.
- [x] Người dùng chốt widget Managed, hai hostname local và hợp đồng `verifyCaptcha(token): Promise<void>`, timeout 5 giây, lỗi thì chặn đăng ký, không tự retry. Đã thêm danh sách hostname backend vào cấu hình.
- [x] Viết hướng dẫn tạo tài khoản/widget và điền key tại README mục 9; người dùng đã điền hai key, chưa kiểm thử widget trên browser.
- [x] Kiểm tra `.env` đã điền Site key, Secret key và đủ hostname localhost/127.0.0.1; chỉ kiểm tra sự hiện diện, chưa chứng minh key hợp lệ hoặc widget hoạt động.
- [ ] Thiết lập Turnstile cho hostname phát triển; dùng test key theo tài liệu khi kiểm thử tự động.
- [x] Viết module xác minh token tại backend và gọi từ router đăng ký: kiểm tra hostname, timeout 5 giây kể cả response body, lỗi thì reject, không log token/secret. 10 test CAPTCHA giả lập đạt; router chưa mount trong app chính.
- [x] Chuẩn bị hướng dẫn điều chỉnh Helmet CSP cho Trang khi tích hợp tại README mục 10; chưa sửa `src/app.ts`.
- [ ] Kiểm thử widget và module với key thật khi có form, xác nhận không tạo tài khoản/gửi OTP nếu CAPTCHA lỗi.

Nếu chưa có thông tin dịch vụ thật, tiếp tục phát triển bằng adapter giả lập trong test. Chưa đánh dấu gửi email hoặc CAPTCHA thật là hoàn thành.

## 5. Quy ước dữ liệu và OTP

- Chuẩn hóa email bằng trim và lowercase trước khi truy vấn/lưu; xử lý cả lỗi unique khi có yêu cầu đồng thời.
- Đã chốt bcryptjs; mật khẩu ít nhất 8 ký tự Unicode và tối đa 72 byte UTF-8, không trim hoặc âm thầm cắt. Code dùng cost 12 và helper hashPassword để tái sử dụng.
- Không ghi đè mật khẩu của tài khoản đã tồn tại qua thao tác đăng ký lại. Tài khoản đang chờ xác minh sử dụng luồng gửi lại OTP.
- Sinh OTP bằng bộ sinh số ngẫu nhiên mật mã của `node:crypto`, không dùng `Math.random()`.
- Đã chốt 6 chữ số, hạn 5 phút, tối đa 5 lần sai, gửi lại cách ít nhất 60 giây; gửi lại không reset attempts. Đủ 5 lần sai khóa 15 phút; hết khóa yêu cầu mã mới để bắt đầu chu kỳ mới và reset attempts.
- Đã chốt HMAC-SHA256 gắn với user bằng OTP_SECRET; không lưu/log OTP nguyên văn hoặc trả OTP trong response. OTP_SECRET phải giữ ổn định qua restart và dùng chung giữa các instance xác minh.
- Thay mã cũ khi gửi lại, không lặp lại cùng giá trị 6 số. Cập nhật có điều kiện theo phiên bản challenge, attempts, usedAt và lockedUntil để không tiêu thụ mã cũ/request thua tranh chấp.
- Xác minh thành công phải cập nhật `User.emailVerifiedAt`, `User.status=active` và `EmailVerification.usedAt` trong cùng transaction, giữ bản ghi OTP. Từ chối mã có `usedAt` và tránh kích hoạt bằng bản ghi đã bị thay thế.
- lockedUntil đã có trong source và Supabase qua migration 005; lịch sử 004 đã đồng bộ đúng SQL gốc, không đổi checksum để vượt preflight.
- SMTP lỗi giữ pending và vẫn cooldown 60 giây; không tự retry hoặc khẳng định đã gửi. HTTP dùng thông báo có điều kiện chung để không tiết lộ trạng thái email trùng.

## 6. Triển khai chức năng theo thứ tự

### Giai đoạn A — Đăng ký

- [x] Viết validation email/password/confirmPassword và kiểm thử byte UTF-8, Unicode, mật khẩu xác nhận.
- [x] Viết form EJS; khi lỗi chỉ giữ email, không hiển thị lại mật khẩu.
- [x] Router nhận middleware CSRF dùng chung và kiểm tra CAPTCHA trước khi tạo tài khoản/gửi email; test giả lập đạt.
- [x] Giới hạn 5 form đăng ký/15 phút/IP, 10 yêu cầu resend/giờ/IP; cooldown 60 giây/tài khoản ở DB.
- [x] Service tạo viewer/pending, emailVerifiedAt=null, passwordHash; service OTP tạo usedAt=null. Email trùng không ghi đè mật khẩu/quyền.
- [x] Viết điều hướng tới trang OTP và xử lý lỗi SMTP với pending/cooldown; đã kiểm thử bằng adapter, chưa chạy luồng đăng ký thật.

### Giai đoạn B — Xác minh email

- [x] Viết form OTP và dùng pendingRegistrationUserId trong session; bỏ qua userId từ client.
- [x] Service kiểm tra pending/chưa xác minh, mã, thời hạn, attempts, usedAt và lockedUntil.
- [x] Cập nhật attempts có điều kiện và commit trước khi throw lỗi; có test tranh chấp bằng adapter, chưa test concurrency PostgreSQL thật.
- [x] Mã đúng cập nhật usedAt/emailVerifiedAt/active trong transaction, retain bản ghi; có test rollback.
- [x] Trang xác minh thành công liên kết /auth/login, không tạo userId/admin session đăng nhập; test HTTP kiểm chứng.

### Giai đoạn C — Gửi lại OTP

- [x] Nút resend dùng POST và CSRF.
- [x] Kiểm tra pending, cooldown/khóa trong DB và rate limit IP.
- [x] Cập nhật mã mới, giữ attempts trong cùng chu kỳ, xử lý SMTP lỗi; đã test adapter.
- [x] Service từ chối gửi cho tài khoản active; public response không tiết lộ trạng thái tài khoản.

## 7. Tổ chức code dự kiến

| File | Trách nhiệm |
| --- | --- |
| `src/routes/registration.ts` | Router đăng ký, xác minh và gửi lại OTP |
| `src/services/mailer.ts` | Gửi email qua SMTP, dùng chung cho người 3 |
| `src/services/email-verification.ts` | Tạo, thay thế và xác minh OTP |
| `src/services/captcha.ts` | Gọi API xác minh Turnstile |
| `src/validation/registration.ts` | Schema Zod cho form mới |
| `views/register.ejs`, `views/verify-email.ejs` | Giao diện đăng ký và OTP |
| `tests/registration.test.ts` | Kiểm thử đăng ký và vòng đời OTP |

Đã chốt GET/POST /auth/register, GET/POST /auth/verify-email, POST /auth/verify-email/resend; form email/password/confirmPassword, pendingRegistrationUserId là session tạm. Router dùng factory createRegistrationRouter({ csrf }); xem README mục 11 để Trang mount.

Hướng dẫn bàn giao cho Trang: gắn router sau session và thiết lập `res.locals`, trước middleware/handler chặn route không tồn tại. Các route mới phải dùng được CSRF hiện có; thống nhất cách chia sẻ helper với Trang thay vì tự sửa `src/app.ts`. Không đưa đăng ký vào sau guard `/admin` hoặc bật đường tắt qua `DEMO_MODE` cho đăng ký thật.

## 8. Kiểm thử và tiêu chí nghiệm thu

- [ ] Đăng ký hợp lệ tạo tài khoản `viewer/pending`, chưa xác minh, và gửi email đúng địa chỉ; form không thể tự nâng role.
- [ ] Form lỗi, CSRF sai, CAPTCHA thiếu/sai hoặc CAPTCHA timeout không tạo tài khoản và không gửi email.
- [ ] Email trùng và đăng ký đồng thời không tạo nhiều tài khoản, không thay mật khẩu tài khoản có sẵn.
- [ ] OTP đúng cập nhật `active`, `emailVerifiedAt`, `usedAt` nhất quán; mã sai tăng attempts; quá số lần thử hoặc hết hạn bị từ chối.
- [ ] OTP đã dùng bị từ chối; OTP cũ không dùng được sau khi gửi lại.
- [ ] Gửi lại quá sớm hoặc quá nhiều bị giới hạn; các request đồng thời không vượt điều kiện gửi lại.
- [ ] SMTP lỗi không làm tài khoản thành đã xác minh và có luồng thử lại.
- [ ] Hai request xác minh đồng thời không tiêu thụ OTP thành công hai lần.
- [ ] Test tự động giả lập SMTP và Turnstile, không gửi thư thật và không phụ thuộc mạng ngoài.
- [x] Bổ sung các file test mới vào npm test; Prisma validate/generate, schema diff, build và toàn bộ 61/61 test đạt.
- [ ] Kiểm tra thủ công trên trình duyệt và hộp thư thật khi có cấu hình.
- [x] Cập nhật README: schema xác thực/migration đã đồng bộ, cách tích hợp router và phạm vi kiểm thử; kịch bản nghiệm thu thật thực hiện sau tích hợp.

## 9. Cách cập nhật tiến độ

Khi tiếp tục công việc, đọc lại code và file này, chọn hạng mục chưa hoàn thành gần nhất có đủ đầu vào. Sau mỗi phần, cập nhật checkbox và kết quả kiểm tra; phân biệt rõ đã viết code, đã kiểm thử giả lập và đã chạy dịch vụ/database thật. Không đánh dấu thay cho công việc của người 2 hoặc người 3.

| Mốc | Trạng thái | Bằng chứng / việc còn lại |
| --- | --- | --- |
| Hai model và migration trong source | Hoàn thành | Prisma validate/generate, build, 14/14 test hiện có đạt ở lần kiểm tra trước |
| Đồng bộ role/status/usedAt theo README | Hoàn thành | Schema/migration đã kiểm tra và áp dụng trên Supabase; metadata đúng hợp đồng |
| Chuẩn bị `.env` và Nodemailer | Hoàn thành phần khung | Đã tạo `.env`, sửa mẫu và cài thư viện/type; kiểm tra key cấu hình và TypeScript build đạt |
| Kiểm tra database thật chỉ đọc | Hoàn thành | Trước khi áp dụng: tìm được lịch sử 7 migration, 6 file thiếu và lệch cấu trúc CRUD; kết quả dùng để chuẩn bị đúng 2 migration xác thực |
| Áp dụng migration lên database | Hoàn thành | Đã chạy đúng 2 migration mới; lịch sử tổng 9, metadata xác thực đúng, số bản ghi CRUD giữ nguyên |
| Tiện ích email dùng chung | Hoàn thành | Đã chốt hợp đồng hàm, có 7 test mailer và kiểm tra gửi/nhận thật thành công |
| Cấu hình và xác thực Gmail | Hoàn thành | Người dùng đã điền credential; kiểm tra TLS và đăng nhập SMTP thật thành công, không in secret |
| Gửi và nhận thư thật | Hoàn thành | Đã gửi đúng một thư thử qua module sendMail; SMTP chấp nhận và người dùng xác nhận đã nhận |
| Module Turnstile | Hoàn thành trong source | 10 test CAPTCHA giả lập và build đạt; toàn bộ 31/31 test đạt; chưa có form để kiểm thử token thật |
| Cấu hình widget Turnstile | Đã điền trong .env | Có Site key, Secret key và hai hostname local; chưa kiểm chứng với Cloudflare/token thật |
| Đăng ký, xác minh, gửi lại OTP | Hoàn thành code và test adapter | Có router/service/view; build và 61/61 test đạt; lockedUntil đã áp dụng; chưa mount app.ts hoặc kiểm thử PostgreSQL/token thật |
| Migration lockedUntil | Hoàn thành | 004 khớp SQL gốc và 005 áp dụng thành công; lịch sử 12 migration, số bản ghi CRUD giữ nguyên |
| Schema xác thực chung | Hoàn thành đồng bộ từ master | Client đã generate, 34 cột/5 model khớp metadata và RLS; giữ nguyên CRUD tạm gác |
| Test chức năng mới và demo | Chưa thực hiện | Thực hiện sau khi có các luồng tương ứng |

## 10. Tài liệu tra cứu khi triển khai

- [Nodemailer SMTP](https://nodemailer.com/smtp): cấu hình kết nối gửi email.
- [Nodemailer Gmail](https://nodemailer.com/guides/using-gmail) và [Google App Passwords](https://support.google.com/accounts/answer/185833): đọc khi triển khai xác thực Gmail theo lựa chọn đã chốt.
- [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): xác minh token phía backend.
- [Turnstile testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/): test key khi phát triển.
- [Turnstile CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/): tích hợp với Helmet.

Đối chiếu tài liệu chính thức khi bắt đầu tích hợp; các liên kết là nguồn tham khảo, không phải xác nhận rằng cấu hình đã được triển khai.
