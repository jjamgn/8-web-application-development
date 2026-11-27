# Bộ ảnh demo EXIF orientation

Ảnh kiểm thử tổng hợp được tạo ngày 27/11/2026; không chứa dữ liệu cá nhân/GPS. Chữ TOP / UP và mũi tên giúp nhận biết hướng mong muốn.

| File | Mục đích và kết quả upload mong đợi |
| --- | --- |
| `01-upright-no-exif.jpg` | Ảnh ngang 1000×600 không EXIF, hướng đúng; sau upload giữ ngang. |
| `02-exif-orientation-6.jpg` | Pixels lưu dọc 600×1000, EXIF Orientation=6 yêu cầu xoay 90° theo chiều kim đồng hồ; sau upload pixels phải ngang 1000×600 và mất EXIF. **Dùng file này để demo auto orientation.** |
| `02-raw-pixels-preview.png` | Minh họa pixels của file 02 khi bỏ qua EXIF; không phải file chính cần upload. |
| `02-expected-after-upload.webp` | Kết quả thực tế từ prepareImage: chữ TOP / UP nằm trên, mũi tên hướng lên; không còn EXIF. |
| `03-sideways-no-exif.jpg` | Pixels bị xoay sang dọc, không có orientation để phục hồi; sau upload vẫn nghiêng. Đây là đối chứng, không phải lỗi auto orientation. |

Tải/chọn nguyên file `02-exif-orientation-6.jpg`; không mở bằng trình sửa ảnh rồi Save/Export lại, vì phần mềm có thể xoay pixels và xóa EXIF. Browser/Photos có thể tự đọc EXIF nên nhìn file 02 đúng hướng ngay cả trước upload; điều cần chứng minh là **pixels và kích thước đã được chuẩn hóa, EXIF được loại bỏ**.

Đã chạy file 02 qua đúng `api/src/images/prepare-image.ts`: nguồn 600×1000/Orientation 6 → WebP 1000×600/không EXIF; sai khác pixel trung bình so ảnh ngang tham chiếu dưới 1 mức màu/255 do nén. Xem `verification.json`. Đây là kiểm chứng pipeline, chưa tự upload các ảnh mẫu vào tài khoản người dùng.

Trong demo, upload file 02 rồi xem API Photo width/height 1000×600, variant lớn nhất 1000×600; tải variant về đọc metadata để xác nhận không còn Orientation/EXIF. Không kỳ vọng hệ thống đoán chiều nội dung từ ảnh đã xoay pixels nhưng không có EXIF (file 03).
