# Bàn giao thành viên C — giao diện SSR và kiểm chứng

> Cập nhật sau tích hợp: phần A đã được ghép từ GitHub `main` tại commit `0b5f3f7042857b32ecd4ccbb2d318cb4e6614339`. `npm run build` và `npm test` (127/127) đã qua. Các ghi chú “chờ A” bên dưới mô tả trạng thái bàn giao ban đầu; luồng trình duyệt với DB thật chưa được chạy trong lần ghép này.

Phần C làm theo [contract Bài 2](../../BAI2_CONTRACT.md), mục 4–7, và [interface MFA của B](MFA_MEMBER_B_HANDOFF.md). Không sửa policy, route backend, Prisma schema hoặc source Block 8.

## Giao diện đã làm

- Thêm bốn trang `views/auth/mfa.ejs`, `mfa-settings.ejs`, `mfa-setup.ejs`, `mfa-recovery-codes.ejs` và hai partial cho mã xác minh/reauth. Form gửi đúng `method=totp|recovery`, `code`, `currentPassword`, `_csrf` và các URL phần B quy định.
- Profile liên kết tới `/auth/account/mfa`, hiển thị đúng tên role `viewer`/`editor`/`admin`; người xem và biên tập viên đều có đường vào trang danh sách quản trị theo contract. Header hiện link tài khoản khi đã đăng nhập.
- Danh sách quản trị chỉ hiện Thêm/Sửa/Xóa theo role và chef/status; phân biệt `status=draft|published` với `available`; không dẫn khách đến URL chi tiết công khai của món draft.
- Form món của editor chỉ hiển thị chef được phân công và trạng thái draft dưới dạng chữ, **không gửi** `chefId` hoặc `status`. Admin có trường chọn cả hai. Form tìm kiếm, phân trang, ảnh và nguyên liệu Block 8 được giữ.
- Trang lỗi có đường quay về khu vực quản trị cho người đã đăng nhập. CSS giữ màu/font Block 8, có bố cục mobile và kiểu in cho trang recovery code.

Ẩn nút không phải kiểm soát quyền. Phần A phải kiểm tra từng GET form và mutation ở server, đặc biệt PATCH phải đọc lại role, chef và trạng thái món.

## Dữ liệu render cần A cung cấp

| View | Dữ liệu cần thêm so với Block 8 |
| --- | --- |
| `admin-list.ejs` | `res.locals.currentUser.role` và `chefId`; mỗi món trong `items` có `chefId` và `status`. |
| `form.ejs` | `currentUser.chefId`, danh sách `chefs` đang có; `values.status` khi admin sửa món. A tự gán chef/status ở server khi editor POST, không cần hidden field. |
| `account.ejs` | `currentUser.role` như hiện có; link MFA không cần secret hay trạng thái MFA trong locals. |
| Bốn trang MFA | Đúng các locals trong [bàn giao B](MFA_MEMBER_B_HANDOFF.md). `mfa-recovery-codes.ejs` chỉ nhận mã plaintext ở response một lần sau khi B lấy mã từ session đã mã hóa. |

Nếu `chefId` thiếu ở editor, UI ẩn nút Thêm/Sửa và form hiển thị “Chưa được phân công”; A cần gán chef và chặn route tương ứng. Nếu `status` thiếu ở món cũ trước migration, UI tạm hiển thị “Đã công bố” để giữ hành vi Block 8; migration A phải backfill `published`.

## Kiểm thử đã chạy

- `npx tsx --test tests/mfa-views.test.ts`: render EJS với dữ liệu giả cho các trang MFA, viewer/editor/admin và form món; 4 test pass.
- `npm test`: toàn bộ 119 test pass với mock/dummy database URL; không ghi DB thật.
- Render trang MFA bằng Edge headless với dữ liệu giả ở desktop 1365px và mobile 390px để xem bố cục. Đây là kiểm tra giao diện, **không phải minh chứng nghiệm thu từ app thật**.
- `npm run test:e2e`: Playwright spec kiểm tra thực đơn công khai, pending MFA và nút editor trên app thật. Với server `DEMO_MODE=true` tạm ở `127.0.0.1:3001`, case thực đơn/tìm kiếm đã **pass trên Edge**; case editor/MFA skip vì chưa có schema/guard A và tài khoản demo. Server tạm đã dừng. Chưa chạy luồng MFA trên DB thật.

Sau khi A tích hợp và app chạy, đặt các biến môi trường **chỉ trong PowerShell local** (không lưu vào repo):

```powershell
$env:BAI2_E2E_URL = 'http://localhost:3000'
$env:BAI2_E2E_EDITOR_EMAIL = '<email editor demo đã bật MFA>'
$env:BAI2_E2E_EDITOR_PASSWORD = '<mật khẩu editor demo>'
$env:BAI2_E2E_EDITOR_TOTP_SECRET = '<secret TOTP chỉ dùng cho tài khoản demo>'
$env:BAI2_E2E_BROWSER_CHANNEL = 'msedge' # Windows có Edge; bỏ dòng này để dùng Chromium của Playwright.
npm run test:e2e
```

Spec chỉ đọc/navigates trang và đăng nhập, không tạo/sửa/xóa bản ghi. Nếu dùng Chromium mặc định mà chưa cài browser, chạy `npx playwright install chromium`. Xóa biến môi trường chứa credential/secret sau khi kiểm tra, không chụp hoặc in chúng khi trình chiếu.

## Luồng trình bày sau khi ghép A/B/C

1. **Khách:** `/dishes` → tìm kiếm/phân trang → xác nhận món draft không lộ trên public. Chụp UI và Network GET công khai.
2. **Viewer:** đăng nhập → `/admin/dishes`, `/admin/chefs`, `/admin/ingredients` chỉ có thao tác xem. HTTP client gửi trực tiếp mutation test, server trả 403; UI ẩn nút không thay cho bằng chứng server.
3. **Editor có MFA:** nhập mật khẩu → `/auth/mfa`; trước OTP gõ `/admin/dishes` vẫn về MFA → nhập TOTP → danh sách có nút Thêm món, chỉ món draft thuộc chef mình có Sửa → mở form xác nhận không có input `chefId`/`status`. Thử URL sửa món chef khác và món đã published: 403.
4. **Admin:** xem đủ nút CRUD, mở form món có chọn chef/status → publish món demo → editor không còn được sửa món published. Kiểm tra DB trước/sau bằng bản ghi demo có tiền tố `B9B2-DEMO-`.
5. **Profile MFA:** `/auth/account/mfa` → bắt đầu setup → quét QR, nhập TOTP → trang recovery code một lần. Không đưa QR/secret hoặc mã dự phòng thật vào ảnh/video nộp; dùng tài khoản demo và che các vùng nhạy cảm. Thử reauth cho thay/tắt/cấp lại và các phản hồi 400/429 theo contract.

Điểm chờ tích hợp: migration và guard A, `.env` Bài 2, tài khoản/bản ghi demo trên DB thật, SHA nguồn GitHub. Không dùng screenshot render giả làm minh chứng nghiệm thu.
