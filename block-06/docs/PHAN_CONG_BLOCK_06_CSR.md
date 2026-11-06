# Phân công Block 6: chuyển Bếp Nhà từ SSR sang REST API + SPA dùng CSR

## 1. Cơ sở và phạm vi

**Chia đúng ba vai trò: người 1 làm BE, người 2 làm FE, người 3 hỗ trợ kiểm thử và trình bày.** Người 3 không nhận thêm một module lập trình bắt buộc; người 2 chịu trách nhiệm giao diện của cả ba tài nguyên.

Tài liệu này được lập sau khi đọc mã nguồn, chưa chạy ứng dụng hoặc xác nhận kết nối database. Đây là kế hoạch thực hiện, không phải báo cáo đã hoàn thành Block 6.

Nguồn đã đối chiếu:

- Đề bài: [REST API và SPA.html](<C:/2026_2027/web/week4/REST API và SPA.html>), đặc biệt slide 41–52 và ghi chú giảng viên.
- Kế hoạch tham khảo: [Phan_cong_Block_REST_SPA_45_phut.md](<C:/Users/pc/Downloads/Phan_cong_Block_REST_SPA_45_phut.md>). Mốc 45 phút là gợi ý từ tệp này, không phải thời hạn bạn vừa yêu cầu. Việc giao người thứ ba lập trình admin trong tệp cũ được điều chỉnh theo ba vai trò bạn chọn.
- Mã nguồn đầy đủ: [Block5](<C:/2026_2027/web/week3/Group8 (2)/Block5>), nằm cạnh tệp ZIP. ZIP được cung cấp thiếu `src`, `prisma`, `views`, `public`, `tests`, `scripts`; cần lấy bản thư mục đầy đủ khi bàn giao cho nhóm.

Stack chốt cho kế hoạch:

| Phần | Stack | Lý do |
|---|---|---|
| BE | Express 5 + TypeScript + Prisma 6 + PostgreSQL trên Supabase | Giữ stack và dữ liệu của Block 5 |
| FE | React + Vite + TypeScript + React Router (`HashRouter`) + `fetch` | Tạo SPA render trong browser; URL giao diện có dạng `/#/{resource}/...` |
| Giao diện | CSS và ảnh Bếp Nhà hiện có | Giữ nhận diện, giảm thời gian dựng lại giao diện |
| Kiểm chứng | Request HTTP, DevTools Network; tận dụng Supertest/Playwright khi phù hợp | Chứng minh API, CORS, routing và CRUD thật |

React/Vite là lựa chọn triển khai của kế hoạch, không phải stack bắt buộc của giảng viên. CSR là cách render: browser chạy React, gọi API JSON rồi dựng giao diện.

Theo điều chỉnh của bạn, **URL giao diện dùng hash routing**: `/#/dishes`, `/#/dishes/1`, `/#/admin/dishes/...`. Đây là cách ánh xạ các trang trong đề sang URL của bản triển khai; báo cáo ghi rõ dùng `HashRouter` thay cho đường dẫn không có hash trong ví dụ của slide. **Endpoint HTTP của BE vẫn là `/api/{resource}/...`**: phần sau `#` là fragment do browser xử lý, không được gửi lên server nên không thể dùng làm route API phía BE.

```text
Browser: React SPA — http://localhost:5173/#/dishes
          │ fetch trực tiếp, response JSON, có CORS
          ▼
Express REST API — http://localhost:3000/api/*
          │ Prisma
          ▼
PostgreSQL trên Supabase
```

## 2. Những gì thực sự tái sử dụng được

Các đường dẫn trong cột đầu dưới đây tính từ thư mục Block5 đầy đủ.

