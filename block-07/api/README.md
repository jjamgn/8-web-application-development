# Bếp Nhà — Block 07 backend / TV1 Search API

Backend độc lập, phát triển từ Block5: Express 5, TypeScript, Prisma 6, PostgreSQL/Supabase. Không cần thư mục Block5 để cài, chạy hoặc seed. Phạm vi API local theo tài liệu phân công; không có đăng nhập, session, CSRF, EJS hay upload multipart.

## Chạy

Yêu cầu Node.js >= 20.14. Từ `block-07/api`:

```powershell
npm ci
Copy-Item .env.example .env # Chỉ chạy nếu chưa có .env.
# Điền DATABASE_URL và DIRECT_URL trong .env.
npm run db:generate
npm run build
npm test
npm run dev
```

API: `http://localhost:3000/api/dishes`. Đặt `SPA_ORIGIN` trùng chính xác origin FE (mặc định `http://localhost:5173`, không có dấu `/` cuối). FE gọi API trực tiếp, không cần proxy. JSON API không dùng `DEMO_MODE` hay các biến đăng nhập của Block5; mọi CRUD gọi Prisma thật.

Database Block5 có CHECK `price >= 1000`: chạy `npm run db:migrate` để áp dụng migration Block6 cho phép giá 0, không cần seed lại dữ liệu cũ. Với database phát triển mới:

```powershell
npm run db:migrate
# Điền thêm SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY để seed ảnh Storage.
npm run db:seed
```

Schema, migration ban đầu và seed được chép nguyên từ Block5; bổ sung migration `202610230001_allow_zero_price` để đổi CHECK giá sang `>= 0`. Seed đọc ảnh ngay trong `api/public/images`, giữ ID đã tồn tại và không cập nhật bản ghi cũ. Service role key chỉ dùng trên backend, không đưa vào FE. Chạy migration/seed trên database phát triển của bạn trước khi nghiệm thu; các lệnh này thay đổi database. `db:push` có sẵn cho database thử nghiệm nhưng không cập nhật CHECK thủ công, vì vậy dùng `db:migrate` cho Block7 trên database phát triển.

## Cấu trúc

```text
api/
  src/
    app.ts                 # CORS, JSON, routers, lỗi
    server.ts              # Cổng riêng, mặc định loopback
    db.ts                  # Prisma và URL Storage từ Block5
    data.ts                # Dữ liệu gốc cho seed, không làm DB giả
    validation.ts          # POST và PATCH riêng
    routes/resources.ts    # Năm route dùng chung cho mỗi tài nguyên
    services/resources.ts  # CRUD Prisma và serialize Decimal
    services/dish-search.ts # Search, filter, sort và pagination
  prisma/                  # Schema, migration, seed gốc
  public/images/           # Ảnh gốc để seed độc lập
  tests/api.test.ts        # HTTP contract với Prisma stub
  requests.http            # Request mẫu cho DB phát triển
  .env.example
  package.json
  package-lock.json
  tsconfig.json
```

## Contract cho FE

Mỗi `resource` là `dishes`, `chefs`, `ingredients` có đủ năm endpoint, tổng 15:

| Method | URL | `data` thành công |
|---|---|---|
| GET | `/api/{resource}` | Mảng với `chefs`/`ingredients`; trang kết quả với `dishes` |
| GET | `/api/{resource}/:id` | Bản ghi |
| POST | `/api/{resource}` | Bản ghi đã tạo |
| PATCH | `/api/{resource}/:id` | Bản ghi đã sửa |
| DELETE | `/api/{resource}/:id` | `null` |

`GET /api/dishes` hỗ trợ tìm kiếm, lọc, sắp xếp và phân trang ở server. Response danh sách món đổi từ mảng sang object phân trang; client đọc danh sách tại `data.items`. `GET /api/chefs`, `GET /api/ingredients`, chi tiết và các mutation giữ nguyên shape cũ. Dish trả kèm `chef`, `ingredients[].ingredient`; `price` và `quantity` là number, `available` là boolean. Các ID là số nguyên dương trong miền PostgreSQL Int.

### Danh sách món, filter, sort và search

| Tham số | Giá trị / mặc định | Ghi chú |
|---|---|---|
| `mode` | `basic` (mặc định), `advanced`, `fulltext`, `fuzzy` | Basic/Advanced tìm một phần tên; Full-text tìm trên tên + mô tả; Fuzzy tìm tên gần giống và cần `q` |
| `q` | tùy chọn, tối đa 160 ký tự | Basic/Advanced dùng `ILIKE` không phân biệt hoa thường; ký tự `%`, `_`, `!` được tìm theo nghĩa đen |
| `category` | tùy chọn, tối đa 60 ký tự | So khớp chính xác |
| `minPrice`, `maxPrice` | tùy chọn, số nguyên từ 0 đến 999999999 | Bao gồm cả hai đầu mút; `0` hợp lệ |
| `available` | `true` hoặc `false` | So khớp đúng trạng thái, kể cả `false` |
| `sort` | tùy chọn | `name_asc`, `name_desc`, `price_asc`, `price_desc`; mặc định theo `id` tăng dần |
| `page` | `1` | Số nguyên dương |
| `pageSize` | `12` | Số nguyên từ 1 đến 100 |

