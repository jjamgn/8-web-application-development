# Bếp Nhà — Restaurant SSR

Ứng dụng thực đơn và quản trị bằng **Express 5 + EJS + TypeScript + Prisma 6 + Supabase PostgreSQL/Storage**. HTML được render trên server. Trang quản trị dùng JavaScript fetch để gửi PATCH/DELETE trực tiếp theo yêu cầu cập nhật; các trang và lỗi validation vẫn render bằng EJS trên server.

## Chạy nhanh trên Windows

Yêu cầu Node.js 20.14 trở lên. Các lệnh chạy tại thư mục dự án:

```powershell
npm install
Copy-Item .env.example .env # Chỉ chạy nếu chưa có .env; không ghi đè cấu hình đã nhập.
npm run db:generate
npm run dev
```

- Thực đơn: http://localhost:3000/dishes
- Chi tiết: http://localhost:3000/dishes/1 (hỗ trợ cả /dish/1)
- Quản trị: http://localhost:3000/admin/dishes

Mặc định `DEMO_MODE=true`: 8 món ăn, 3 đầu bếp, 10 nguyên liệu trong mã nguồn; trang quản trị cho xem form nhưng **mọi thao tác ghi đều bị chặn**. Demo không giả lập database và không lưu dữ liệu. 8 ảnh tự tạo bằng imagegen nằm trong `public/images`; ảnh mang tính minh họa.

## Kết nối Supabase thật

1. Mở project Supabase của bạn. Trong **Connect**, lấy chuỗi PostgreSQL. Điền `DATABASE_URL` cho runtime và `DIRECT_URL` cho migration trong `.env`. Đổi placeholder mật khẩu; ký tự đặc biệt trong mật khẩu phải URL encode. Nếu máy không có IPv6, dùng **Session pooler** tương thích IPv4 cho cả hai. Không dùng transaction pooler cho migration.
2. Điền `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` từ cài đặt API của project. Đây phải là key có quyền quản trị Storage, chỉ dùng trên server. Không dùng anon key thay service role key. Không commit `.env`.
3. Giữ `SUPABASE_STORAGE_BUCKET=dish-images`. Script seed tự tạo bucket public nếu chưa có và upload ảnh; nếu bucket có sẵn ở trạng thái private, script sẽ yêu cầu bạn cấu hình lại thay vì tự đổi quyền.
4. Chạy `npm run admin:setup`. Lệnh tạo mật khẩu ngẫu nhiên, chỉ hiển thị một lần trong terminal; lưu bcrypt hash và session secret vào `.env`. Lưu mật khẩu trong trình quản lý mật khẩu. Chỉnh `ADMIN_EMAIL` nếu muốn. Chạy lại lệnh này sẽ đổi mật khẩu.
5. Áp dụng migration và dữ liệu mẫu:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

6. Đặt `DEMO_MODE=false` rồi khởi động lại `npm run dev`. Đăng nhập ở `/admin/login` bằng email đã cấu hình và mật khẩu bước 4.

`npm run config:check` kiểm tra đủ cấu hình mà không in bí mật. `npm run config:connect` kiểm tra kết nối PostgreSQL và xác thực Storage bằng thao tác chỉ đọc.

Không cần tạo bảng thủ công trong Supabase Table Editor. `prisma/schema.prisma` là nguồn định nghĩa model; migration SQL được sinh từ schema. Với thay đổi schema trong quá trình phát triển, tạo migration bằng `npx prisma migrate dev --name ten_thay_doi` trên database phát triển có hỗ trợ shadow database. Database dùng chung/triển khai áp dụng migration bằng `npm run db:migrate`. Có `npm run db:push` cho thử nghiệm nhanh, nhưng nên giữ migration làm lịch sử chính thức.