| Thành phần hiện có | Cách dùng cho Block 6 | Phụ trách |
|---|---|---|
| `src/db.ts` | Giữ Prisma client và cách tạo URL ảnh; chuẩn hóa dữ liệu trả JSON | BE |
| `prisma/schema.prisma`, `prisma/migrations/` | Giữ model và quan hệ hiện có; không đổi DB/ORM để làm bài | BE |
| `src/data.ts`, `prisma/seed.ts` | Giữ danh mục, 8 món, 3 đầu bếp, 10 nguyên liệu và cách seed; không coi mảng demo là dữ liệu CRUD thật | BE; hỗ trợ chuẩn bị dữ liệu demo |
| `src/app.ts`: `record`, `listing`, các lệnh Prisma trong `save` và DELETE | Tách logic đọc/ghi thành service dùng cho API. Hiện CRUD nằm chung trong `app.ts`, chưa có repository/service riêng | BE |
| `src/validation.ts` | Giữ kiểm tra tên, ID, danh mục và độ dài; sửa quy tắc giá và tách validation POST/PATCH | BE |
| `public/styles.css`, `public/images/*` | Chép CSS và 8 ảnh sang FE, giữ tên class khi chuyển JSX; bổ sung trạng thái loading/error | FE |
| `views/menu.ejs`, `detail.ejs`, `partials/card.ejs` | Chuyển bố cục sang `DishListPage`, `DishDetailPage`, `DishCard`; chuyển vòng lặp/điều kiện EJS thành JSX | FE |
| `views/admin-list.ejs`, `form.ejs`, `delete.ejs`, các partial điều hướng | Làm mẫu cho bảng, form, trang xác nhận dùng chung cho ba tài nguyên | FE |
| `tests/mutations.test.ts`, `ssr.test.ts`, `browser-methods.ts` | Tận dụng dữ liệu kiểm thử, Prisma stub và tình huống lỗi; đổi URL/assertion cho API và SPA | BE, FE; hỗ trợ lập checklist |
| `README.md`, ảnh trong `tmp/screenshots/`, `../presentation.html` | Tham khảo cách chạy và phần giới thiệu; chụp minh chứng Block 6 mới trước khi đưa vào báo cáo | Hỗ trợ trình bày |

Không dùng lại nguyên handler SSR: `render`, redirect 303 và lỗi HTML không đáp ứng contract API mới. `public/admin-forms.js` hiện nhận HTML, thay document và dùng `window.location.assign`; chỉ tham khảo ý tưởng khóa nút, không dùng làm cơ chế SPA.

## 3. Phân công ba người

| Người / vai trò | Công việc cụ thể | Sản phẩm bàn giao | Điều kiện hoàn thành |
|---|---|---|---|
| **1 — BE** | Tạo API từ backend cũ; tách CRUD; đủ 15 endpoint; tìm món theo `q`; validation POST/PATCH; JSON thống nhất; CORS; lỗi kỹ thuật; xử lý ràng buộc dữ liệu cũ | `api/`, contract API, request mẫu và `docs/api-evidence.md` | FE gọi được API thật; đủ CRUD ba tài nguyên; dữ liệu còn sau khi tải lại; có kết quả kiểm tra thành công và lỗi |
| **2 — FE** | Tạo React/Vite; `HashRouter` cho URL `/#/...`; API client chung; chuyển giao diện EJS; hai trang khách và 12 trang quản trị; trạng thái tải/lỗi; form; tìm kiếm; tích hợp BE | `web/`, hướng dẫn chạy FE, `docs/spa-evidence.md` | Đủ 14 URL dùng hash; điều hướng và ghi không tải lại document; reload URL sâu được; lỗi cạnh trường và giữ dữ liệu nhập |
| **3 — Hỗ trợ kiểm thử và trình bày** | Chuyển đề thành checklist; thống nhất contract cùng BE/FE; kiểm thử độc lập; chuẩn bị bản ghi demo; lưu request/ảnh Network; ghi lỗi để BE/FE sửa; tổng hợp báo cáo và điều phối demo | `docs/checklist.md`, `docs/test-evidence.md`, `docs/block-report.html`, `docs/demo-script.md`, phần hướng dẫn chung trong README | Mỗi tiêu chí có bằng chứng hoặc ghi rõ chưa kiểm tra/chưa đạt; báo cáo phân biệt phần tái sử dụng và phần viết mới; có kịch bản trình bày 3 phút |

