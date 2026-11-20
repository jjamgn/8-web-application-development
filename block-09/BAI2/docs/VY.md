# Vy — Đăng nhập, session và bảo vệ CRUD

Phạm vi Người 2 theo `D:\Downloads\README.md`: chuyển đăng nhập sang bảng `User`, kiểm tra tài khoản active/đã xác minh, chống brute force, lưu session PostgreSQL, cấu hình cookie, đăng xuất và kiểm tra quyền trên server. Tài liệu nguồn giữ nguyên; nội dung dưới đây mô tả module triển khai và các đề xuất cần nhóm thống nhất, không xác nhận thay thành viên khác.

## Hợp đồng tài khoản

- Thuyết tạo `User` với email unique đã trim/lowercase, `passwordHash`, `emailVerifiedAt`, `role` mặc định `viewer`, `status` mặc định `pending`. Không nhận quyền từ form đăng ký.
- Xác minh thành công chuyển `status=active`, điền `emailVerifiedAt`; không tự đăng nhập và không đổi role thành admin.
- Vy chỉ tạo session khi mật khẩu đúng, `status=active` và email đã xác minh. Admin vào `/admin/dishes`; viewer vào `/auth/account` và chờ người quản lý cấp quyền.
- Mọi request `/admin/*` và CRUD đều cần tài khoản active, đã xác minh và `role=admin`. Trang thực đơn công khai giữ nguyên theo đề xuất, chờ nhóm chốt phạm vi.

## Module bàn giao cho Trang

| Module | Trách nhiệm |
|---|---|
| `src/auth/login.ts` | `createLoginRouter(demo: boolean, csrf: RequestHandler)` và các hằng `LOGIN_*`; GET/POST đăng nhập, CAPTCHA khi cần, đếm sai/khóa, đổi SID, POST đăng xuất/hủy session. |
| `src/auth/session-store.ts` | `PrismaSessionStore(db, { ttlMs? })` tương thích `express-session`: đọc/ghi/xóa session PostgreSQL, `touch` không kéo dài hạn tuyệt đối; lấy `userId` từ dữ liệu session để hỗ trợ thu hồi. |
| `src/auth/access.ts` | Hai `RequestHandler`: `loadCurrentUser` nạp user từ database, kiểm tra active/xác minh/phiên bản mật khẩu; `requireAdmin` bắt buộc quyền admin. |
| `views/auth/login.ejs` | Form SSR, CSRF, email/mật khẩu; hiển thị CAPTCHA theo boolean `captchaRequired` từ server. |
| `views/auth/account.ejs` | Hiển thị trạng thái xác minh và quyền hiện tại; viewer không có nút vào quản trị. |

Trang là đầu mối mount router trong `src/app.ts`. Thứ tự tích hợp: parser → session với PostgreSQL store → tạo locals/CSRF → `loadCurrentUser` → auth router → `requireAdmin` trước các route `/admin` và CRUD → xử lý lỗi. `createAuthRouter` hiện có gắn `createLoginRouter(demo, csrf)`; Trang mount router tổng ở `/auth`, không mount thêm lần nữa.

Ứng dụng cấu hình `express-session` trực tiếp: `store` là MemoryStore trong demo hoặc `new PrismaSessionStore(prisma)` ngoài demo, `rolling=false`, `resave=false`, `saveUninitialized=false`, secret cố định. Cookie `maxAge=2 giờ`; session có `absoluteExpiresAt` chặn việc kéo dài thời hạn ban đầu.

GET/POST `/auth/login` và POST `/auth/logout` là route chính. `/admin/login` chỉ chuyển đến luồng mới, không kiểm tra tài khoản `.env`. POST đổi trạng thái đều phải qua CSRF. Không ghi mật khẩu, mã CAPTCHA hoặc session ID vào log.

## Schema gửi Thuyết tạo migration chung

Bản tích hợp dùng nguyên hai migration đăng ký của Thuyết: `202611060001_add_registration_models` và `202611060002_align_registration_contract`. Phần Vy bổ sung `202611060003_vy_sessions` sau chúng; giữ `User.role` dạng String mặc định `viewer`, `UserStatus` theo schema chung. Khi ghép công việc của nhóm, không tạo thêm migration khác lặp lại cùng bảng/cột.

Migration `202611060004_auth_flow_support` hỗ trợ luồng OTP/reset. Phần Trang hiện được tách trong `src/auth/password-recovery.ts`, tích hợp sau guard chung của router auth; xem [TRANG.md](TRANG.md) để kiểm thử và demo. Không tự rollback hoặc xóa bảng/cột trên database dùng chung.

