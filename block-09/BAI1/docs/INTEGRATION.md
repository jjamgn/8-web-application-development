# Tích hợp A+B+C local

Nguồn A/B: GitHub main `5ef7427`. Frontend C: working copy local trước khi ghép; đã lưu bản sao source tại thư mục visualization của phiên làm việc. Chỉ đồng bộ Block 9, do nhánh local hiện tại còn các thay đổi Block 7/8 khác.

## Phần nối

- Production adapter: `api/src/lib/auth-production.ts`; app mặc định dùng adapter thật, test vẫn có thể inject port.
- Ánh xạ kết quả service A thành mã lỗi HTTP B; tạo refresh family từ passwordVersion snapshot đã xác thực.
- Quota IP ghi DB trong transaction Serializable, key HMAC, cửa sổ 15 phút.
- POST refresh dùng lookup family cho CSRF trước khi gọi A.rotateRefresh; token đã dùng vẫn tới bước phát hiện reuse và commit revoke.
- Kết quả Turnstile được chia sẻ trong một request để route và service không xác minh hai lần một token dùng một lần.
- Web giữ memory tokens, csrf → refresh → me sau reload, credentials ở cookie endpoints, single-flight và retry một lần.
- API và web mặc định dùng hostname localhost. Giữ toàn bộ tìm kiếm/phân trang; header đăng nhập/đăng ký giữ chỉnh sửa cỡ chữ của C.

## Cấu hình và chạy

Trong `api`, tạo `.env` từ `.env.example` nếu chưa có; điền DATABASE_URL, DIRECT_URL, hai secret riêng JWT_SECRET/AUTH_TOKEN_SECRET, SMTP và TURNSTILE_SECRET_KEY. Trong `web`, tạo `.env` với VITE_API_BASE_URL và VITE_TURNSTILE_SITE_KEY. Không dùng secret API trong biến VITE.

Prisma client đã được generate local. Chưa chạy migration, seed hay thay đổi DB. Migration auth phải áp lên DB phù hợp baseline Block 7; DB đã có Block 8 cần đối chiếu theo bàn giao A trước.

```powershell
# Terminal 1, trong api sau khi cấu hình DB/migration phù hợp
npm run dev
# Terminal 2, trong web
npm run dev
```

SPA: http://localhost:5173 ; API: http://localhost:3000/api .

## Kết quả kiểm tra

- API TypeScript build: pass.
- Web TypeScript/Vite production build: pass.
- API/auth: 52/52 pass, gồm test nối A production service với B HTTP (DB test double), rotation/reuse, CAPTCHA một lần và quota.
- Client auth: 4/4 pass, gồm thứ tự bootstrap, credentials/Bearer, concurrent + late 401, không refresh sau 403, clear memory khi refresh lỗi.
- Hồi quy phân trang/lọc mảng legacy: 2/2 pass. Snapshot nguồn: 1.144 file đối chiếu, không có sai khác ngoài danh sách thay đổi chủ đích.
- Chưa kiểm chứng PostgreSQL/SMTP/Turnstile thật trong lần tích hợp này; các kết quả PostgreSQL cũ của A chỉ là bằng chứng lịch sử.
- npm audit báo Zod đang khóa có advisory GHSA-mrhx-c7xc-m3w5 (high). Bản sửa được npm đề xuất là major 4; chưa tự nâng thư viện vì contract giữ lựa chọn chung của nhóm. API hiện giới hạn JSON 100kb; giới hạn này không thay thế việc xử lý advisory.

Chưa push bản tích hợp lên GitHub.

## Sửa lỗi DB auth local ngày 13/11/2026

DB Supabase đã có các bảng auth Block 8 nhưng thiếu RefreshToken. Login tạo family và reset thu hồi family vì thế gặp lỗi DB; phản hồi HTTP 500 dạng message của API bị client hiểu nhầm thành dữ liệu sai định dạng.

Sau xác nhận của người dùng, đã áp dụng riêng `api/prisma/compat/add-refresh-token-to-block8.sql` trong transaction: thêm RefreshToken, 5 index ngoài khóa chính, 2 foreign key và RLS. Không sửa tài khoản/mật khẩu/dữ liệu món hiện có. Prisma query và kiểm tra index/RLS pass. Không chạy hoặc đánh dấu migration tạo toàn bộ auth là đã áp dụng; lịch sử migration vẫn cần được đối chiếu trước lần migrate deploy sau.

Client đã phân biệt lỗi HTTP kỹ thuật dạng message với phản hồi thành công sai định dạng, giữ HTTP status. Bộ client auth hiện 5/5 pass và web build pass.

## Profile và đổi mật khẩu khi đã đăng nhập — 13/11/2026

Người dùng đã chốt bổ sung /profile và POST /api/auth/change-password. Profile xem thông tin qua /me, đổi mật khẩu bằng currentPassword/password/confirmPassword, có nút hiện/ẩn mật khẩu, về thực đơn và đăng xuất. Header tên tài khoản dẫn tới profile; khách được chuyển tới login.

API yêu cầu Bearer, Origin allowlist và CSRF theo sid, giới hạn 10 POST/IP và 5 lần gửi/user/15 phút. Xác minh mật khẩu cũ bằng bcrypt, recheck hash/version/phiên sau bcrypt. Trong cùng transaction: đổi hash, tăng version, revoke mọi family cũ, tiêu thụ link reset chưa dùng và tạo family mới. Client thay access/CSRF memory, browser nhận refresh cookie mới; thiết bị hiện tại tiếp tục sử dụng. Forgot/reset email vẫn không tự login.

Không thêm dependency hoặc migration DB. Không chạy thao tác đổi mật khẩu trên tài khoản thật để test.

### Chỉnh sửa tên trong profile

Người dùng đã chốt PATCH /api/auth/me với name (trim, 1–120 ký tự). Request yêu cầu Bearer, Origin và CSRF theo sid, quota 30 PATCH/IP/15 phút. UserId lấy từ JWT; chỉ name được cập nhật, không nhận thay email/role/passwordVersion từ client. Service recheck phiên/version trong transaction. Không thay token, mật khẩu hoặc phiên khác.

Profile có nút Chỉnh sửa tên, Lưu tên và Hủy. Lưu thành công cập nhật AuthContext nên header/profile/avatar đổi ngay; user lấy lại qua /me sau reload vẫn mang tên đã lưu. Không thêm migration hoặc thư viện.

Kiểm tra sau bổ sung: API 60/60 pass, client auth 7/7 pass, API/web build pass. Headless Edge với API mock pass name edit/trim/validation/cancel, header/avatar cập nhật ngay và reload giữ tên mới; các luồng đổi mật khẩu/logout cũng pass. Không sửa tên người dùng thật để test.

Kiểm tra: API 57/57 test pass; client auth 7/7 pass; TypeScript API và web production build pass. Headless Edge smoke với API mock pass: guest guard, header link, tên/email, mật khẩu cũ sai, confirmation sai không gửi request, đổi thành công giữ profile và token mới, clear form, hiện/ẩn password, logout server, desktop/mobile không tràn ngang. Ảnh dùng user giả: evidence/profile-desktop.png và evidence/profile-mobile.png. Các test DB adapter là test double, chưa chạy lại PostgreSQL thật cho giao dịch đổi mật khẩu mới.