Để FE không phải viết 12 trang quản trị riêng: tạo **một bảng danh sách, một form thêm/sửa và một trang xác nhận xóa**, cấu hình trường theo `resource`. Dishes có trường và lựa chọn riêng; chefs/ingredients dùng lại khung đó. Người hỗ trợ nhận kiểm thử và tài liệu ngay từ đầu, không chờ cuối buổi mới làm slide.

### Người 1 — BE: thứ tự thực hiện

1. Lấy mã nguồn đầy đủ, xác nhận DB và dữ liệu đọc/ghi được. Bản API mới có entry riêng; không mang điều kiện bắt buộc `SESSION_SECRET`/`ADMIN_PASSWORD_HASH` của trang SSR sang bootstrap API khi chưa triển khai đăng nhập.
2. Hoàn thiện `GET /api/dishes`, `GET /api/dishes/:id` và CORS trước để FE tích hợp.
3. Hoàn thiện POST/PATCH/DELETE dishes; sau đó áp dụng cùng mẫu cho chefs/ingredients.
4. Kiểm tra dữ liệu đầu vào, whitelist, PATCH một trường, 404/400/500 và ràng buộc quan hệ.
5. Bàn giao request mẫu, body JSON thực tế, lệnh chạy và bằng chứng. BE tự kiểm tra phần mình trước khi chuyển sang người hỗ trợ.

### Người 2 — FE: thứ tự thực hiện

Kiến trúc và lịch triển khai riêng cho phần FE trong **30–45 phút**: [FE_ARCHITECTURE.md](C:/2026_2027/web/8-web-application-development/block-06/docs/FE_ARCHITECTURE.md).

1. Tạo layout, `HashRouter`, API client và cấu hình tài nguyên; nhập CSS/ảnh cũ. Khai báo route `/dishes`, `/admin/dishes/...` bên trong router; URL trên thanh địa chỉ tương ứng là `/#/dishes`, `/#/admin/dishes/...`.
2. Chạy danh sách và chi tiết dishes với API thật ngay khi BE có hai GET.
3. Hoàn thiện mẫu admin dishes: danh sách → thêm/sửa → xác nhận xóa.
4. Dùng lại mẫu admin cho chefs/ingredients bằng cấu hình trường.
5. Kiểm tra trạng thái tải, lỗi nghiệp vụ/kỹ thuật, giữ giá trị form, khóa nút, URL sâu và Network. FE tự sửa lỗi giao diện do người hỗ trợ ghi lại.

### Người 3 — hỗ trợ: thứ tự thực hiện

1. Lập checklist từ đề; ghi trạng thái ban đầu là **Chưa kiểm tra**; chuẩn bị bảng phân công và sơ đồ SSR → CSR.
2. Ghi contract đã chốt vào tài liệu để BE/FE cùng dùng; chuẩn bị dữ liệu test không liên kết để kiểm tra xóa chef/ingredient.
3. Khi có API, chạy request mẫu và lưu status/body/header; khi có FE, kiểm tra luồng người dùng và Network.
4. Ghi lỗi bằng mẫu: URL/thao tác → mong đợi → kết quả thực tế → ảnh/output → người sửa. Chuyển lỗi tới đúng người rồi kiểm tra lại.
5. Tổng hợp bằng chứng của cả ba người, chuẩn bị báo cáo HTML và demo. Người này dẫn phần mở đầu/kết luận; BE và FE vẫn tự giải thích phần kỹ thuật của mình.

## 4. Cấu trúc bàn giao và quyền sửa file

Đây là cấu trúc **đề xuất cho Block 6**, chưa phải mã đã tạo:

