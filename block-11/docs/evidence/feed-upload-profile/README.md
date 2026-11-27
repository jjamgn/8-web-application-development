# Thay đổi feed, upload kéo thả và hồ sơ — 27/11/2026

## Phạm vi

Theo yêu cầu người dùng, giao diện thư viện thay nút trang trước/sau bằng Xem thêm ảnh (API vẫn pageSize 12), có bộ đếm và skeleton. Giữ ảnh/cuộn khi quay về từ chi tiết; cache trong tab, reload bắt đầu lại. Upload thêm drop zone lấy cảm hứng bố cục trong ảnh tham khảo [Pexels Upload](https://www.pexels.com/upload/), giữ nguyên metadata/EXIF và quy trình submit. Header dẫn vào hồ sơ cá nhân /profile; backend hỗ trợ mine=true từ session.

Hướng dẫn demo: mở thư viện → Xem thêm → cuộn → chi tiết → quay về; vào Đăng ảnh → kéo thả JPEG/PNG → điền title/alt → đăng; bấm tên tài khoản → xem ảnh của bạn. Địa chỉ LAN và khởi động: [LAN_SETUP.md](../../LAN_SETUP.md).

## Kiểm thử

- Build API và web đạt.
- Backend: 72/72 tests đạt, gồm profile filter cần session, chỉ trả ảnh đúng chủ, tổng/phân trang, query sai và logout.
- UI mock: 33/33 tests đạt trên Chrome. Lượt kiểm tra tập trung sau chỉnh bảo toàn cache/scroll đạt 10/10, ghi riêng trong targeted-results.json.
- LAN thật tại máy chủ: ban đầu 12 ảnh → tải thêm thành 14 → xem chi tiết → quay về vẫn 14 ảnh và đúng scroll; bộ đếm “Đã hiển thị 14/14 ảnh”; khách gọi mine=true nhận 401; không có JavaScript error. Không kiểm từ thiết bị thứ hai trong lượt này.
- Đã xem screenshot upload desktop/mobile và profile. Ảnh profile/upload là mock UI; gallery-lan.png dùng ảnh thật hiện có của người dùng, chỉ lưu local, không đưa vào bằng chứng Git.

 UI mock không chứng minh dữ liệu Supabase/SeaweedFS; test backend dùng persistence test doubles hoặc PostgreSQL nhúng. Không tạo/xóa ảnh người dùng thật trong lượt này. Không thay migration/schema DB.

## Hạn mức upload ngày

Đề xuất 50 ảnh thành công/người/ngày khi mở rộng; chưa chốt hoặc bật hạn mức ngày. Vẫn áp dụng 1–5 file/lượt, 10 MiB/file, 40 triệu pixel/file và 55 MiB/body. Chi tiết quyết định và phần còn ngoài phạm vi xem [contract](../../../BLOCK11_CONTRACT.md).
