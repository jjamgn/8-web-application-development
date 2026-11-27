# Preview pixels gốc và kết quả EXIF sau upload

Ngày 27/11/2026. Đã thêm so sánh vào mỗi ảnh trên trang upload, không đổi API hoặc file gốc gửi qua multipart.

- Khung trái đọc JPEG SOF/PNG IHDR để lấy kích thước pixels gốc, đọc Orientation và dấu hiệu GPS IFD. Tạo Blob chỉ dùng hiển thị đã bỏ EXIF APP1/eXIf, để browser không tự áp dụng orientation. Có giới hạn dung lượng/pixel trước khi tạo preview; không đọc ảnh vượt giới hạn để demo.
- File gốc vẫn ở state và được append vào FormData nguyên vẹn; không gửi Blob preview. Test kiểm chứng SHA-256 của File trong FormData khớp fixture JPEG gốc.
- Khung phải chỉ xuất hiện khi result của file thành công, dùng URL variant WebP thật do API trả. Không dùng ảnh dự đoán hoặc rotate CSS để giả kết quả xử lý server.
- Ảnh không có orientation khác hướng mặc định được giải thích là có thể không đổi chiều. File giả/hỏng vẫn có thể gửi để thử server; preview thất bại không giả là ảnh đã được chuẩn hóa.

## Kiểm chứng

| Lệnh tại web/ | Kết quả |
| --- | --- |
| npm run build | Đạt |
| npm run test:e2e | **30/30**, gồm raw EXIF preview, giữ nguyên bytes upload, lấy ảnh sau từ media và mobile không tràn |
| npm run test:e2e:integration | **2/2**, luồng A+B+C thông thường và EXIF trước/sau qua Express/auth/upload/sharp/PhotoService/media thật; DB/S3 dùng test double |

Test EXIF qua API thật trong môi trường controlled xác nhận pixels nguồn 600×1000, kết quả 1000×600; GET media decode là WebP, không còn Orientation hoặc EXIF. Không dùng mock UI để khẳng định đã ghi DB/S3 cloud trong lượt này; live suite có thêm case EXIF để chạy opt-in khi cần.

- `before-after-exif.png`: screenshot UI fixture để kiểm tra bố cục.
- `before-after-controlled-api.png`: screenshot WebP do pipeline thực xử lý; dữ liệu DB/S3 vẫn cô lập trong test double.

Các báo cáo 28 UI/1 controlled trước đó giữ làm lịch sử; lượt này là 30/2 vì đã bổ sung hai UI test và một controlled case. Backend không đổi trong lượt này.