```text
block-06/
  api/                         # Người 1
    src/
      app.ts                   # Express API mới, không render EJS
      server.ts
      db.ts                    # Từ Block 5
      data.ts                  # Dữ liệu seed/danh mục từ Block 5
      validation.ts
      routes/
      services/
    prisma/                    # Schema, migration, seed từ Block 5
    public/images/             # Giữ để seed cũ đọc ảnh được
    tests/
    .env.example
    package.json
  web/                         # Người 2
    src/
      app/router.tsx           # HashRouter: URL hiển thị /#/...
      lib/api.ts
      config/resources.ts
      components/
      pages/dishes/
      pages/admin/             # List, form, delete dùng chung
      styles.css
    public/images/             # Ảnh cũ dùng cho hero/đường dẫn local
    .env.example
    package.json
  docs/                        # Người 3 tổng hợp
    api-evidence.md            # Người 1 ghi
    spa-evidence.md            # Người 2 ghi
    test-evidence.md           # Người 3 ghi
    checklist.md
    block-report.html
    demo-script.md
  README.md                    # Người 3 tổng hợp; BE/FE cung cấp lệnh
```

BE sở hữu `api/**`; FE sở hữu `web/**`; người hỗ trợ sở hữu tài liệu chung. Mỗi người sửa file evidence của mình. Chốt contract trước khi làm song song; tích hợp sau luồng GET đầu tiên và sau CRUD dishes, không đợi viết xong cả ba tài nguyên.

Không chép `node_modules`, `.npm-cache` hoặc toàn bộ `.env` sang dự án mới. Giữ các phiên bản backend đang dùng khi chuẩn bị `api/package.json`; cài lại dependency cần thiết. Chỉ public API base URL trong FE, ví dụ `VITE_API_BASE_URL=http://localhost:3000/api`; cấu hình database và service role key nằm ở BE.

## 5. Contract BE–FE cần chốt trước khi chia việc

### API bắt buộc theo đề

Mỗi tài nguyên `dishes`, `chefs`, `ingredients` có năm endpoint, tổng cộng **15 endpoint**:

| Method | URL | `data` khi thành công |
|---|---|---|
| GET | `/api/{resource}` | Mảng, có thể rỗng |
| GET | `/api/{resource}/:id` | Bản ghi |
| POST | `/api/{resource}` | Bản ghi mới |
| PATCH | `/api/{resource}/:id` | Bản ghi sau sửa |
| DELETE | `/api/{resource}/:id` | `null` |

Danh sách dishes nhận `q` để tìm tên. Trả mảng trực tiếp trong `data`; không mang nguyên object phân trang `{items,total,page,...}` của SSR sang mà chưa thống nhất với FE. Phạm vi đầu tiên chỉ cần tìm theo tên; nếu bỏ filter/sort/phân trang thì cũng bỏ các điều khiển tương ứng trên UI.

```json
{"ok":true,"data":{"id":1,"name":"Món ăn","price":50000}}
```

```json
{"ok":false,"error":{"code":"VALIDATION_FAILED","message":"Dữ liệu không hợp lệ","fields":{"name":"Vui lòng nhập tên."}}}
```

- Theo đề, thành công và lỗi nghiệp vụ đều HTTP **200**; không có bản ghi dùng `NOT_FOUND`, input sai dùng `VALIDATION_FAILED`.
- Sai URL API trả **404**, JSON hỏng trả **400**, lỗi hệ thống trả **500**; không bọc các lỗi kỹ thuật thành `200, ok:false`. 404/500 không dùng envelope lỗi nghiệp vụ của block.
- CORS dùng origin chính xác từ `SPA_ORIGIN=http://localhost:5173`, không dùng `*`; hỗ trợ OPTIONS, GET, POST, PATCH, DELETE và `Content-Type`. Header CORS có cả trên response lỗi để FE đọc được status.
- SPA gọi trực tiếp API ở origin khác; không dùng dev proxy để bỏ qua phần kiểm tra CORS.
- Dùng `id` số nguyên thống nhất; `price` trong JSON là number sau khi serialize Prisma Decimal; `available` là boolean.
- BE hoàn tất lệnh ghi trước khi response; không gửi HTML/redirect cho thao tác API.

### URL FE theo yêu cầu hash routing

