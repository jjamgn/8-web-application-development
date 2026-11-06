# API Block 7

Cập nhật: thêm GET ingredients có phân trang/tìm không dấu và ghi công thức qua trường ingredients của POST/PATCH dishes. Chi tiết contract, migration và nghiệm thu: [Nguyên liệu và tìm kiếm](../docs/INGREDIENTS_AND_SEARCH.md).

Express + Prisma + PostgreSQL/Supabase tiếp nối Block 6. Chạy `.\run.cmd dev`; runner đọc api/.env hoặc cấu hình Block 6 nếu chưa có file mới.

`npm run dev` và các npm scripts cũng dùng cùng runner để nạp cấu hình. Chạy `npm run config:check`, `npm run db:status`, `npm run verify:readonly` để kiểm tra DB/migration/HTTP API mà không sửa dữ liệu. Lệnh verify tạo listener tạm và tự đóng sau kiểm tra, không giữ cổng 3000.

## Danh sách món

```http
GET /api/dishes?mode=advanced&q=rau&minPrice=0&available=false&sort=price_asc&page=1&pageSize=12
```

```json
{"ok":true,"data":{"items":[],"total":0,"page":1,"pageSize":12},"error":null}
```

| Tham số | Giá trị |
|---|---|
| mode | basic (mặc định), advanced, fulltext, fuzzy |
| q | trim, tối đa 160 ký tự |
| category | Khai vị / Món chính / Món chay / Tráng miệng |
| minPrice, maxPrice | Số nguyên 0..999999999, min <= max |
| available | true hoặc false; bỏ tham số để lấy cả hai |
| sort | name_asc/name_desc/price_asc/price_desc/relevance |
| page, pageSize | Số nguyên dương, mặc định 1/12; page <=1000000, pageSize <=100 |

Các điều kiện nối AND. Count sau search/filter, trước LIMIT/OFFSET. Basic/Advanced dùng ILIKE và escape wildcard. Full-text dùng simple trên tên + mô tả, coalesce NULL; fuzzy dùng pg_trgm, similarity >=0.3. Có q trong fulltext/fuzzy: điểm giảm dần, id ASC phân định. Không q dùng sort thông thường. Query bind bằng Prisma.sql; sort lấy từ allowlist.

Count/items trong cùng transaction Repeatable Read, maxWait/timeout 15 giây. OFFSET giữa các request vẫn có thể dịch khi có người khác thêm/xóa; reload lấy tập mới. Frontend chặn request trùng và dedup ID.

Chỉ danh sách dishes đổi sang object pagination. Chefs/ingredients vẫn trả mảng; chi tiết vẫn object; request() frontend bóc lớp data.

Migration 202610300001_search_indexes tạo pg_trgm, chỉ mục full-text/trigram/price-id. Chạy `.\run.cmd db:migrate`. `.\run.cmd db:seed:block7` chỉ thêm số món còn thiếu tới tổng 1.000, không đổi món có sẵn.

## CRUD và ảnh

Giữ GET chi tiết, POST/PATCH/DELETE cho dishes/chefs/ingredients. JSON món nhận các field cũ và imagePath tùy chọn. POST bỏ ảnh dùng /images/beef.png; PATCH bỏ ảnh giữ nguyên. imageUrl là trường đọc, backend suy ra từ imagePath.

```http
POST /api/uploads/dishes
Content-Type: multipart/form-data
# field file: một JPEG/PNG/WebP tối đa 5 MB
```

```json
{"ok":true,"data":{"imagePath":"uploads/uuid.png","imageUrl":"http://127.0.0.1:3000/uploads/uuid.png"},"error":null}
```

FormData để browser tạo boundary. Upload xong gửi imagePath qua POST/PATCH JSON. Backend kiểm tra signature/MIME, dùng UUID thay tên file. Mặc định lưu var/uploads; UPLOAD_STORAGE=supabase dùng bucket public cấu hình sẵn. PUBLIC_API_ORIGIN cần trỏ về origin API truy cập được từ browser khi dùng local ngoài máy này.

imagePath chấp nhận path upload theo UUID, ảnh mặc định hoặc URL HTTPS không chứa user/password. Link ngoài chỉ được lưu tham chiếu, server không fetch nội dung URL. Chưa có job tự dọn file upload mồ côi.

## Lỗi và tương thích

Business/validation giữ convention cũ: HTTP 200, ok:false, error:{code,message,fields}. Frontend cũng đọc envelope nếu response là 4xx. Lỗi kỹ thuật trả JSON chung, không lộ stack hoặc chuỗi kết nối; log chỉ loại/mã lỗi. CORS theo SPA_ORIGIN; khi cấu hình loopback thì cho phép cả localhost và 127.0.0.1 cùng protocol/port để khớp URL Vite.

CRUD quan hệ được giữ. Mô hình quản trị local kế thừa Block 6, chưa bổ sung luồng đăng nhập/phân quyền.
