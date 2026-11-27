# LAN đã cấu hình trên máy người dùng

**Mở rộng đã duyệt 27/11/2026:** tìm kiếm, modal có slug/URL, download WebP, yêu thích, bộ sưu tập riêng tư, hồ sơ công khai, follow và sửa avatar đã tích hợp. Avatar dùng SeaweedFS qua PhotoKind AVATAR và không xuất hiện trong gallery. Các bảng xã hội mới thuộc Block 11. Migration bổ sung `202611270003_social_profiles`; không cần đổi env hoặc cài thư viện frontend mới. Xem [API, cách dùng và kiểm chứng](evidence/social-profile/README.md). Các kết quả cũ trong tài liệu này là lịch sử trước mở rộng.

Ngày 27/11/2026. IP Wi-Fi tại lúc cấu hình: **192.168.100.154**, gateway 192.168.100.1. Link dùng chung: **http://192.168.100.154:5173/photos**.

## Origin localhost bổ sung

Theo [bản sửa avatar/Origin](evidence/compact-upload-profile/README.md), env development có `ADDITIONAL_APP_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`. Chỉ địa chỉ trong danh sách cụ thể và token đúng mới được ghi; origin khác trả ORIGIN_NOT_ALLOWED. Production phải để danh sách này rỗng.

## Đã thực hiện

- `.env` API chính và worktree review có APP_ORIGIN `http://192.168.100.154:5173`, NODE_ENV development. Credential/S3 endpoint/session secret giữ nguyên, env được Git bỏ qua.
- Thêm `npm run dev:lan` ở web để Vite listen 0.0.0.0:5173. API và SeaweedFS giữ loopback 127.0.0.1:3000/8333; Vite proxy API/media, không mở hai cổng đó cho LAN.
- Wi-Fi hiện có profile Public. Không đổi profile mạng. Windows đã cấp quyền Administrator qua UAC để tạo rule **Block11-LAN-5173**, chỉ TCP 5173, local address 192.168.100.154, interface Wi-Fi, chương trình Node.js, nguồn LocalSubnet, profile Public/Private.
- Restart đúng API/Vite Block 11 đã chạy; không dừng process khác hoặc thay data directory SeaweedFS.

## Kiểm tra tại máy chủ

| Kiểm tra qua IP Wi-Fi | Kết quả |
| --- | --- |
| GET /api/photos qua Vite | 200 |
| GET media một ảnh có sẵn | 200, image/webp |
| GET /api/auth/csrf | 200, có session cookie |
| POST login body thiếu trường nhưng đúng CSRF và LAN Origin | 400 validation — đã qua kiểm tra Origin/CSRF |
| Cùng request nhưng Origin localhost, token đúng | 400 validation — localhost đã được thêm explicit vào danh sách dev |
| Listener frontend | 0.0.0.0:5173 |
| Listener API/S3 | Chỉ 127.0.0.1:3000 / 127.0.0.1:8333 |

Không tạo tài khoản/ảnh thử trong lượt cấu hình này; chỉ có phiên CSRF thử theo hoạt động bình thường của ứng dụng. Chưa có thiết bị thứ hai để kiểm tra truy cập qua Wi-Fi thực tế. Các kiểm tra trên được chạy từ chính máy chủ qua địa chỉ LAN.

## Chạy lại sau khi tắt máy

Từ repo root, terminal 1:

```powershell
.\block-11\infra\seaweedfs\start-native.ps1
```

Terminal 2:

```powershell
cd block-11/api
npm run dev
```

Terminal 3:

```powershell
cd block-11/web
npm run dev:lan
```

Máy khác dùng **http://192.168.100.154:5173**. Máy chủ có thể dùng URL LAN, `http://localhost:5173` hoặc `http://127.0.0.1:5173` nhờ ADDITIONAL_APP_ORIGINS trong env development. Mỗi địa chỉ có phiên/cookie riêng. Máy khác chỉ cần trình duyệt, không cần source, Docker, Supabase key hoặc S3 credential. Máy chủ phải bật và có Internet để tới Supabase.

## Khi thay Wi-Fi hoặc IP thay đổi

1. Chạy `ipconfig`, lấy đúng IPv4 của adapter đang có gateway.
2. Đổi APP_ORIGIN trong API .env thành `http://<IP mới>:5173`; restart API, dùng URL mới trên tất cả thiết bị.
3. Mở PowerShell **Run as administrator** tại repo root và cập nhật rule bằng helper:

```powershell
.\block-11\infra\seaweedfs\configure-lan-firewall.ps1 -Address <IP-moi> -InterfaceAlias 'Wi-Fi'
```

Thay placeholder bằng IP thực, không gõ nguyên dấu `< >`. Helper xác minh IP thuộc interface trước khi tạo rule, không đổi network profile. Nếu đổi adapter thì truyền đúng tên adapter. `npm run dev:lan` không tự cập nhật APP_ORIGIN hoặc Firewall.

Nếu máy khác vẫn không truy cập, thử cùng hotspot cá nhân để loại trừ Wi-Fi trường chặn thiết bị truy cập nhau (AP isolation). Không mở port router ra Internet hoặc chia sẻ credential để xử lý lỗi LAN.

## Trở về chỉ localhost hoặc tắt chia sẻ LAN

- Dừng Vite LAN, chạy web bằng `npm run dev` để bind localhost; đổi APP_ORIGIN về `http://localhost:5173`, restart API.
- Nếu muốn gỡ rule, dùng PowerShell Administrator: `Remove-NetFirewallRule -Name 'Block11-LAN-5173'`.
- NODE_ENV development được chọn cho demo HTTP LAN; đây không phải triển khai HTTPS/Internet.