| Nhóm | URL |
|---|---|
| Khách | `/#/dishes`, `/#/dishes/:id` |
| Quản trị dishes | `/#/admin/dishes`, `/#/admin/dishes/new`, `/#/admin/dishes/:id/edit`, `/#/admin/dishes/:id/delete` |
| Quản trị chefs | `/#/admin/chefs`, `/#/admin/chefs/new`, `/#/admin/chefs/:id/edit`, `/#/admin/chefs/:id/delete` |
| Quản trị ingredients | `/#/admin/ingredients`, `/#/admin/ingredients/new`, `/#/admin/ingredients/:id/edit`, `/#/admin/ingredients/:id/delete` |

Tổng **14 URL**, cộng trang fallback khi router không khớp. Không cần trang khách hay trang chi tiết admin riêng cho chefs/ingredients theo ghi chú đề.

Ví dụ phân biệt URL giao diện với request tới BE:

| Người dùng mở | Request dữ liệu tương ứng |
|---|---|
| `http://localhost:5173/#/dishes?q=rau` | `GET http://localhost:3000/api/dishes?q=rau` |
| `http://localhost:5173/#/dishes/1` | `GET http://localhost:3000/api/dishes/1` |
| `http://localhost:5173/#/admin/dishes/1/edit` | Nạp bằng `GET /api/dishes/1`; lưu bằng `PATCH /api/dishes/1` |

FE đặt `HashRouter` ở gốc ứng dụng. Dùng `Link to="/dishes/1"` và `navigate('/admin/dishes')`; router tự tạo phần `/#/`, không thêm hash vào `to`, `navigate` hoặc URL gọi API. Query tìm kiếm nằm trong hash, ví dụ `/#/dishes?q=rau`; đọc/ghi bằng `useSearchParams`, không lấy từ `window.location.search`.

API client dùng chung có interface `request(path, options) → data`, lỗi có `kind`, `code`, `fields`. Kiểm tra lần lượt lỗi mạng/CORS, HTTP hoặc body không phải JSON, rồi `ok:false`. Chỉ đặt `Content-Type: application/json` khi có JSON body.

Mỗi trang tự tải theo URL; `q` nằm trong query URL. Không giữ danh sách/bản ghi trong global store. Ghi thành công → router điều hướng → trang đích tải lại dữ liệu. Link nội bộ dùng router; form chặn submit mặc định. Xóa chỉ gửi DELETE khi nhấn nút xác nhận. Form giữ giá trị khi lỗi và khóa nút khi đang gửi.

Khi mở thẳng/reload `/#/dishes/1`, server FE nhận request `/`, trả entry SPA, rồi `HashRouter` chọn trang từ fragment. Không cần rewrite đường dẫn `/dishes/1` cho URL hash này; vẫn kiểm tra mở tab mới, reload, Back/Forward và route hash không khớp. Hash routing không thay thế CORS: FE và API vẫn chạy ở hai origin khác nhau.

## 6. Những điểm phải sửa vì Block 5 khác đề Block 6

