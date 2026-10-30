# Bếp Nhà — Block 07 backend

Backend độc lập, phát triển từ Block5: Express 5, TypeScript, Prisma 6, PostgreSQL/Supabase. Không cần thư mục Block5 để cài, chạy hoặc seed. Phạm vi API local theo tài liệu phân công; không có đăng nhập, session, CSRF, EJS hay upload multipart.

## Chạy

Yêu cầu Node.js >= 20.14. Từ `block-06/api`:

```powershell
npm ci
Copy-Item .env.example .env # Chỉ chạy nếu chưa có .env.
# Điền DATABASE_URL và DIRECT_URL trong .env.
npm run db:generate
npm run build
npm test
npm run dev
```

API: `http://localhost:3000/api/dishes`. Đặt `SPA_ORIGIN` trùng origin FE (mặc định `http://localhost:5173`, không có dấu `/` cuối). Với origin local, cả `localhost` và `127.0.0.1` trên cùng cổng đều được phép. Có thể khai báo thêm origin bằng dấu phẩy, ví dụ `SPA_ORIGIN=http://localhost:5173,http://localhost:4173`. FE gọi API trực tiếp, không cần proxy. JSON API không dùng `DEMO_MODE` hay các biến đăng nhập của Block5; mọi CRUD gọi Prisma thật.

Database Block5 có CHECK `price >= 1000`: chạy `npm run db:migrate` để áp dụng migration Block6 cho phép giá 0, không cần seed lại dữ liệu cũ. Với database phát triển mới:

```powershell
npm run db:migrate
# Điền thêm SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY để seed ảnh Storage.
npm run db:seed
```

Schema, migration ban đầu và seed được chép nguyên từ Block5; bổ sung migration `202610230001_allow_zero_price` để đổi CHECK giá sang `>= 0`. Seed đọc ảnh ngay trong `api/public/images`, giữ ID đã tồn tại và không cập nhật bản ghi cũ. Service role key chỉ dùng trên backend, không đưa vào FE. Chạy migration/seed trên database phát triển của bạn trước khi nghiệm thu; các lệnh này thay đổi database. `db:push` có sẵn cho database thử nghiệm nhưng không cập nhật CHECK thủ công, vì vậy dùng `db:migrate` cho Block6.

## Bổ sung thực đơn đến 1.000 món

Sử dụng database trong `api/.env`, chạy từ thư mục `api`:

```powershell
npm run db:seed:menu -- --dry-run
npm run db:seed:menu
```

Script `prisma/seed-menu.ts` bổ sung đến tổng 1.000 món từ danh mục trong `prisma/menu-catalog.ts`. Các món khác nhau về nguyên liệu chính, cách chế biến hoặc tổ hợp nguyên liệu; mỗi món có mô tả, giá, danh mục, đầu bếp và công thức/định lượng. Script cũng sửa các bản mẫu có hậu tố `— Phiên bản 0001` từng được tạo bởi phiên bản seed cũ, hoàn thiện ba món thử nghiệm thiếu công thức và sửa danh mục panna cotta. Tái sử dụng đầu bếp có đầy đủ tên, chuyên môn, giới thiệu và bổ sung nguyên liệu còn thiếu. Toàn bộ thay đổi database nằm trong một transaction. Chạy lại khi đủ 1.000 món không tạo thêm. Xuất thông tin và prompt ảnh riêng từng món vào `docs/menu-images/manifest.json`.

Ảnh dùng kết hợp ảnh AI và ảnh minh họa tìm trên mạng theo yêu cầu. Các kết quả tìm kiếm nằm trong `docs/menu-images/online-candidates`; nguồn ảnh đã chọn và hash nằm trong `docs/menu-images/sources`. Chạy từ `api`:

```powershell
npm run db:images:source
npm run db:verify:menu -- --images
```

Lệnh lấy ảnh tiếp tục từ tiến độ đã lưu, kiểm tra file và ảnh trùng, tải ảnh vào `web/public/images/sourced`, ghi nguồn tại `credits.html`, rồi cập nhật `Dish.imagePath` theo cả ID và tên. Ảnh AI nằm trong `web/public/images/generated`. Các bản gốc thuộc nguồn tương ứng; thông tin nguồn được liên kết trên trang chi tiết món. Database chỉ lưu đường dẫn, không lưu nội dung nhị phân ảnh. Bản sao dữ liệu trước khi sửa nằm trong `docs/menu-images/before-correction.json`; báo cáo kiểm tra mới nhất nằm trong `verification.json` và `image-verification.json` cùng thư mục.

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
| GET | `/api/{resource}` | Object phân trang với dishes; mảng với chefs/ingredients |
| GET | `/api/{resource}/:id` | Bản ghi |
| POST | `/api/{resource}` | Bản ghi đã tạo |
| PATCH | `/api/{resource}/:id` | Bản ghi đã sửa |
| DELETE | `/api/{resource}/:id` | `null` |

`GET /api/dishes` nhận phần Search API từ nhánh `feature/search-api`. Kết quả món nằm tại `data.items`; `data` còn có `total`, `page`, `pageSize`. Danh sách đầu bếp và nguyên liệu vẫn trả mảng. Dish trả kèm `chef`, `ingredients[].ingredient`; `price` và `quantity` là number, `available` là boolean. Các ID là số nguyên dương trong miền PostgreSQL Int.

### Tìm kiếm và phân trang món ăn

Tham số hỗ trợ: `mode=basic|advanced|fulltext|fuzzy`, `q` tối đa 160 ký tự, `category`, `minPrice`, `maxPrice`, `available=true|false`, `sort=name_asc|name_desc|price_asc|price_desc`, `page` (mặc định 1), `pageSize` (mặc định 12, tối đa 100). Filter áp dụng trước phân trang; giá 0 và trạng thái false hợp lệ. Fulltext tìm trên tên và mô tả; fuzzy tìm tên gần giống, hai chế độ này yêu cầu `q`.

Migration `202610300001_enable_pg_trgm` bổ sung extension PostgreSQL cho fuzzy search. Việc lấy code không tự chạy migration hoặc seed lại database. Khi chuẩn bị bật fuzzy trên database phát triển, áp dụng migration bằng `npm run db:migrate`.

Ví dụ: `GET /api/dishes?mode=advanced&category=M%C3%B3n%20chay&minPrice=0&available=false&sort=price_asc&page=1&pageSize=12`.

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

## Kiểm chứng và phần tái sử dụng

Xem `../docs/api-evidence.md` để biết kết quả đã chạy và phần cần kiểm tra DB thật. `npm test` chỉ dùng stub Prisma có kiểm soát, không chứng minh dữ liệu tồn tại trong PostgreSQL sau khi khởi động lại.

Đã chép nguyên schema, migration, seed, data và 8 ảnh Block5. Giữ Prisma client/URL ảnh và hướng CRUD đọc/ghi; tách khỏi handler SSR để trả JSON, thêm CORS, whitelist, partial PATCH và lỗi theo contract Block6. Tình huống kiểm thử/stub được phát triển từ `tests/mutations.test.ts` Block5. Không chép `node_modules`, cache, `.env`, EJS hoặc code FE. Dự án không có import/path runtime tới Block5.
