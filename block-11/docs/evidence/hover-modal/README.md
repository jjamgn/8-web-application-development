# Bố cục hover và cửa sổ chi tiết — 27/11/2026

**Cập nhật tác giả/tải ảnh 27/11/2026:** avatar + tên người đăng nằm trong lớp hover, chi tiết luôn hiện avatar/tên; Tải WebP có dropdown gắn liền, chọn size tải ngay. DTO uploader bổ sung avatarUrl công khai/null; không đổi schema/env. Xem [quy cách và kiểm chứng](../author-download/README.md). Các mô tả bố cục cũ bên dưới được thay thế bởi bản cập nhật này.

Theo yêu cầu người dùng, cập nhật giao diện sau phần [hồ sơ/xã hội](../social-profile/README.md). Không thay API, schema hoặc dữ liệu ảnh.

## Hành vi đã đổi

- Card không còn ba nút nằm dưới caption. Tim và lưu là icon ở góc phải trên ảnh; Tải WebP ở góc phải dưới. Chỉ hiện khi hover đúng vùng ảnh hoặc focus bằng bàn phím. Chạm/cảm ứng không có hover thì luôn hiện để thao tác được. Link mở ảnh và các nút là phần tử riêng, không lồng button trong link.
- Caption và tên tác giả vẫn ở dưới ảnh. Nút Gỡ khỏi bộ, khi đang xem bộ sưu tập, cũng nằm trong lớp phủ ảnh. Thông báo lỗi/thành công vẫn đọc được; dialog chọn bộ không bị ẩn khi chuột rời ảnh.
- Tim dùng SVG outline/filled theo trạng thái; lưu là SVG bookmark, có nhãn truy cập. Không dùng emoji làm icon.
- Chi tiết có tim/lưu bên trái; chọn kích thước và Tải WebP nằm bên phải. Bỏ mũi tên xuống trước chữ Tải WebP. Màn hình nhỏ cho nhóm tải xuống xuống dòng và căn phải.
- Native dialog bao phủ viewport làm vùng nền tối; panel trắng bên trong bo tròn 24px (18px trên mobile), phần nội dung cuộn riêng để cả bốn góc không mất khi cuộn.
- Nút × cố định ở nền tối góc trái trên. Điều hướng dùng icon chevron trái/phải ở hai bên nền tối, giữa chiều cao viewport; không còn nút chữ trong trang trắng. Hai nút có aria-label, disabled ở đầu/cuối danh sách đã tải. Đóng/Esc/Back và giữ scroll/feed hoạt động như trước.

## Album / bộ sưu tập

`/photos` vẫn là thư viện công khai của mọi ảnh PHOTO đã công bố. Upload không bắt buộc chọn album. Bộ sưu tập là danh sách riêng tư do người dùng tạo bằng nút Lưu hoặc Hồ sơ → Bộ sưu tập; một ảnh có thể được lưu vào nhiều bộ, không sao chép object trong SeaweedFS và vẫn xuất hiện trong thư viện chung. Chưa có album công khai hoặc tự phân loại chủ đề.

Tại lúc kiểm tra DB trong lượt chỉnh này: **14 ảnh công khai, 0 bộ sưu tập, 0 liên kết ảnh vào bộ**. Đây là snapshot, không phải giá trị cố định của ứng dụng. Không tạo bộ hoặc chuyển ảnh thay người dùng.

## Kiểm chứng

- Web production build đạt; **42/42 UI tests** đạt, gồm 3 test mới kiểm hover/focus, vị trí các control nằm ngoài panel, căn phải nhóm tải xuống, bo góc, chuyển ảnh, thiết bị cảm ứng và không tràn nội dung mobile.
- `ui-results.json` là báo cáo Playwright mock. Đã xem `gallery-hover.png`, `modal-desktop.png` và `modal-mobile.png` để kiểm bố cục. Các ảnh minh họa trong screenshot là fixture, không phải dữ liệu người dùng thật.
- Kiểm tra chỉ đọc trên LAN thật tại máy chủ được ghi trong `lan-results.json`: hover, đóng ngoài panel, chuyển ảnh, Esc về thư viện và lỗi JavaScript. Không tạo/xóa ảnh/tài khoản hoặc thay DB. Chưa kiểm trực tiếp từ thiết bị vật lý thứ hai.
- Các kết quả backend 73/73 và smoke avatar/SeaweedFS trong báo cáo trước giữ nguyên phạm vi lịch sử; lượt này không chạy lại backend vì chỉ thay giao diện.

Chạy web và đổi IP theo [LAN_SETUP.md](../../LAN_SETUP.md). Dùng link LAN hiện tại để đăng nhập/upload theo APP_ORIGIN đã cấu hình.
