# Đồng bộ ảnh mới - 30/10/2026

## Nguyên nhân đã xác nhận

API hiện trả đường dẫn mới, ví dụ món #746 có `imagePath` và `imageUrl` cùng là `/images/sourced/dish-746.png`. Đây là đường dẫn file local; lưu đường dẫn trong database không tự chuyển file ảnh sang máy frontend.

- `web/public/images/` và `api/public/images/` trên máy chỉ có 8 ảnh cũ, không có thư mục sourced.
- URL frontend `/images/sourced/dish-746.png` trả HTML fallback của SPA, không phải nội dung ảnh.
- URL backend tương ứng trả 404. Hai đường dẫn sourced/images-sourced đã đối chiếu trong bucket đang cấu hình cũng không trả ảnh.
- Đã kiểm tra Git local và đối chiếu remote: `origin/feature/search-api` ở 61e19c1 và `origin/main` ở 76ee8af chưa chứa bộ ảnh sourced.
- Khi img bị lỗi, frontend cũ thay src bằng `/images/beef.png`, khiến nhiều món mới có cùng ảnh món bò cũ.

## Phần frontend đã sửa

- `imageSource()` ưu tiên imageUrl hiện tại của API. Không thay URL mới bằng bản local chỉ vì imagePath có tên seed cũ.
- `DishImage` dùng chung cho card, chi tiết và bảng quản trị; URL mới vẫn được thử lại khi nguồn ảnh thay đổi.
- Ảnh không tải được hiển thị placeholder trung tính “Ảnh chưa khả dụng”, không tự dùng ảnh món khác.
- Form còn cho phép người quản trị chủ động chọn ảnh mặc định; lựa chọn này khác với fallback tự động khi ảnh dữ liệu bị lỗi.
- Build frontend thành công, 8/8 nhóm smoke PASS; ca mới kiểm tra URL mới thắng seed path cũ, thiếu file hiện placeholder, và URL mới tải được sau một lần lỗi.

## Việc còn thiếu để hiển thị ảnh thật

Cần nguồn bộ file `dish-*.jpg/png/webp` do người cập nhật dữ liệu tạo. Đã hỏi người dùng vị trí thư mục/nhánh/bucket; chưa có câu trả lời khi ghi báo cáo này.

Nếu giữ path database hiện tại, đặt đúng file vào `web/public/images/sourced/` rồi build/deploy frontend cùng assets. Nếu bộ ảnh được lưu ở Storage, backend phải trả URL công khai tương ứng trong imageUrl; không chỉ trả một path local không có file.

Chưa ghi đè dữ liệu DB, chưa tạo hoặc tải ảnh thay thế từ nguồn khác. Phần hiển thị ảnh thật chưa hoàn tất vì thiếu assets gốc.
