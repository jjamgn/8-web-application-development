# Video demo Block 11

Bộ 6 video do nhóm cung cấp, xuất bản ngày 28/11/2026. Bấm tên video để mở; nếu GitHub không phát trực tiếp, chọn tải file MP4 để xem.

| STT | Video | Thời lượng (làm tròn) | Dung lượng | Luồng nội dung |
| --- | --- | --- | --- | --- |
| 1 | [Yêu cầu đăng nhập trước khi upload](01-upload-yeu-cau-dang-nhap.mp4) | 00:19 | 0.74 MiB | Mở upload khi chưa đăng nhập → đăng nhập → vào form đăng ảnh. |
| 2 | [Upload và chuẩn hóa ảnh theo EXIF](02-upload-va-chuan-hoa-anh-theo-EXIF.mp4) | 01:55 | 4.32 MiB | Chọn ảnh raw không EXIF và JPEG Orientation=6 → điền thông tin → đăng → so sánh trước/sau và xem response. |
| 3 | [Gallery responsive và chọn variant](03-gallery-responsive-va-chon-variant.mp4) | 00:57 | 1.46 MiB | Mở gallery → xem WebP/Response Headers trong Network → đổi viewport → quan sát variant tải về. |
| 4 | [Restart và lưu bền vững](04-restart-va-luu-ben-vung.mp4) | 01:35 | 2.58 MiB | Mở ảnh và giữ URL → dừng/khởi động dịch vụ → mở lại URL → ảnh tiếp tục hiển thị. |
| 5 | [Phân quyền và xóa ảnh](05-phan-quyen-va-xoa-anh.mp4) | 01:14 | 3.38 MiB | So sánh giao diện chủ ảnh/tài khoản khác → chủ ảnh xóa → kiểm tra danh sách và URL cũ trả trang 404. |
| 6 | [Các tính năng bổ sung](06-tinh-nang-them-nhom-quyet-dinh.mp4) | 02:42 | 5.75 MiB | Tìm kiếm → tim/lưu bộ sưu tập → tải WebP theo kích thước → profile/avatar → hồ sơ công khai và theo dõi. |

Tổng dung lượng bản nộp: **18.24 MiB**, giảm từ khoảng 517 MiB.

## Quy cách bản nộp

- MP4, H.264, 15 fps, CRF 24; AAC 96 kbit/s; giữ nguyên độ phân giải và toàn bộ thời lượng, không cắt luồng thao tác. Có faststart và bỏ metadata container.
- Video 03 che vùng Request Headers phía dưới bên phải xuyên suốt để không công khai cookie phiên đăng nhập; phần gallery, đổi viewport và Response Headers phía trên vẫn giữ lại.
- Bản gốc trong thư mục video-demo của checkout local ban đầu được giữ nguyên; các file trên GitHub là bản nén dành để nộp.
- Đã kiểm tra giải mã toàn bộ 6 file bằng FFmpeg, không có lỗi. Đã xem các khung hình mẫu; việc này không thay nghiệm thu chi tiết mọi thao tác trong video.

Video minh họa thao tác trên giao diện/dịch vụ. Các kết luận về chunk, hash, DB và rollback xem [báo cáo kiểm chứng kỹ thuật](../02-kiem-chung-ky-thuat.md); không suy ra toàn bộ yêu cầu E01–E20 chỉ từ tên video.
