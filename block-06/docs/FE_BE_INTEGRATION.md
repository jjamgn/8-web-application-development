# Kết quả tích hợp FE–BE — 23/10/2026

Đã chạy luồng **React SPA → Express REST API → PostgreSQL/Supabase thật**. Browser không dùng interception hoặc response giả lập trong lượt nghiệm thu này.

## Cấu hình đã nối

| Thành phần | Giá trị |
|---|---|
| FE | `http://localhost:5173/#/dishes` |
| API FE gọi | `http://localhost:3000/api` |
| Backend listen | `127.0.0.1:3000` |
| CORS của BE | Origin chính xác `http://localhost:5173`; GET/POST/PATCH/DELETE/OPTIONS và Content-Type |
| Cấu hình FE | `web/.env.local`, chỉ có URL API công khai |
| Cấu hình BE | `api/.env`, Git bỏ qua; chỉ lấy các biến kết nối DB/URL ảnh cần thiết từ cấu hình Block5 có sẵn |

Không sao chép service role key vào FE. Không chạy migration hoặc seed trong lần tích hợp: kiểm tra chỉ đọc xác nhận cả hai migration đã hoàn tất, CHECK giá đã là `>=0`.

## Kết quả đã chạy

| Kiểm tra | Kết quả thực tế |
|---|---|
| Build BE | TypeScript qua |
| Test BE | 12/12 nhóm HTTP contract qua; đây vẫn là test dùng Prisma stub |
| Build FE sau chỉnh ảnh | Thành công, Vite 7.3.7, 53 module |
| Đọc DB thật | Ban đầu có 6 món, 3 đầu bếp, 10 nguyên liệu; API GET trả `ok:true` và CORS đúng origin |
| Giao diện khách | Danh sách, chi tiết, tìm q trên hash URL, reload hoạt động với dữ liệu thật |
| CRUD chefs/ingredients | Thêm và sửa qua form React, đọc lại từ DB đúng giá trị |
| CRUD dishes | Thêm với chef vừa tạo, `price:0`, `available:false`; PATCH tên chỉ gửi `{name:...}`, giữ giá, trạng thái, chefId và ảnh |
| Validation unique thật | Thử trùng tên Ingredient nhận `VALIDATION_FAILED`; FE hiện lỗi cạnh tên và giữ đơn vị đã nhập |
| Ràng buộc FK thật | Xóa chef đang được món thử dùng bị từ chối; trang xác nhận giữ lại và hiện thông báo |
| CORS/preflight thật | OPTIONS cho POST/PATCH/DELETE trả 204, đúng origin/method; các lệnh ghi từ browser khác origin thành công |
| Lỗi kỹ thuật | JSON hỏng trả 400; endpoint lạ trả 404; CORS vẫn có trên response lỗi |
| NOT_FOUND | Mở ID không có hiện trang không tìm thấy bản ghi |
| Không tải lại document | Điều hướng bằng Link và sau ghi không tạo document request mới |
| Lưu bền vững | Dừng BE rồi chạy lại: PID đổi 7308 → 6832; cả ba bản ghi thử vẫn đọc được sau restart |
| Xóa có xác nhận | Hủy không xóa; xác nhận xóa qua FE, GET sau xóa trả NOT_FOUND |
| Dọn dữ liệu thử | Mọi bản ghi mang tiền tố riêng của lượt kiểm tra đã được dọn; không xóa bản ghi ngoài lượt thử |
| Browser | 10/10 nhóm live integration qua, không có lỗi JavaScript chưa xử lý |
| Ảnh | Ảnh seed dùng bản local trùng tên từ Block5; ảnh ngoài nhóm seed vẫn dùng URL BE. Menu/admin tải đủ ảnh, xác nhận naturalWidth > 0 |

Số món cuối lượt là **7**, đầu bếp **3**, nguyên liệu **10**. Số món có thay đổi ngoài tập bản ghi thử; script chỉ dọn đúng tiền tố do nó tạo và giữ bản ghi khác. Không ép tổng số món về 6 bằng cách xóa dữ liệu ngoài lượt thử.

Phạm vi giữ quan hệ khi PATCH thật: đã kiểm tra chefId và ảnh trên món thử. Không chỉnh công thức của món hiện có để kiểm tra; test bảo toàn công thức đầy đủ vẫn thuộc bộ test BE dùng stub.

## File minh chứng

- [Kết quả live, HTTP và cleanup](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/fe-be-integration.json).
- [Ảnh đã tải và kích thước thực](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/live-images.json).
- [Menu dữ liệu thật](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/live-menu-desktop.png).
- [Admin dữ liệu thật](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/live-admin-desktop.png).
- [Admin mobile](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/live-admin-mobile.png).
- [Script kiểm tra tích hợp](C:/2026_2027/web/8-web-application-development/block-06/web/tests/integration.mjs).

## Chạy lại trên máy hiện tại

Từ `block-06`, terminal BE:

```powershell
cd api
.\run.cmd dev
```

Terminal FE:

```powershell
cd web
.\pnpm.cmd dev
```

Nếu FE đã chạy, giữ terminal đó. Mở `http://localhost:5173/#/dishes` hoặc `/#/admin/dishes`. Để đọc trạng thái DB: chạy `.\run.cmd config:check` tại `api`.

Lượt kiểm tra live cần cả hai server đang chạy. Tại `web`, với Playwright của môi trường Codex:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\Users\pc\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
node tests/integration.mjs
```

Script tạo/sửa/xóa bản ghi thử có tiền tố `FE_BE_...`, không dùng dữ liệu giả lập và có bước dọn trong finally. Bước kiểm tra restart được bật riêng bằng `WAIT_FOR_BE_RESTART=1`: script dừng ở CHECKPOINT, người chạy restart BE rồi nhấn Enter. Chỉ dùng chế độ này khi bạn kiểm soát tiến trình BE.
