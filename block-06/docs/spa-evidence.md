# Minh chứng FE Block 6

Ngày thực hiện: 23/10/2026, múi giờ Asia/Saigon. Phạm vi: FE; không triển khai backend trong lần này.

**Cập nhật:** backend đã được kéo về và tích hợp thật trong lượt sau. Xem [FE_BE_INTEGRATION.md](C:/2026_2027/web/8-web-application-development/block-06/docs/FE_BE_INTEGRATION.md) cho 10 nhóm live check, dữ liệu sau restart, CORS và CRUD thật. Phần bên dưới giữ bằng chứng giai đoạn FE/fixture ban đầu.

## 1. Phần đã triển khai

- `web/src/app/router.tsx`: HashRouter, đủ hai trang khách và 12 URL quản trị, redirect và fallback. Resource lạ/ID sai định dạng không tạo request tới endpoint lạ.
- `web/src/lib/api.ts`: API base URL một chỗ; JSON khi có body; kiểm tra HTTP, JSON/envelope, `ok`; chuẩn hóa fields; timeout 12 giây; không tự retry lệnh ghi.
- `web/src/hooks/useLoad.ts`: GET theo URL, retry, hủy request khi đổi trang; kiểm tra shape danh sách/bản ghi; không dùng store dữ liệu toàn cục.
- `DishListPage`, `DishDetailPage`: tìm bằng q trong hash URL, chi tiết theo ID; loading/empty/NOT_FOUND/error.
- `AdminListPage`, `AdminFormPage`, `AdminDeletePage`: tái sử dụng cho ba resource; form có validation, pending, giữ draft, PATCH chỉ trường thay đổi; xóa sau xác nhận.
- `resources.ts`: whitelist resource/trường editable; chuyển số/boolean tường minh, giữ giá 0 và trạng thái false.
- `Layout`, `DishCard`, `PageState`: bố cục và trạng thái dùng chung; Link/NavLink cho điều hướng; không thay document hoặc render HTML thô từ input.

## 2. Phần tái sử dụng Block 5

Nguồn đầy đủ: `C:/2026_2027/web/week3/Group8 (2)/Block5`.

| Nguồn | Cách tái sử dụng |
|---|---|
| `public/styles.css` | Chép sang `web/src/styles.css`, thêm trạng thái và chỉnh cuộn ngang/độ đọc trên mobile |
| `public/images/*.png` | Tái sử dụng đủ tám ảnh trong `web/public/images`, không tạo ảnh mới |
| Header, footer, admin-nav EJS | Chuyển JSX trong Layout, điều hướng bằng HashRouter |
| Menu, detail, card EJS | Chuyển JSX, lấy dữ liệu từ API client |
| Admin list/form/delete EJS | Chuyển thành ba page dùng chung, JSON và state form cục bộ |

Không chép `admin-forms.js` hoặc cơ chế redirect/replace document của SSR. Các link neo cũ được thay bằng nút scroll để không phá hash route. Không đưa dữ liệu mẫu vào ứng dụng production.

## 3. Kết quả đã chạy

