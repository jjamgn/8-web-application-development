# Trang — Quên mật khẩu và kiểm thử tích hợp

Phần Người 3 theo phân công: khôi phục mật khẩu cho tài khoản đội ngũ, tích hợp router và chuẩn bị demo toàn hệ thống. Module giữ nguyên quyền hiện tại, không tự cấp admin.

## Module và tích hợp

`src/auth/password-recovery.ts` cung cấp `createPasswordRecoveryRouter()`, `requestPasswordReset(email)` và `resetPassword(token, password)`. Router gọi `mailer`/`resetEmail` chung của Thuyết, bảng `PasswordResetToken` và cơ chế thu hồi session của Vy. Service nhận dữ liệu đã qua validation; endpoint HTTP kiểm tra email/mật khẩu/token trước khi gọi service.

`src/app.ts` mount `createAuthRouter(demo, csrf)` tại `/auth`. Router tổng thiết lập `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, gắn router login, áp dụng CSRF/chặn POST ở demo trước khi gắn recovery. Không mount recovery trực tiếp vào app hoặc lần thứ hai vì sẽ bỏ qua guard hoặc tạo limiter riêng.

| Route | Hành vi |
| --- | --- |
| GET `/auth/forgot-password` | Render form email và CAPTCHA. |
| POST `/auth/forgot-password` | Kiểm tra CSRF/CAPTCHA/email; cùng phản hồi 303 cho email không tồn tại, pending, đang cooldown, đủ quota hoặc SMTP thất bại. |
| GET `/auth/reset-password?token=...` | Render form; không dùng token, không đổi mật khẩu hoặc gửi email. Preview có thể mở nhiều lần. |
| POST `/auth/reset-password` | Kiểm tra CSRF, token 64 ký tự hex, mật khẩu tối thiểu 8 ký tự/tối đa 72 byte UTF-8 và xác nhận khớp. Token sai/hết hạn/đã dùng trả 400. |

Token ngẫu nhiên 32 byte, chỉ lưu HMAC-SHA-256, hạn 30 phút, dùng một lần. Không gửi token trong phản hồi forgot hoặc log; token chỉ có trong email và form reset mở từ email. Origin lấy từ `APP_URL`, không từ Host header.

Chỉ tài khoản active có emailVerifiedAt được khôi phục. Gửi link mới vô hiệu link trước, chờ tối thiểu 60 giây, tối đa 5 email/tài khoản/giờ. Các mốc này lưu qua bảng token PostgreSQL; forgot còn giới hạn 10 POST/IP/15 phút, reset 20 POST/IP/15 phút. Limiter IP nằm trong tiến trình Node và đặt lại sau restart; quota tài khoản vẫn còn.

Reset dùng transaction Serializable có retry: tiêu thụ token, đổi passwordHash/tăng passwordVersion, vô hiệu token còn lại và xóa mọi Session theo userId. Lỗi database rollback cả transaction. Request giữ snapshot session trước reset không thể tạo lại bản ghi đã xóa; passwordVersion còn chặn phiên cũ khi kiểm tra quyền. Sau thành công, hủy session hiện tại/xóa cookie rồi chuyển về login, không tự đăng nhập.

Không cần migration mới: dùng `202611060004_auth_flow_support` và `202611060003_vy_sessions` hiện có. Không seed/reset database dùng chung để chạy thử.

## Kiểm thử tự động

```powershell
npm run build
npm run test:recovery
npm test
```

Tests dùng Prisma fixture và SMTP local, không gửi email ra ngoài hoặc ghi database thật. Bao phủ đăng ký → OTP → login → reset → login lại; GET không tiêu thụ token; token sai/hết hạn/dùng rồi; validation; quota/cooldown; giới hạn IP; tài khoản vô hiệu; SMTP lỗi; xóa session nhiều thiết bị; request cũ không khôi phục session; giữ phiên tài khoản khác; rollback khi thu hồi phiên thất bại.

Fixture không thay thế kiểm thử transaction đồng thời trên PostgreSQL hoặc gửi mail thật. Các hạn dùng/ngưỡng là giá trị triển khai; tài liệu không đánh dấu thay sự đồng ý của nhóm.

## Kịch bản demo toàn hệ thống

Chuẩn bị database phát triển đã có migration, `DEMO_MODE=false`, session secret ổn định, mã mời, SMTP hợp lệ và `APP_URL` đúng địa chỉ ứng dụng. Chạy `npm run config:check`; `npm run config:connect` kiểm tra kết nối thật nhưng không gửi email. Dùng tài khoản/hộp thư thử của nhóm.

1. Mở `/auth/register`, thử CAPTCHA/mã mời sai rồi đăng ký hợp lệ. Tài khoản pending không được đăng nhập.
2. Nhận OTP, thử mã sai rồi mã đúng. Tài khoản active/viewer, chưa có session đăng nhập; OTP đã dùng bị từ chối. Thử gửi lại OTP và cooldown trên tài khoản pending khác.
3. Đăng nhập viewer, mở trực tiếp `/admin/dishes` nhận 403. Quản lý chạy `npm run admin:promote -- --email EMAIL_THU` cho tài khoản thử đã xác minh, đăng nhập lại rồi mở quản trị.
4. Đăng nhập cùng tài khoản ở hai trình duyệt/profile. Chọn Quên mật khẩu; nhập email không tồn tại và email thử với CAPTCHA, đối chiếu cùng thông báo. Kiểm tra cooldown không gửi thêm mail.
5. Mở link reset hai lần. GET không tiêu thụ token; mật khẩu xác nhận sai vẫn giữ link hợp lệ. Đặt mật khẩu mới đúng và thấy chuyển về login.
6. Ở hai trình duyệt cũ, mở lại URL quản trị phải về login. Mật khẩu cũ thất bại, mật khẩu mới đăng nhập được; link đã dùng bị từ chối. Dùng test tự động cho hết hạn để không phải chờ 30 phút.
7. Logout rồi gọi URL quản trị phải về login. POST thiếu CSRF nhận 403. Thử sai đủ ngưỡng để minh họa CAPTCHA/khóa trên tài khoản riêng, tránh khóa tài khoản demo chính.
8. Trên database phát triển, đăng nhập rồi restart server bằng cùng secret; session chưa hết hạn vẫn đọc được. Không thay `.env` khi thử tính bền vững.

Minh chứng: ảnh form/notice, status/redirect trong Network, cookie HttpOnly/SameSite (Secure với HTTPS production), User/passwordVersion và số Session trước/sau reset. Che email cá nhân, mật khẩu, session ID, mã mời, OTP và reset token trong ảnh/video.