| Model | Field đề xuất | Chỉ mục/ràng buộc |
|---|---|---|
| `Session` | `sid: String`, `sess: Json`, `expiresAt: DateTime`, `userId: Int?` | `sid` khóa chính; index `expiresAt`, `userId`; liên kết User nếu có, xóa theo User khi tài khoản bị xóa. |
| `LoginAttempt` | `key: String`, `failures: Int`, `windowStartedAt: DateTime`, `lockedUntil: DateTime?`, `updatedAt: DateTime` | `key` khóa chính; index `lockedUntil`. Tách nhóm đếm tài khoản và IP bằng khóa HMAC, không lưu email/IP dạng thô. |

`User.passwordVersion` là đề xuất để thu hồi session sau reset: lưu phiên bản tại thời điểm đăng nhập, so sánh lại trên mỗi request. Trang tăng phiên bản trong cùng transaction đổi mật khẩu; xóa các `Session` có `userId` tương ứng để dọn phiên cũ. Không dựa vào việc xóa cookie ở riêng trình duyệt hiện tại.

## Thông số triển khai đề xuất, chờ nhóm thống nhất

| Nội dung | Mặc định đề xuất |
|---|---|
| Brute force | Cửa sổ 15 phút; sau 3 lần sai yêu cầu CAPTCHA; sau 5 lần sai theo tài khoản hoặc 20 lần sai theo IP tạm khóa 15 phút. Giới hạn phụ 120 POST đăng nhập/IP/15 phút. Bộ đếm nằm trong PostgreSQL. |
| CAPTCHA | Kiểm tra ở server khi chạm ngưỡng; mã có hạn và dùng một lần. CAPTCHA đúng không xóa bộ đếm, không vượt thời gian khóa. |
| Cookie | Chỉ chứa mã session; `HttpOnly=true`, `SameSite=Lax`, `Secure=true` khi production; thời hạn tuyệt đối 2 giờ, không gia hạn trượt. |
| Session | PostgreSQL ngoài demo; secret cố định ít nhất 32 ký tự; `resave=false`, `saveUninitialized=false`; đổi SID lúc login. `TRUST_PROXY_HOPS` chỉ nhận số nguyên 0..5, mặc định 0; chỉ bật trust proxy khi >0, theo số hop proxy thực tế. |
| Logout | Hủy bản ghi session ở server, đợi hoàn tất rồi xóa cookie cùng name/path/cấu hình và chuyển hướng. |
| Quyền | Mặc định viewer; chỉ admin được CRUD. Mã mời chỉ cho đăng ký. Người quản lý chạy `npm run admin:promote -- --email admin@example.com` cho user đã tồn tại, active và đã xác minh; không cấp qua form đăng ký. |

Nhóm cần xác nhận provider CAPTCHA, ngưỡng/cửa sổ khóa, phạm vi public, cookie/session TTL, cách cấp admin và schema cuối cùng. Không coi các giá trị đang chạy là bằng chứng cả nhóm đã đồng ý.

## Kiểm thử và demo tích hợp

1. Pending/chưa xác minh bị từ chối; tài khoản active đăng nhập được; viewer không vượt guard CRUD dù gọi URL trực tiếp.
2. Sai đủ ngưỡng xuất hiện CAPTCHA rồi khóa; thiếu/sai CAPTCHA bị từ chối; CAPTCHA đúng vẫn không vượt khóa, kể cả sau restart server.
3. Đăng nhập đổi SID. Restart server vẫn dùng session còn hạn với PostgreSQL; session hết hạn bị từ chối.
4. Logout xóa session server; gửi lại cookie cũ không truy cập được. Sau reset của Trang, session cũ cũng mất hiệu lực.
5. Request POST thiếu/sai CSRF bị chặn. Kiểm tra cookie trong Application, request trực tiếp và dữ liệu database đã che thông tin nhạy cảm; demo mode không chứng minh xác thực.

Hoàn thành phần Vy không đồng nghĩa phần OTP/email của Thuyết, reset của Trang hoặc nghiệm thu toàn hệ thống đã hoàn tất.

Kiểm thử tự động dùng Prisma fixture và SMTP cục bộ, kèm kiểm tra Chrome với database giả lập. Sau khi người dùng chọn dùng chung database với block-07, đã đối chiếu checksum migration đang áp dụng, bổ sung migration còn thiếu và xác nhận dữ liệu nhà hàng/tài khoản/OTP cũ không đổi. Kiểm tra thật đạt: trang đăng nhập/thực đơn/chi tiết trả 200 ở chế độ không demo, guard quản trị chặn khách, store mới đọc được session PostgreSQL và logout xóa session. Chưa kiểm thử đăng nhập bằng mật khẩu tài khoản thật hoặc gửi email; phần email thuộc Thuyết/Trang.

Tham khảo giao diện Store và cookie: [tài liệu express-session](https://expressjs.com/en/resources/middleware/session/).