Filter được ghép bằng AND và áp dụng trước sort, pagination. `total` đếm kết quả sau tìm kiếm/filter và trước pagination. Fuzzy dùng ngưỡng similarity 0.3, xếp similarity giảm dần rồi `id` tăng dần để kết quả ổn định; `sort` không đổi thứ tự xếp hạng này. Full-text dùng `simple` cho document và query, có xử lý trường NULL. Full-text/Fuzzy yêu cầu `q`; Advanced có thể chỉ dùng filter. Tham số lặp, không hợp lệ, ngoài contract hoặc khoảng giá đảo chiều trả HTTP 200 với `VALIDATION_FAILED` và `error.fields`.

```http
GET /api/dishes?mode=advanced&q=chicken&category=M%C3%B3n%20ch%C3%ADnh&minPrice=0&available=false&sort=price_asc&page=1&pageSize=12
```

Response danh sách món:

```json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 12
  },
  "error": null
}
```

Các truy vấn đều dùng tham số SQL; chạy `npm run db:migrate` để bật extension `pg_trgm` cho chế độ Fuzzy.

Thành công HTTP **200**:

```json
{"ok":true,"data":{"id":9,"name":"Món mới","price":0,"available":false}}
```

Lỗi nghiệp vụ HTTP **200**:

```json
{"ok":false,"error":{"code":"VALIDATION_FAILED","message":"Dữ liệu không hợp lệ.","fields":{"price":"Giá phải >= 0."}}}
```

ID sai/không có dùng `NOT_FOUND`. Trùng tên Ingredient và ràng buộc liên kết khi ghi/xóa dùng `VALIDATION_FAILED`; `fields` có thể rỗng đối với lỗi liên kết chung. Sai endpoint/method **404**, JSON hỏng **400**, body quá lớn **413**, encoding không hỗ trợ **415**, lỗi hệ thống/database **500** trả JSON kỹ thuật `{"message":"..."}` và không có envelope nghiệp vụ `ok/error`. Không trả HTML hay redirect. CORS hiện diện cho đúng origin kể cả lỗi; OPTIONS trả 204, cho phép GET/POST/PATCH/DELETE và Content-Type.

Gửi `Content-Type: application/json` khi có body. Giá, ID đầu bếp phải là number JSON; giá nguyên từ 0 tới 999999999. Không ép `null`, chuỗi rỗng hay chuỗi số thành 0. Boolean dùng `true`/`false`, không dùng `on` hay chuỗi `"false"`.

| Tài nguyên | POST bắt buộc | POST tùy chọn | PATCH |
|---|---|---|---|
| dishes | `name`, `description`, `price`, `category`, `chefId` | `available` (mặc định true) | Bất kỳ tập con không rỗng của các trường này |
| chefs | `name`, `specialty` | `bio` (mặc định chuỗi rỗng) | `name`, `specialty`, `bio` |
| ingredients | `name`, `unit` | Không | `name`, `unit` |

Tên được trim và không rỗng: dish tối đa 160 ký tự; chef/ingredient 120. Description 5000, specialty 200, bio 3000, unit 30. Danh mục: `Khai vị`, `Món chính`, `Món chay`, `Tráng miệng`.

Whitelist bỏ trường ngoài contract, gồm `id`, timestamps, `imagePath`, `imageUrl`, `ingredients`, nested relation. PATCH rỗng hoặc chỉ gồm trường ngoài contract bị từ chối. Không có trường nào ngầm reset khi PATCH thiếu. Tạo Dish gán `imagePath=/images/beef.png`; PATCH giữ ảnh và công thức cũ. Không nhận upload/định lượng trong phiên bản này. Xóa món sử dụng cascade của schema cho công thức; không tự xóa object Storage có thể được dùng chung.

`imageUrl` trả đường dẫn `/images/*` cho ảnh local (FE cần ảnh tại `web/public/images` như phân công), hoặc URL đầy đủ của Supabase Storage cho object ảnh. Ảnh trong `api/public/images` phục vụ seed, API không phục vụ giao diện hay static assets cho FE.

## Tích hợp Block 7

Block 7 kế thừa website, schema, seed, CRUD và giao diện từ Block 6. TV1 bổ sung phân trang, filter/sort server-side, Basic/Advanced, Full-text và Fuzzy Search; migration `202610300001_enable_pg_trgm` bật extension cho Fuzzy. Chỉ áp dụng migration và seed trên database phát triển.

`GET /api/dishes` đổi từ mảng sang object phân trang; client đọc món tại `data.items`. Frontend được sao chép nguyên trạng từ Block 6, nên TV2 cần cập nhật các màn hình danh sách để đọc contract mới. TV3 phụ trách seed dữ liệu và UI filter/sort.

`api/tests/api.test.ts` được kế thừa từ Block 6 và chưa mô phỏng `$queryRaw` hoặc response phân trang mới; cần cập nhật trước khi dùng bộ test này để nghiệm thu Search API. Chưa có kết quả build, test, migration hay seed database nào được ghi nhận cho Block 7.