# Upload gọn và sửa lỗi Origin khi lưu avatar — 27/11/2026

## Giao diện

- So sánh trước/sau xử lý mặc định đóng. Mỗi ảnh có nút disclosure “Xem so sánh trước/sau xử lý”; mở/ẩn độc lập, dùng được cả sau khi upload thành công. Chỉ khi mở mới mount preview, đọc pixels/EXIF và tạo object URL; đóng thì thu hồi preview. File gốc, metadata và pipeline server không đổi.
- Tiêu đề và mô tả thay thế đều có dấu `*`, giải thích trường bắt buộc và thuộc tính HTML required. Accessible label giữ nguyên để trình đọc màn hình và kiểm thử xác định đúng trường.
- Nút “Tải avatar mới” nằm cạnh “Chỉnh sửa hồ sơ” ở header của chính chủ. Chọn file tự mở editor, hiển thị preview/tên file và trạng thái chưa lưu; bấm “Lưu thay đổi” để gửi. Không còn file picker phía dưới form. Nút bị khóa lúc đang lưu.
- Khi tên/bio đã lưu nhưng avatar thất bại, thông báo nêu rõ phần đã lưu; không báo thành công toàn bộ hoặc tự gửi lại mutation.

## Nguyên nhân lỗi và bản sửa

Ảnh chụp dùng `http://localhost:5173`, trong khi cấu hình máy lúc đó chỉ chấp nhận APP_ORIGIN LAN `http://192.168.100.154:5173`. Guard kiểm tra cả Origin và token, nhưng trước đây mọi lỗi đều trả CSRF_INVALID nên người dùng nhận nhầm thông báo phiên xác nhận.

- Giữ APP_ORIGIN LAN và NODE_ENV development; bổ sung cấu hình explicit `ADDITIONAL_APP_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` trong hai env local (ignored).
- Danh sách chỉ chứa URL http/https cụ thể, tối đa 5 origin phụ; so khớp chính xác origin, không tự tin Host/Origin từ request và không bật wildcard. Tất cả auth/photo/social mutation dùng cùng guard.
- Production không được cấu hình origin phụ khác rỗng: validation từ chối để production tiếp tục dùng một APP_ORIGIN duy nhất. Không đưa danh sách dev lên production.
- Origin không được phép trả 403 ORIGIN_NOT_ALLOWED với thông báo địa chỉ chưa được cho phép. Token sai/thiếu/hết hạn vẫn 403 CSRF_INVALID; vẫn kiểm tra phiên, token, Origin và quyền chủ sở hữu. Không tự retry mutation.
- Đã restart API để áp dụng env. localhost, 127.0.0.1 và IP LAN là các origin có cookie/phiên riêng; có thể cần đăng nhập riêng khi đổi địa chỉ. Máy khác vẫn dùng IP LAN của máy chủ, không dùng localhost của máy khác.

## Kiểm chứng

- Build API/web đạt. Backend 76/76: kiểm tra ba origin hợp lệ đi qua CSRF khi token đúng, origin lạ/token sai tiếp tục bị chặn, production từ chối origin phụ.
- UI 47/47 đạt: có test so sánh không mount khi đóng, mở sau upload khi form đã khóa, dấu bắt buộc và nút avatar cùng hàng desktop/tự mở editor.
- `upload-collapsed.png` và `profile-avatar-picker.png` là ảnh mock đã xem để kiểm bố cục. `ui-results.json` ghi lượt kiểm thử UI.
- Kiểm thử Chrome thật qua localhost + Supabase + SeaweedFS dùng `api/scripts/local-profile-browser-smoke.mjs`. Chạy từ API với `$env:BLOCK11_LOCAL_PROFILE_LIVE='1'` rồi `node scripts/local-profile-browser-smoke.mjs`. Chỉ tạo một tài khoản/ảnh avatar thử riêng, kiểm tra UI save, WebP vuông/không EXIF, token sai và origin lạ vẫn bị chặn, rồi dọn fixture theo lifecycle ảnh. `live-localhost-results.json` ghi kết quả và cleanup, không chứa mật khẩu/cookie/token.
- Không chỉnh hồ sơ/avatar của người dùng thật; không migration, reset DB hoặc đổi data directory SeaweedFS. Các báo cáo cũ có thể ghi localhost bị chặn tại thời điểm trước bản sửa này.

Khởi động theo [LAN_SETUP.md](../../LAN_SETUP.md). Khi thay IP LAN, vẫn cần cập nhật APP_ORIGIN và rule Firewall như hướng dẫn; danh sách localhost không thay việc này.
