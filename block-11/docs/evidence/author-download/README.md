# Người đăng ảnh và nút tải tích hợp — 27/11/2026

Thực hiện theo yêu cầu người dùng sau lượt [hover/modal](../hover-modal/README.md). Không thay schema hoặc dữ liệu.

## Giao diện

- Avatar tròn và tên người đăng nằm ở góc trái dưới ảnh, cùng lớp hover/focus với tim/lưu/tải. Bỏ tên tác giả dưới caption. Trên thiết bị cảm ứng lớp thao tác vẫn hiện. Link avatar/tên mở hồ sơ công khai, không mở modal ảnh.
- Trong chi tiết/modal, avatar và tên luôn hiện cạnh nhau; ngày đăng hiển thị riêng bên cạnh. Không còn tiền tố “Ảnh của”. Người chưa có avatar, avatar ẩn hoặc tải ảnh lỗi dùng chữ cái tên làm biểu tượng thay thế.
- Nút Tải WebP có hai vùng liền nhau. Phần chữ là link tải variant lớn nhất hiện có (mặc định); chevron mở menu kích thước, không tự tải.
- Bấm một kích thước tải ngay file WebP tương ứng và đóng menu. Không cần bấm nút tải lần nữa. Chọn size nhỏ không thay đổi mặc định của phần chữ: lần sau phần chữ vẫn tải bản lớn nhất.
- Menu chỉ liệt kê variant thật, có kích thước và dung lượng. Không cung cấp file nguyên gốc. Menu dùng native popover nằm trên panel nên không bị vùng cuộn/bo góc cắt mất; giữ trong viewport khi resize/cuộn.
- Keyboard: ArrowDown ở chevron mở menu, Up/Down/Home/End chuyển mục, Enter chọn tải, Esc đóng menu và trả focus về chevron mà không đóng modal ảnh. Click bên ngoài đóng menu. Có aria-label/expanded/controls và role menu/menuitem.

## DTO và dữ liệu

`PhotoDto.uploader` mở rộng thành `{id,name,avatarUrl?:string|null}`. Backend hiện luôn trả avatarUrl (URL media công khai hoặc null); optional để tương thích fixture/client cũ. Auth UserDto `/me` vẫn `{id,name}`.

Repository lấy avatar tham chiếu của uploader cùng dữ liệu ảnh, chọn variant avatar lớn nhất còn PUBLISHED. Chỉ xuất id/name/avatarUrl; không serialize email/passwordHash/quan hệ nội bộ. Không có request hồ sơ riêng cho mỗi card chỉ để lấy avatar. Thay avatar/hồ sơ đã làm mất hiệu lực cache feed theo cơ chế hiện có.

Media/download endpoint không đổi: `/media/photos/:id/:width.webp?download=1`, vẫn ghép/kiểm hash trên server và Content-Disposition attachment. Không đưa URL S3 hoặc storage key vào UI.

## Kiểm chứng

- Build API/web đạt. Backend **74/74**: có test mapper whitelist dữ liệu tác giả và trả null khi avatar không PUBLISHED.
- UI **45/45 đạt**, gồm 3 bài mới về avatar hover/detail, download mặc định/chọn size tải ngay, bàn phím/Esc và viewport mobile. Kết quả cuối ở `ui-results.json`.
- Đã xem `author-hover.png`, `download-menu-desktop.png`, `download-menu-mobile.png`; đây là mock UI, không phải ảnh người dùng thật.
- Kiểm tra chỉ đọc trên LAN thật nằm ở `lan-results.json`: field avatar trong DTO, tác giả trong modal, download mặc định và chọn size. Đọc metadata file tải bằng sharp xác nhận WebP thực: mặc định 1000px, chọn 320px nhận đúng 320px, không có lỗi JavaScript. Không tạo/xóa tài khoản, ảnh hoặc bộ sưu tập trong lượt này.
- Chưa kiểm từ thiết bị vật lý thứ hai; không thay thế các bằng chứng restart/outage/HTTPS của rubric.

Khởi động theo [LAN_SETUP.md](../../LAN_SETUP.md). Không cần đổi env hoặc chạy migration.