Seed giữ nguyên các record ID mẫu đã tồn tại, không xóa dữ liệu quản trị; ảnh dưới prefix `seed/` chỉ được tải lên nếu chưa có. Dùng database phát triển riêng khi seed lần đầu để tránh trùng ID với dữ liệu có sẵn. Ảnh quản trị upload dùng tên ngẫu nhiên dưới `uploads/`. Khi sửa/xóa món, ảnh quản trị cũ được dọn theo khả năng; ảnh seed dùng chung không bị xóa. Nếu Storage lỗi trong bước dọn ảnh sau khi đã lưu database, dữ liệu món vẫn được giữ và có thể cần dọn object cũ thủ công.

## Dữ liệu và route

- `Dish`: tên, mô tả, giá Decimal VNĐ, danh mục, trạng thái, đường dẫn ảnh, đầu bếp.
- `Chef`: tên, chuyên môn, giới thiệu.
- `Ingredient`: tên duy nhất, đơn vị.
- `DishIngredient`: quan hệ nhiều–nhiều và định lượng mỗi phần.

Ảnh lưu trong Supabase Storage; PostgreSQL lưu đường dẫn object, không lưu binary ảnh. Mỗi món có URL riêng; trang chi tiết hiện đầu bếp và nguyên liệu.

| Chức năng | Method và URL |
| --- | --- |
| Danh sách khách | GET `/dishes?q=&category=&available=&sort=&page=` |
| Chi tiết | GET `/dishes/:id` |
| Danh sách quản trị | GET `/admin/:kind?q=&category=&available=&page=` |
| Form thêm | GET `/admin/:kind/new` |
| Thêm | POST `/admin/:kind` |
| Form sửa | GET `/admin/:kind/:id/edit` |
| Sửa | PATCH `/admin/:kind/:id` |
| Xác nhận xóa | GET `/admin/:kind/:id/delete` |
| Xóa | DELETE `/admin/:kind/:id` |

`:kind` là `dishes`, `chefs`, `ingredients`. Khi bật JavaScript, form sửa/xóa gửi PATCH/DELETE trực tiếp, kèm CSRF token và dữ liệu multipart. Network hiển thị đúng PATCH/DELETE. Khi JavaScript bị tắt, form dự phòng gửi POST với hidden `_method=PATCH/DELETE`; chỉ POST được override. Việc dùng fetch là thay đổi so với tiêu chí không dùng AJAX trong slide ban đầu. GET tuyệt đối không thay đổi record. Thao tác thành công redirect **303**; dữ liệu không hợp lệ trả **400**, giữ lại trường nhập (trình duyệt yêu cầu chọn lại file ảnh); ID không hợp lệ/không tồn tại trả **404**. Search, filter, sort, phân trang đều chạy phía server và giữ điều kiện trên URL. Trang khách 6 món/trang, trang quản trị 8 record/trang.

## Kiểm thử

```powershell
npm run build
npm test
```

Kiểm thử SSR và các luồng form, đăng nhập, CSRF, validation, method override, quan hệ dữ liệu, redirect, XSS, ID lỗi. Bộ test mutations dùng Prisma stub trong bộ nhớ, **không kết nối hoặc ghi vào Supabase**; cần kiểm thử thêm database và upload thật sau khi có credentials. Không chạy seed hoặc migration trên database test tự động.

## Phạm vi triển khai

Ứng dụng hiện cấu hình chạy cục bộ ở `127.0.0.1`. Session dùng MemoryStore, phù hợp phát triển; trước khi đưa lên Internet cần thay bằng session store bền vững (PostgreSQL/Redis), cấu hình HTTPS, proxy và secure cookie tương ứng. Public Storage cho phép xem ảnh, còn key quản trị và kết nối database chỉ ở server. Không đưa khóa bí mật ra EJS hoặc log. Migration bật RLS cho các bảng ứng dụng; browser không truy vấn trực tiếp bảng qua Supabase REST API. Backend cần database role có quyền phù hợp (chuỗi kết nối server của project).