| Tiêu chí | Cách kiểm tra | Kết quả | Phạm vi bằng chứng |
|---|---|---|---|
| TypeScript và build | `pnpm build` | Thành công, Vite 7.3.7, 53 module | Build FE thực |
| Dev server | GET `http://localhost:5173/` | HTTP 200; cổng cố định 5173 | Server FE thực |
| Danh sách/chi tiết/q | Browser click, tìm rỗng, reload, Back | Qua | Response giả lập theo contract |
| 14 URL | Mở hai trang khách và bốn route admin cho mỗi resource | Qua | Browser + response giả lập |
| CRUD ba resource | POST → GET danh sách → PATCH → GET → xác nhận DELETE | Qua; JSON đúng, trang đích tải lại | Fixture trong browser, chưa chứng minh ghi DB |
| Validation | Form trống không gửi; server trả fields mảng; draft giữ nguyên | Qua; lỗi cạnh ô, khóa nút trong lúc ghi | Browser + response giả lập |
| Giá 0/false | Tạo Dish có `price:0`, `available:false` | Request giữ đúng kiểu và giá trị | Browser + response giả lập |
| PATCH whitelist | Chỉ đổi tên, kiểm tra body | Chỉ `{name:...}`; không gửi ảnh/quan hệ | Chứng minh payload FE, chưa chứng minh BE giữ DB |
| Xóa | Mở trang xóa, hủy, mở lại và xác nhận | Chỉ nút xác nhận gửi DELETE | Browser + response giả lập |
| Điều hướng SPA | Đếm document request khi click Link/ghi | Không tạo document request mới | Browser thực |
| Phân biệt lỗi | NOT_FOUND, HTTP 404/500, network, HTML và data sai shape | UI đúng nhóm lỗi, không trang trắng | Response giả lập |
| Chef rỗng | GET chefs trả `[]`, mở thêm món | Khóa lưu và có link thêm chef | Response giả lập |
| State/response cũ | Đổi nhanh ID, đổi resource khi có draft | Không ghi đè record mới, form mới không giữ draft cũ | Browser + response giả lập |
| Desktop/mobile | Xem ảnh 1440px và 390px, đo overflow document | Giao diện hoạt động; bảng cuộn ngang bên trong | Browser thực, dữ liệu fixture |
| Lỗi JavaScript | Bắt sự kiện `pageerror` | Không có lỗi chưa xử lý | Browser thực trong lượt smoke |

Kết quả máy đọc: [fe-smoke.json](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/fe-smoke.json). Script: [smoke.mjs](C:/2026_2027/web/8-web-application-development/block-06/web/tests/smoke.mjs). Script chỉ giả lập response trong browser kiểm thử, không cung cấp API cho người dùng mở FE bình thường.

## 4. Minh chứng hình ảnh

- [Menu desktop với fixture](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/fixture-menu-desktop.png).
- [Admin desktop với fixture](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/fixture-admin-desktop.png).
- [Menu mobile với fixture](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/fixture-menu-mobile.png).
- [Admin mobile với fixture](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/fixture-admin-mobile.png).
- [UI khi API không kết nối được](C:/2026_2027/web/8-web-application-development/block-06/docs/evidence/api-unavailable-desktop.png).

## 5. Chưa kiểm tra với BE thật

Probe local `http://127.0.0.1:3000/api/dishes` bị từ chối kết nối; chưa có backend phục vụ endpoint tại thời điểm kiểm tra. Probe localhost cũng chưa nhận response trong thời hạn kiểm tra. Đây không phải kết quả lỗi nghiệp vụ `NOT_FOUND`.

- Chưa xác nhận 15 endpoint và response shape từ BE thật.
- Chưa xác nhận CORS/OPTIONS của BE trong browser không interception.
- Chưa xác nhận ghi bền vững, unique/FK, giữ quan hệ/ảnh sau PATCH hoặc upload URL của Supabase.
- Chưa xác nhận độ trễ/lỗi hệ thống thật từ tầng database.

Khi BE sẵn sàng: chốt `VITE_API_BASE_URL`, origin 5173, number/boolean trong JSON, `chefId`, ảnh mặc định và hành vi PATCH; chạy lại CRUD ba tài nguyên, reload sau ghi, validation và CORS bằng Network thật. Không đánh dấu các mục này đạt chỉ dựa trên smoke fixture.

## 6. Lệnh chạy và thay đổi nhỏ so với thiết kế

Tại `web/`: `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm build`. Đã dùng Node 24.22.1 và pnpm 11.25.0. Dùng pnpm thay npm theo công cụ hiện có; giữ React/Vite/TypeScript/HashRouter và cấu trúc ứng dụng đã chốt.

`pnpm-workspace.yaml` cấu hình cài dependency cục bộ theo dạng hoisted, không dùng virtual store toàn cục; lockfile là `pnpm-lock.yaml`. Không thay stack hoặc bổ sung thư viện UI/store/form.
