# Frontend Block 7

Chạy `pnpm dev` (hoặc `.\pnpm.cmd dev` trên máy hiện tại), API công khai mặc định http://localhost:3000/api. Build bằng `pnpm build`.

## Chức năng

- Thực đơn Load More, Khám phá Infinite Scroll, quản trị món/nguyên liệu Page Numbers.
- Skeleton cho loading; ảnh thiếu dùng placeholder trung tính.
- Form món tìm/chọn đầu bếp theo tên/chuyên môn không dấu; tìm/chọn nhiều nguyên liệu và nhập số lượng.
- Search món ưu tiên fuzzy; URL/reload giữ điều kiện và trang số. Tải thêm giữ cùng search mode.
- Giữ lọc đơn vị nguyên liệu từ main.

## Hợp đồng tích hợp backend

- Dishes ưu tiên `{items,total,page,pageSize}`; có tương thích mảng từ API cũ.
- Ingredients nhận `{items,total,page,pageSize}` từ API mới; nếu API trả mảng, frontend tìm/lọc toàn bộ mảng trước khi chia trang. Lọc đơn vị dùng danh sách đầy đủ khi API chưa hỗ trợ filter này.
- GET /chefs trả mảng; bộ chọn đầu bếp hiện lọc frontend trên danh sách đó.
- Ghi công thức cần backend nhận `ingredients:[{ingredientId,quantity}]` trong POST/PATCH dishes. Bỏ trường khi PATCH nghĩa là giữ công thức; mảng rỗng nghĩa là xóa quan hệ của món.
- Ảnh upload cần POST /api/uploads/dishes nhận FormData/file và trả imagePath/imageUrl; JSON món cần nhận imagePath.
- Search không dấu cho món cần backend chuẩn hóa cả dữ liệu và từ khóa trước fuzzy/tsquery.

Các API mở rộng nói trên có trong backend local của chat nhưng chưa được commit cùng frontend. Lần merge frontend vào main giữ nguyên API đang có trên main; phía backend cần bàn giao các contract này để lưu công thức/upload/tìm món không dấu hoạt động đầy đủ. GET ingredients dạng mảng cũ vẫn dùng được với frontend này.

## Kiểm tra

`tests/smoke.mjs` dùng Playwright/Edge, fixture chỉ ở test; đặt PLAYWRIGHT_MODULE nếu dùng runtime ngoài dependency dự án. Không dùng fixture làm bằng chứng DB. Bản merge được kiểm tra cả response nguyên liệu dạng mảng cũ và dạng phân trang mới.
