# Kiểm tra backend sau khi kéo code

Ngày kiểm tra: 30/10/2026.

## Cập nhật lỗi CORS từ ảnh người dùng

Sau khi người dùng bật server, đã xác nhận: request từ http://127.0.0.1:5173 nhận HTTP 200 và data 1.000 món nhưng thiếu Access-Control-Allow-Origin; request từ http://localhost:5173 có header này. Vì vậy browser ở địa chỉ Vite in ra vẫn chặn đọc dữ liệu dù API/DB hoạt động. Lượt kiểm tra trước chỉ xác nhận CORS với origin cấu hình, chưa bao phủ địa chỉ loopback thay thế.

Đã sửa allowlist CORS: khi SPA_ORIGIN là localhost hoặc 127.0.0.1, chấp nhận cả hai tên loopback với cùng protocol và port, phản hồi đúng origin của request. Domain ngoài, port khác và domain giả mạo vẫn không được cấp header CORS.

Đã kiểm tra backend đang chạy trả đúng header ở cả hai origin, mỗi request trả 12 món và total 1.000; build và 17/17 test PASS, gồm preflight và các origin bị từ chối. Dữ liệu DB không bị thay đổi.

## Kết luận

Backend build được, kết nối Supabase thành công và trả dữ liệu đúng contract frontend. Tại thời điểm kiểm tra không có server lắng nghe trên cổng 3000 hoặc 5173; HTTP local trả ECONNREFUSED. Database từ xa vẫn có dữ liệu.

| Kiểm tra | Kết quả |
|---|---|
| Kết nối DB | Thành công |
| Dữ liệu hiện có | 1.000 món, 3 đầu bếp, 110 nguyên liệu |
| Migration | 3/3 đã áp dụng, schema up to date |
| Build backend | Thành công |
| API regression | 17/17 nhóm PASS; DB được stub trong bộ test |
| HTTP API + CORS trên DB thật | PASS, trang đầu trả 12/1.000 món |
| Trang 2 | PASS, không trùng ID trang đầu |
| GET chefs/ingredients | PASS, lần lượt 3/110 bản ghi, giữ contract mảng |
| Basic/Advanced/Full-text/Fuzzy | PASS với tên món có sẵn, trả kết quả thực từ PostgreSQL |

## Sửa cấu hình lệnh chạy

Trước đây run.cmd nạp cấu hình dự phòng từ Block 6, nhưng npm scripts gọi trực tiếp tsx/Prisma. Khi api/.env chưa có, hai cách chạy không nhất quán.

Đã chuyển các npm scripts qua scripts/run.mjs, giữ cùng thứ tự cấu hình: môi trường/đường dẫn DOTENV_CONFIG_PATH được chỉ định, api/.env, rồi fallback block-06/api/.env khi file local chưa có. Không sao chép secret; không thay URL frontend hoặc dữ liệu DB.

Thêm `npm run verify:readonly`: kiểm tra HTTP/CORS/pagination/search trên DB thật trong một listener tạm cùng tiến trình. Listener tự đóng khi hoàn tất để không chiếm cổng chạy dev của người dùng. Lượt kiểm tra không seed/migrate hoặc ghi Supabase.

## Chạy lại

Tại api: `.\run.cmd dev` hoặc `npm run dev`.

Tại web, terminal riêng: `.\pnpm.cmd dev`.

Mở http://localhost:5173/#/dishes, giữ cả hai terminal hoạt động. Nếu chưa có dữ liệu trên UI, kiểm tra API http://localhost:3000/api/dishes?page=1&pageSize=12 và thông báo tại terminal backend.

Các kết quả trên xác nhận luồng đọc và kiểm thử hồi quy. Không chạy lại luồng tạo/sửa/xóa trên DB thật trong lượt rà soát này.
