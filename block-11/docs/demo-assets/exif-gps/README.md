# Ảnh tự kiểm thử Orientation + GPS

Upload nguyên file **test-sideways-orientation6-gps.jpg**; không mở rồi lưu lại bằng phần mềm chỉnh ảnh.

## Ba ảnh khác nhau thế nào?

| File | Pixels thực trong file | Orientation | Kích thước hiển thị theo EXIF | EXIF/GPS | Vai trò |
| --- | --- | --- | --- | --- | --- |
| test-sideways-orientation6-gps.jpg | 600×1000 | 6 | 1000×600 | Có EXIF và GPS giả lập | **File đầu vào để upload test** |
| raw-pixels-before-exif.png | 600×1000 | Không có | 600×1000 | Không có | Minh họa pixels JPEG khi bỏ qua EXIF; không dùng thay JPEG test |
| expected-after-upload.webp | 1000×600 | Không có | 1000×600 | Không có | Ảnh đầu ra tham chiếu đã chuẩn hóa; không dùng làm đầu vào EXIF test |

Windows Explorer/Photos/browser có thể áp dụng Orientation để tạo thumbnail hoặc báo kích thước hiển thị, nên JPEG và WebP cùng nhìn ngang 1000×600. Điều đó không có nghĩa cả hai lưu pixels theo cùng chiều. Chuẩn hóa làm hướng pixels độc lập với EXIF; không nhất thiết làm hình nhìn trên màn hình đổi chiều vì viewer đã tự sửa hướng từ trước.

## Xem metadata chính xác

Từ `block-11/api/`, chạy:

```powershell
node scripts/inspect-image.mjs
```

Lệnh chỉ đọc cả ba file, in storedPixels, exifOrientation, displayAfterExif, hasExif và GPS. Không gửi ảnh ra mạng hoặc chỉnh file.

Để xem riêng JPEG hoặc một WebP đã tải từ website:

```powershell
node scripts/inspect-image.mjs ../docs/demo-assets/exif-gps/test-sideways-orientation6-gps.jpg
node scripts/inspect-image.mjs "C:/Users/Asus/Downloads/anh-tai-tu-web.webp"
```

Đối chiếu JPEG đầu vào (600×1000, Orientation=6, có GPS) với **WebP thực sự tải từ website**, không chỉ ảnh expected trong thư mục. Variant lớn nhất phải 1000×600, orientation null, hasExif false, gps null; variant nhỏ có chiều rộng 320 hoặc 960 và chiều cao giữ tỉ lệ. Properties → Details trong Windows có thể xem GPS/camera của JPEG, nhưng không nên dùng kích thước thumbnail/Properties làm bằng chứng duy nhất về chiều pixels gốc.

- Pixels nguồn: **600×1000**, chữ/mũi tên đang nghiêng khi bỏ qua EXIF.
- EXIF **Orientation=6**: cần xoay 90° theo chiều kim đồng hồ.
- GPS giả lập: **1°2′3″ N, 4°5′6″ E**, cao độ 12 m. Không phải vị trí người dùng.
- Camera giả lập: BLOCK11 DEMO / TEST CAMERA; thời gian giả lập 2026:01:01 12:00:00.
- Kết quả chuẩn hóa: WebP **1000×600**, TOP / UP ở trên, mũi tên hướng lên, không còn Orientation/EXIF/GPS.

`raw-pixels-before-exif.png` chỉ minh họa pixels chưa được xoay, không chứa EXIF và không phải file chính để upload. Trình xem ảnh/browser có thể tự áp dụng EXIF nên nhìn JPEG đã đúng chiều trước upload; phải so raw pixels, kích thước và metadata thay vì chỉ nhìn preview.

Đã kiểm tra trực tiếp GPS IFD trong TIFF/EXIF và chạy JPEG qua prepareImage thật, xác nhận WebP bỏ toàn bộ EXIF. Chưa tự upload vào tài khoản người dùng. Xem metadata-and-verification.json và expected-after-upload.webp.