| Điểm đã thấy trong mã | Quyết định cho kế hoạch | Người xử lý |
|---|---|---|
| `src/db.ts` có chế độ demo; `app.ts` chặn ghi khi demo | Dữ liệu mảng chỉ để seed/tham khảo. Nghiệm thu CRUD với Prisma/DB thật; nếu chưa kết nối được thì ghi chưa đạt | BE + hỗ trợ kiểm chứng |
| `validation.ts` yêu cầu `price >= 1000` | API và input FE cho phép giá nguyên **>= 0**; kiểm tra giá 0, giá âm, số lẻ và giá thiếu; không biến chuỗi rỗng/null thành 0 | BE + FE |
| Schema validation hiện phục vụ form đầy đủ; `available` thiếu bị chuyển thành false, `bio` có default | Tách schema tạo và PATCH. PATCH chỉ cập nhật trường có trong request, không reset trường thiếu hoặc quan hệ; giữ `false` và `0` hợp lệ | BE |
| `Dish.chefId` và `Dish.imagePath` bắt buộc trong schema | Giữ schema: FE có select đầu bếp từ `/api/chefs`; khi thêm BE kiểm tra chefId tồn tại và gán ảnh local mặc định nếu không gửi ảnh. Sửa giữ ảnh/chef hiện tại nếu không gửi | BE + FE |
| `save()` cũ bắt file upload và xử lý multipart; mỗi lần sửa thay toàn bộ quan hệ nguyên liệu | Luồng API cơ bản dùng JSON. Chưa chuyển upload/định lượng vào form; không gọi nguyên `save()` cũ, không xóa quan hệ khi PATCH không gửi chúng | BE |
| Chef/Ingredient bị `onDelete: Restrict`, tên Ingredient unique | Giữ ràng buộc; chuyển lỗi trùng tên thành validation. Đề xuất quy ước bổ sung: xóa tài nguyên đang được dùng trả `200, VALIDATION_FAILED` cùng thông báo chung; FE hiện trên trang xác nhận. Ghi đây là xử lý bổ sung do schema cũ, không phải dòng bắt buộc trong bảng đề | BE; hỗ trợ test bản ghi độc lập và bản ghi đang liên kết |
| API có thể nhận giá Prisma Decimal và đường dẫn object Storage | BE trả `price` number và bổ sung `imageUrl` từ helper cũ; FE dùng `imageUrl`. Ảnh `/images/*` có sẵn tại `web/public/images`; ảnh Storage dùng URL đầy đủ | BE + FE |
| `app.ts` cũ có login/session/CSRF, điều kiện khởi động và lỗi EJS toàn cục | Tạo API entry riêng phục vụ phạm vi local của bài. Không chuyển nguyên chuỗi middleware SSR sang API. Auth/upload không nằm trong phần triển khai bắt buộc này; mã Block 5 gốc vẫn là tài liệu đối chiếu | BE |
| `public/admin-forms.js` nhận HTML, `window.location.assign` | Thay bằng API client JSON + React Router, cập nhật state form và `navigate` | FE |
| Test cũ kỳ vọng 303, 400 validation và 404 bản ghi | Giữ tình huống và stub, đổi kỳ vọng theo contract API mới. Test SSR cũ không chứng minh SPA đã đạt | BE + FE |

Quyết định giữ `chefId` và ảnh mặc định giúp dùng lại database mà không phải migration chỉ để bỏ các trường bắt buộc. Quan hệ có sẵn vẫn được bảo toàn; không xây thêm màn hình quản lý định lượng trong phạm vi đầu tiên.

## 7. Mốc phối hợp và nghiệm thu

| Mốc | BE | FE | Hỗ trợ | Điều kiện chuyển bước |
|---|---|---|---|---|
| Chuẩn bị | Kiểm tra source/DB, chốt JSON và dữ liệu | Chốt router, CSS, cấu hình tài nguyên | Checklist, bản ghi demo, contract | Có code nền đầy đủ và DB sẵn sàng |
| Tích hợp 1 | Hai GET dishes + CORS | Danh sách/chi tiết gọi API thật | Lưu bằng chứng origin và JSON | Browser hiển thị dữ liệu thật |
| Tích hợp 2 | Đủ CRUD dishes | Đủ sáu URL dishes; khung admin dùng chung | Test lỗi form, giá 0, dữ liệu sau ghi | Một tài nguyên chạy hoàn chỉnh |
| Mở rộng | CRUD chefs/ingredients | Áp dụng cấu hình cho tám URL còn lại | Chạy bảng 15 endpoint và 14 URL | Đủ phạm vi bắt buộc |
| Chốt | Sửa lỗi API, lưu request | Sửa lỗi UI/routing, chốt lệnh chạy | Báo cáo, minh chứng, tập demo | Tiêu chí có kết quả thật |

