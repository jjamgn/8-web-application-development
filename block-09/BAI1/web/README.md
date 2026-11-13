# Frontend Block 9 — Bài 1 (CSR)

Đây là working copy lấy từ frontend Block 7 để giữ tìm kiếm và phân trang. Chạy `pnpm dev` (hoặc `.\pnpm.cmd dev` trên máy Windows này); Vite và API mặc định dùng hostname `localhost` để cookie hoạt động cùng site.

## Cấu hình

Sao chép `.env.example` thành `.env`, sau đó cấu hình:

- `VITE_API_BASE_URL`: địa chỉ API, mặc định `http://localhost:3000/api`. Nếu đổi SPA sang `127.0.0.1`, hãy đổi URL API sang cùng hostname.
- `VITE_TURNSTILE_SITE_KEY`: site key công khai của Turnstile. Secret key chỉ được cấu hình ở API, không đưa vào web.

## Chức năng CSR

- Đăng ký, kích hoạt email bằng OTP, đăng nhập, quên và đặt lại mật khẩu theo `../../BAI1_CONTRACT.md`.
- Trang /profile: bấm tên tài khoản ở header để xem tên/email, avatar chữ cái đầu, chỉnh sửa tên (Lưu/Hủy) và đổi mật khẩu bằng mật khẩu cũ/mới/xác nhận. Lưu tên cập nhật ngay profile/header và giữ phiên đăng nhập. Đổi mật khẩu thành công giữ phiên mới trên thiết bị hiện tại và yêu cầu các thiết bị khác đăng nhập lại.
- Access token và CSRF token chỉ nằm trong memory. Refresh token do trình duyệt gửi trong cookie HttpOnly; sau reload, web gọi `/api/auth/csrf` rồi `/api/auth/refresh` để khôi phục phiên.
- API client tự refresh một lần cho nhóm request cùng nhận 401 rồi retry từng request gốc tối đa một lần. Đăng xuất gọi API để thu hồi family.
- Trang món giữ tìm kiếm và phân trang từ Block 7; GET dishes vẫn dùng được khi chưa đăng nhập. Các thao tác quản trị cần phiên đăng nhập.

## Chức năng món ăn được kế thừa

- Thực đơn Load More, Khám phá Infinite Scroll, quản trị món/nguyên liệu Page Numbers.
- Skeleton khi tải; ảnh thiếu dùng placeholder trung tính.
- Form món tìm/chọn đầu bếp theo tên/chuyên môn không dấu; tìm/chọn nhiều nguyên liệu và nhập số lượng.
- Search món ưu tiên khớp chuỗi và full-text; fuzzy chỉ là fallback khi không có kết quả. URL/reload giữ điều kiện và trang số. Tải thêm giữ cùng search mode.
- Dishes ưu tiên `{items,total,page,pageSize}` và tương thích mảng API cũ. Ingredients nhận dữ liệu phân trang hoặc mảng cũ.
- Ghi công thức cần backend nhận `ingredients:[{ingredientId,quantity}]` trong POST/PATCH dishes. Bỏ trường khi PATCH nghĩa là giữ công thức; mảng rỗng nghĩa là xóa quan hệ của món.
- Ảnh upload cần POST `/api/uploads/dishes` nhận FormData/file và trả `imagePath`/`imageUrl`; JSON món cần nhận `imagePath`.
- Search không dấu cho món cần backend chuẩn hóa cả dữ liệu và từ khóa trước fuzzy/tsquery.

Backend của working copy cần khớp endpoint, payload, envelope, status và mã lỗi ở contract nhóm. Các ghi chú Block 7 chỉ mô tả phần giao diện kế thừa; contract Block 9 là chuẩn tích hợp cho Bài 1.

Kiểm tra client: npm run test:auth. Smoke profile: npm run test:profile khi web dev đang chạy; dùng Playwright cài sẵn hoặc đặt PLAYWRIGHT_MODULE tới file entry của runtime Playwright. Smoke mock toàn bộ API, không đổi mật khẩu tài khoản thật.
