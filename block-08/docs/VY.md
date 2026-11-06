# Vy — Bàn giao module đăng nhập, session và bảo vệ CRUD

## Phạm vi

Thực hiện Người 2: đăng nhập bằng bảng User, kiểm tra active/xác minh, chống brute force, session PostgreSQL, cookie, logout và quyền quản trị. Giữ nguyên hợp đồng tài khoản do Thuyết phụ trách; không có router đăng ký, OTP, gửi email hoặc reset mật khẩu trong commit này.

## Module

| File | Export/chức năng |
| --- | --- |
| `src/auth/login.ts` | `createLoginRouter(demo, csrf)`: GET/POST `/login`, GET `/captcha`, GET `/account`, POST `/logout`; các hằng `LOGIN_*`, `SESSION_TTL_MS`. |
| `src/auth/access.ts` | `loadCurrentUser` đọc User hiện tại; `requireAdmin` kiểm role trên mọi URL CRUD. |
| `src/auth/session-store.ts` | `PrismaSessionStore(db, { ttlMs? })`, triển khai get/set/destroy/touch cho express-session. |
| `src/auth/captcha.ts` | CAPTCHA ảnh dùng khi đăng nhập sai đủ ngưỡng; có hạn và dùng một lần. |
| `src/auth/tokens.ts` | Đồng hồ kiểm thử, HMAC khóa bộ đếm và transaction Serializable có retry. Không tạo OTP/reset token. |
| `src/auth/validation.ts` | Chuẩn hóa email và kiểm tra dữ liệu đăng nhập. |

## Thứ tự tích hợp cho Trang

1. Parser → express-session với PostgreSQL store → locals/CSRF.
2. `loadCurrentUser` → mount `createLoginRouter(demo, csrf)` tại `/auth`.
3. `requireAdmin` trước mọi route `/admin` và thao tác CRUD.
4. Error handler có locals dự phòng khi database session lỗi trước middleware khởi tạo trang.

`src/app.ts` đã có các điểm nối trên để chạy độc lập. Khi ghép router tổng, chỉ mount mỗi route một lần. `/admin/login` là alias dẫn đến `/auth/login`; endpoint legacy không kiểm tra credential `.env`.

## Hợp đồng với Thuyết

- User giữ email unique đã trim/lowercase, bcrypt passwordHash, role mặc định viewer, status pending/active và emailVerifiedAt.
- Chỉ cấp session khi status active, có emailVerifiedAt và mật khẩu đúng. Xác minh email không tự cấp admin.
- Database cần được Thuyết triển khai bảng `User`/enum `UserStatus` trước. Bản này không kèm schema OTP hoặc migration đăng ký; Prisma chỉ ánh xạ hợp đồng User cần cho đăng nhập. Vy bổ sung `Session`, `LoginAttempt` và metadata trong migration `202611060003_vy_sessions`. Không dùng `prisma db push` với schema từng phần này.
- Không cấp quyền từ form hoặc cookie. `admin:promote` là CLI server riêng cho quản lý, yêu cầu tài khoản đã xác minh.

## Hợp đồng với Trang

Session lưu `userId`, `passwordVersion`, `absoluteExpiresAt`; role được đọc lại từ database trên mỗi request. Khi triển khai đổi mật khẩu, Trang cần tăng User.passwordVersion trong cùng transaction và thu hồi Session theo userId. Bản này không triển khai luồng đổi/reset mật khẩu.

## Chính sách session và khóa

Session/counter lưu PostgreSQL ngoài demo, secret không đổi sau restart. Cookie HttpOnly, SameSite=Lax, Secure production; hạn tuyệt đối 2 giờ, không gia hạn trượt. Sau khi store đã load một session, save chỉ cập nhật bản ghi còn tồn tại/chưa hết hạn; request cũ không thể tái tạo session vừa logout.

Cửa sổ 15 phút, CAPTCHA từ 3 lần sai; khóa 15 phút sau 5 lần/tài khoản hoặc 20 lần/IP. CAPTCHA đúng không xóa lỗi hoặc vượt khóa. Giới hạn phụ 120 POST/IP/15 phút. Đăng nhập đúng chỉ xóa bộ đếm tài khoản, giữ lịch sử theo IP.

Các thông số vận hành và quyền CRUD cần nhóm review; tài liệu này không đánh dấu thay xác nhận của thành viên khác.

## Kiểm chứng

Tests kiểm tra active/xác minh/quyền, CSRF, brute force, cookie/proxy, đổi SID, phục hồi session bằng store mới, hết hạn, lỗi database và logout đồng thời. Fixtures không gửi email hoặc ghi database thật.

Module đã được kiểm tra với PostgreSQL dùng chung: tạo/đọc session qua store mới và xóa session khi logout; dữ liệu nhà hàng/tài khoản cũ được đối chiếu không đổi. Chưa thử mật khẩu của tài khoản thật. Không commit `.env`, secret, cookie hoặc dữ liệu database.
