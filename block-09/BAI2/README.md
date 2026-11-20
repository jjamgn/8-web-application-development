# Bếp Nhà — Block 9, Bài 2 (SSR)

Đây là bản làm việc cho Bài 2, sao chép từ Restaurant App SSR Block 8 theo [contract chung](../BAI2_CONTRACT.md). Bài 2 giữ Express/EJS, session cookie lưu ở PostgreSQL, thực đơn và CRUD của Block 8; bổ sung quyền `viewer`/`editor`/`admin`, điều kiện sửa món theo chef và trạng thái draft, cùng MFA TOTP/recovery code. Bài 1 CSR/JWT là dự án riêng.

**Trạng thái tích hợp:** đã ghép schema, migration và RBAC/ABAC của A từ GitHub `main` (`0b5f3f7042857b32ecd4ccbb2d318cb4e6614339`) với MFA/session của B và giao diện SSR của C. `npm run db:generate`, `npm run build` và `npm test` (127/127) đã qua trên bản ghép. Lần ghép này chưa chạy luồng trình duyệt với DB thật. Không dùng `prisma db push` lên DB chung để né migration. [README Block 8 gốc](README_BLOCK08_BASELINE.md) được lưu lại để đối chiếu, không thay cho contract Bài 2.

## Chạy bản tích hợp

Trong PowerShell, ở thư mục `block-09/BAI2`:

```powershell
npm ci
Copy-Item .env.example .env # Chỉ khi chưa có .env; sau đó điền cấu hình riêng.
npm run db:generate
npm run build
npm test
npm run dev
```

- `DEMO_MODE=true` chỉ cho xem giao diện/dữ liệu mẫu công khai; không dùng để chứng minh đăng nhập, RBAC/ABAC hoặc MFA.
- Khi dùng DB thật của nhóm, điền cấu hình PostgreSQL, Supabase Storage, SMTP và `MFA_ENCRYPTION_KEY` vào `.env`. Tạo khóa MFA bằng lệnh trong `.env.example`, giữ ổn định qua các lần khởi động và không commit.
- Theo [bàn giao của A](docs/A-HANDOFF.md), migration đã được kiểm tra và áp dụng lên DB demo thật, các tài khoản/bản ghi demo có tiền tố `B9B2-DEMO-` đã được chuẩn bị. Cần kiểm tra kết nối và cấu hình `.env` của máy chạy trước khi demo; không chạy test thao tác hàng loạt trên DB demo thật.
- Trang công khai: `/dishes`. Đăng nhập: `/auth/login`. Profile: `/auth/account`. Quản trị: `/admin/dishes`. Cài MFA: `/auth/account/mfa`. Bước MFA sau mật khẩu: `/auth/mfa`.

## Quyền và giao diện

| Role | Trong `/admin` |
| --- | --- |
| `viewer` | Xem danh sách/chi tiết; không thấy nút ghi dữ liệu. |
| `editor` | Tạo món draft gắn chef của tài khoản; chỉ thấy Sửa ở món draft của chef mình; không thấy Xóa hoặc form đổi chef/status. |
| `admin` | CRUD tất cả và đổi chef/status món. |

Ẩn nút giúp giao diện dễ hiểu; [policy phía server](../BAI2_CONTRACT.md#4-ma-trận-quyền-rbacabac) vẫn phải chặn request trực tiếp và kiểm tra lại khi PATCH. Món draft không xuất hiện trên thực đơn công khai. `available` (còn phục vụ) và `status` (đã công bố) là hai thuộc tính riêng.

## MFA

- Sau mật khẩu đúng, tài khoản đã bật MFA có pending session 5 phút và tới `/auth/mfa`; nhập TOTP hoặc mã dự phòng mới tạo full session.
- Trong profile, mục **Cài đặt xác minh hai bước** mở `/auth/account/mfa`. Thiết lập qua QR/mã thủ công, xác nhận bằng mã TOTP đầu tiên, rồi lưu 10 mã dự phòng hiển thị một lần.
- Cấp lại mã, thay ứng dụng hoặc tắt MFA đều cần mật khẩu hiện tại và TOTP/mã dự phòng. Bật/đổi/tắt MFA hoặc cấp lại mã thu hồi các phiên khác theo contract.
- Tài liệu ghép với A/B: [bàn giao MFA của B](docs/MFA_MEMBER_B_HANDOFF.md) và [bàn giao giao diện của C](docs/SSR_UI_C_HANDOFF.md).

## Kiểm tra và minh chứng

`npm test` dùng mock/dummy DB URL và kiểm tra policy RBAC/ABAC, giao diện EJS theo role cùng logic MFA; không ghi DB thật. Kiểm thử trình duyệt thật cần `.env` và các tài khoản demo đã chuẩn bị. Xem [kịch bản kiểm thử và minh chứng C](docs/SSR_UI_C_HANDOFF.md).

Snapshot Block 8 làm nền: `7b61a0fa152fb679be60d9a3b4ae30126725ca9c` (theo bàn giao của A). Commit chứa phần A trên GitHub `main`: `0b5f3f7042857b32ecd4ccbb2d318cb4e6614339`.