Nếu nhóm vẫn làm trong **45 phút như kế hoạch tham khảo**, chỉ bắt đầu tính giờ sau khi source đầy đủ, dependency, DB và dữ liệu đã sẵn sàng: 0–5 chốt contract; 5–15 tích hợp GET; 15–25 CRUD dishes; 25–35 hai tài nguyên còn lại và kiểm tra; 35–42 sửa lỗi/tài liệu; 42–45 demo. Đây là mục tiêu có điều kiện. Nếu chưa đạt mốc, giữ checklist và báo đúng phần còn thiếu; giảm trang trí, upload, filter/sort và tính năng ngoài đề.

Checklist chung do người hỗ trợ theo dõi, BE/FE cùng cung cấp bằng chứng:

- [ ] 15 endpoint thành công; dishes có tìm kiếm `q`; danh sách rỗng vẫn thành công.
- [ ] `NOT_FOUND`, validation có `fields`, whitelist và PATCH một trường đúng.
- [ ] Giá 0 được chấp nhận; giá âm/số lẻ/thiếu bị từ chối; boolean false không bị mất.
- [ ] Sai URL 404, JSON hỏng 400, lỗi hệ thống 500; không trả HTML/redirect thay API.
- [ ] CORS đúng origin trên request thật và preflight; SPA gọi API trực tiếp.
- [ ] CRUD cả ba tài nguyên lưu thật; reload sau ghi vẫn thấy kết quả.
- [ ] Đủ 14 URL dạng `/#/...`; mở thẳng/reload route sâu, Back/Forward và router fallback hoạt động.
- [ ] `/#/dishes?q=...` giữ đúng từ khóa sau reload/Back; request API là `/api/dishes?q=...`, không chứa `#`.
- [ ] Điều hướng và lệnh ghi không phát sinh document request mới.
- [ ] Loading, empty, NOT_FOUND và lỗi kỹ thuật hiển thị đúng; API tắt không làm trang trắng.
- [ ] Form giữ dữ liệu, lỗi cạnh trường, khóa nút đang gửi; DELETE chỉ sau xác nhận.
- [ ] Không mất ảnh/chef/quan hệ nguyên liệu khi PATCH không gửi các trường đó; lỗi unique/FK được hiển thị.
- [ ] Báo cáo nêu rõ phần tái sử dụng, phần viết mới, kết quả đã chạy và lỗi còn lại.

Mỗi bằng chứng ghi: **tiêu chí → thao tác/request → status/body hoặc UI thực tế → đường dẫn ảnh/output → trạng thái**. Không dùng ảnh Block 5 cũ làm bằng chứng hoàn thành Block 6. Với kiểm tra lỗi DB, dùng môi trường test hoặc stub có kiểm soát, không thêm endpoint gây lỗi vào bản bàn giao.

## 8. Kịch bản trình bày 3 phút

| Thời gian | Người | Nội dung |
|---|---|---|
| 00:00–00:30 | Hỗ trợ | Giới thiệu Bếp Nhà, ba vai trò, sơ đồ SSR → CSR; nêu DB/CSS/ảnh/logic nào đã tái sử dụng |
| 00:30–01:15 | BE | Một API thành công, một `VALIDATION_FAILED`; giải thích status 200 nghiệp vụ và 404/500 kỹ thuật; chỉ header CORS |
| 01:15–02:15 | FE | Tìm món, xem chi tiết, thử form sai rồi sửa đúng; chỉ URL `/#/...` và request `/api/...` trong Fetch/XHR, không có document request khi điều hướng; reload `/#/dishes/1` |
| 02:15–02:45 | Hỗ trợ | Demo ngắn admin chefs/ingredients trên bản ghi đã chuẩn bị; chỉ bảng CRUD có bằng chứng |
| 02:45–03:00 | Hỗ trợ | Nêu kết quả đạt/chưa đạt, lỗi còn lại và vị trí mã/tài liệu |

Mở sẵn tab và request mẫu. Từng người giải thích được phần mình phụ trách; người hỗ trợ tổng hợp báo cáo dựa trên bằng chứng do cả nhóm tạo.
