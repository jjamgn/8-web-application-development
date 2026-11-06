# Block 08 — Phần Vy: đăng nhập, session và bảo vệ CRUD

Bản này tái sử dụng nền nhà hàng SSR của Block 05 và đọc tài khoản từ bảng `User` có sẵn của Thuyết. Phần triển khai mới gồm đăng nhập, logout, session PostgreSQL, chống brute force và middleware kiểm tra quyền trên server.

Đăng ký, gửi/xác minh OTP, gửi email và quên/reset mật khẩu không nằm trong bản bàn giao này. Các router đó do Thuyết/Trang tích hợp riêng.

## Chạy ứng dụng

Yêu cầu Node.js 20.14 trở lên. Tại thư mục `block-08`:

```powershell
npm ci
Copy-Item .env.example .env # Chỉ thực hiện nếu chưa có .env.
npm run admin:setup
```

Điền `DATABASE_URL` và `DIRECT_URL` của database phát triển trong `.env`. Database phải có bảng `User` và enum `UserStatus` từ module của Thuyết trước khi áp dụng migration session của Vy. Bản này không cung cấp migration tạo tài khoản/OTP hoặc database tài khoản độc lập. Lệnh `admin:setup` chỉ tạo session secret khi thiếu, không tạo user và không cấp quyền admin. Giữ secret ổn định khi restart server. Nếu dùng ảnh nhà hàng trên Supabase, cấu hình thêm Storage theo `.env.example`; không đưa service key ra trình duyệt.

```powershell
npm run config:check
npm run db:generate
npm run db:migrate
npm run dev
```

- Thực đơn công khai: http://localhost:3000/dishes
- Đăng nhập: http://localhost:3000/auth/login
- Quản trị: http://localhost:3000/admin/dishes

Đăng nhập bằng tài khoản đã được luồng của Thuyết kích hoạt: `status=active`, có `emailVerifiedAt`, mật khẩu bcrypt. `viewer` vào trang thông tin tài khoản và nhận 403 khi gọi CRUD; chỉ `role=admin` được quản trị. Không còn đăng nhập bằng email/password hash cấu hình trong `.env`.

Người quản lý có thể cấp quyền riêng cho một tài khoản **đã tồn tại, active và đã xác minh**:

```powershell
npm run admin:promote -- --email admin@example.com
```

Lệnh không tạo tài khoản, không đổi mật khẩu và không bỏ qua xác minh. Các session cũ bị thu hồi và người dùng phải đăng nhập lại.

`DEMO_MODE=true` chỉ cho xem thực đơn mẫu; đăng nhập và URL quản trị vẫn được kiểm tra trên server. Chế độ demo không thay thế xác thực.

## Session, cookie và chống brute force

- Session lưu trong bảng `Session`, có `userId`, hạn tuyệt đối 2 giờ; cookie chỉ chứa mã session đã ký.
- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` trong production; đổi SID khi đăng nhập và hủy bản ghi ở server khi logout.
- Bộ đếm sai lưu trong `LoginAttempt` theo khóa HMAC của email/IP. Từ 3 lần sai yêu cầu CAPTCHA; 5 lần sai/tài khoản hoặc 20 lần sai/IP khóa 15 phút. CAPTCHA đúng không xóa bộ đếm và không vượt thời gian khóa.
- Giới hạn phụ 120 POST đăng nhập/IP/15 phút. Các ngưỡng là mặc định triển khai để nhóm review.
- Mỗi request đọc lại trạng thái/role/`passwordVersion` từ database. Role gửi từ form không cấp quyền; session cũ sau đổi mật khẩu bị từ chối.
- PostgreSQL lỗi thì request bị chặn với trang lỗi chung; không trả thông tin kết nối hoặc stack trace.

Production cần HTTPS. Chỉ cấu hình `TRUST_PROXY_HOPS` theo số hop proxy thực tế (0..5); mặc định 0 không tin header proxy do client tự gửi.

## Schema và tích hợp

Migration đăng ký/OTP do Thuyết bàn giao và triển khai riêng; không có trong commit này. Schema Prisma chỉ khai báo hợp đồng `User` cần cho đăng nhập và các model của Vy, không quản lý bảng OTP. Không dùng `prisma db push` từ schema từng phần này. `202611060003_vy_sessions` bổ sung session, bộ đếm và metadata cho việc thu hồi phiên trên bảng `User` đã tồn tại. Quan hệ chuyên môn đầu bếp dùng migration chung đã có `202610300002_normalize_chef_specialties` để tương thích database nhà hàng; không chạy seed/reset để sửa database dùng chung.

Hướng dẫn ghép router và hợp đồng giữa các thành viên: [docs/VY.md](docs/VY.md).

## Kiểm thử

```powershell
npm run build
npm test
```

Tests dùng Prisma fixture và Storage giả lập, không kết nối database thật hoặc gửi email. Bao phủ SSR/CRUD, active/verified/role, CSRF, CAPTCHA, khóa đăng nhập, cookie production, khôi phục session qua store mới, logout chống phát lại và request đồng thời không khôi phục phiên đã bị hủy.
