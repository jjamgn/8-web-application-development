# Bếp Nhà — Restaurant SSR · Block 08

Ứng dụng thực đơn và quản trị bằng **Express 5 + EJS + TypeScript + Prisma 6 + Supabase PostgreSQL/Storage**. HTML được render trên server. Trang quản trị dùng JavaScript fetch để gửi PATCH/DELETE trực tiếp theo yêu cầu cập nhật; các trang và lỗi validation vẫn render bằng EJS trên server.

Block 08 kế thừa ứng dụng nhà hàng và bổ sung xác thực cho đội ngũ quản lý: đăng ký bằng mã mời và CAPTCHA ảnh, xác minh email bằng OTP, đăng nhập/đăng xuất và đặt lại mật khẩu qua email. Email gửi từ server bằng **Nodemailer SMTP**. Tài khoản mới luôn có `role=viewer`, `status=pending`; xác minh chỉ kích hoạt tài khoản, không cấp quyền quản trị. Người quản lý cấp `role=admin` riêng cho tài khoản đã xác minh. Ứng dụng không bổ sung luồng tài khoản khách hàng.

Phần **Người 2 — Vy** gồm đăng nhập, session PostgreSQL, chống brute force và bảo vệ CRUD; hợp đồng module ở [docs/VY.md](docs/VY.md). Phần **Người 3 — Trang** gồm module quên/reset mật khẩu riêng, thu hồi mọi session sau reset, kiểm thử tích hợp và kịch bản demo ở [docs/TRANG.md](docs/TRANG.md). Các giá trị vận hành là mặc định triển khai để nhóm review, không thay xác nhận của ba thành viên trong tài liệu phân công.

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
- Đăng ký tài khoản đội ngũ bằng mã mời: http://localhost:3000/auth/register
- Đăng nhập quản trị: http://localhost:3000/auth/login
- Quên mật khẩu: http://localhost:3000/auth/forgot-password

Mặc định `DEMO_MODE=true`: thực đơn công khai dùng 8 món ăn, 3 đầu bếp, 10 nguyên liệu trong mã nguồn; các form xác thực vẫn hiển thị. `/admin` luôn yêu cầu đăng nhập và quyền admin, kể cả trong demo. POST đăng ký/đăng nhập hợp lệ CSRF trả **503**, không tạo tài khoản và không gửi email. Demo không lưu dữ liệu và không chứng minh session bền vững. 8 ảnh tự tạo bằng imagegen nằm trong `public/images`; ảnh mang tính minh họa.

## Kết nối Supabase thật

1. Mở project Supabase của bạn. Trong **Connect**, lấy chuỗi PostgreSQL. Điền `DATABASE_URL` cho runtime và `DIRECT_URL` cho migration trong `.env`. Đổi placeholder mật khẩu; ký tự đặc biệt trong mật khẩu phải URL encode. Nếu máy không có IPv6, dùng **Session pooler** tương thích IPv4 cho cả hai. Không dùng transaction pooler cho migration.
2. Điền `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` từ cài đặt API của project. Đây phải là key có quyền quản trị Storage, chỉ dùng trên server. Không dùng anon key thay service role key. Không commit `.env`.
3. Giữ `SUPABASE_STORAGE_BUCKET=dish-images`. Script seed tự tạo bucket public nếu chưa có và upload ảnh; nếu bucket có sẵn ở trạng thái private, script sẽ yêu cầu bạn cấu hình lại thay vì tự đổi quyền.
4. Chạy `npm run admin:setup` để tạo `ADMIN_REGISTRATION_CODE` ngẫu nhiên và `SESSION_SECRET` trong `.env`. Mã mời chỉ hiển thị một lần trong terminal; lưu trong trình quản lý mật khẩu và chỉ chia sẻ với người được phép tạo tài khoản đội ngũ. Có thể tự cấu hình mã mời ngẫu nhiên tối thiểu **16 ký tự** và session secret tối thiểu **32 ký tự**. Script không tạo tài khoản hoặc cấp quyền admin.
5. Áp dụng migration và dữ liệu mẫu:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

6. Cấu hình SMTP và `APP_URL` theo phần bên dưới. Đặt `DEMO_MODE=false` rồi khởi động lại `npm run dev`. Mở `/auth/register`, nhập mã mời và đăng ký bằng email của thành viên đội ngũ; xác minh OTP nhận qua email. Đăng nhập ở `/auth/login`: viewer được chuyển đến `/auth/account` để chờ cấp quyền; admin được chuyển đến `/admin/dishes`. Đường dẫn `/admin/login` chuyển sang cùng trang đăng nhập này.
7. Người quản lý chạy `npm run admin:promote -- --email admin@example.com` để cấp quyền cho tài khoản **đã tồn tại, active và đã xác minh email**. Lệnh không tạo user mới, không đổi mật khẩu và không bỏ qua xác minh. Dùng email thật đã đăng ký; không cấp quyền qua form hoặc tham số request.

`npm run config:check` kiểm tra cấu hình database, Storage, quản trị, SMTP và URL ứng dụng mà không in bí mật. `npm run config:connect` kiểm tra PostgreSQL bằng `SELECT 1`, liệt kê bucket Storage và gọi SMTP `verify()` để kiểm tra kết nối/xác thực; lệnh này không ghi record, upload ảnh hoặc gửi email. Đây là kiểm tra cấu hình môi trường thật, kể cả khi đang bật demo.

Không cần tạo bảng thủ công trong Supabase Table Editor. `prisma/schema.prisma` là nguồn định nghĩa model; migration SQL được sinh từ schema. Với thay đổi schema trong quá trình phát triển, tạo migration bằng `npx prisma migrate dev --name ten_thay_doi` trên database phát triển có hỗ trợ shadow database. Database dùng chung/triển khai áp dụng migration bằng `npm run db:migrate`. Có `npm run db:push` cho thử nghiệm nhanh, nhưng nên giữ migration làm lịch sử chính thức.

Seed giữ nguyên các record ID mẫu đã tồn tại, không xóa dữ liệu quản trị; ảnh dưới prefix `seed/` chỉ được tải lên nếu chưa có. Dùng database phát triển riêng khi seed lần đầu để tránh trùng ID với dữ liệu có sẵn. Ảnh quản trị upload dùng tên ngẫu nhiên dưới `uploads/`. Khi sửa/xóa món, ảnh quản trị cũ được dọn theo khả năng; ảnh seed dùng chung không bị xóa. Nếu Storage lỗi trong bước dọn ảnh sau khi đã lưu database, dữ liệu món vẫn được giữ và có thể cần dọn object cũ thủ công.

## Cấu hình email và xác thực quản trị viên

Chẩn đoán riêng SMTP bằng `npm run smtp:check` trên máy của bạn. Lệnh dùng cấu hình local để kiểm tra kết nối/xác thực, không gửi email thử và chỉ in trạng thái/mã lỗi đã lọc; không in mật khẩu, key hoặc phản hồi thô của nhà cung cấp. Sau khi sửa `.env`, khởi động lại server. Với email đã đăng ký, dùng nút **Gửi lại mã xác minh**, không đăng ký lại để yêu cầu OTP mới.

Trang quên mật khẩu: `/auth/forgot-password`. Để chạy riêng kiểm thử phần Trang, dùng `npm run test:recovery`. Reset thành công xóa mọi session của tài khoản trong cùng transaction đổi mật khẩu và yêu cầu đăng nhập lại; mở link bằng GET không tiêu thụ token.

Điền các biến trong `.env` bằng thông tin nhà cung cấp SMTP. `SMTP_HOST` và `SMTP_FROM` phải có giá trị. `SMTP_PORT` mặc định **587**, `SMTP_SECURE=false` dùng kết nối SMTP được nâng cấp bằng STARTTLS; với cổng TLS trực tiếp (thường là 465), đặt `SMTP_SECURE=true`. `SMTP_REQUIRE_TLS` mặc định **true** và yêu cầu TLS. `SMTP_USER`/`SMTP_PASSWORD` phải được điền cùng nhau nếu máy chủ yêu cầu xác thực. Không tắt kiểm tra chứng chỉ TLS.

`APP_URL` là origin tin cậy được cấu hình trên server để tạo link email, ví dụ `http://localhost:3000` khi phát triển hoặc `https://bepnha.example.vn` khi triển khai; không lấy origin từ header của request. Không thêm đường dẫn, query, fragment hoặc thông tin đăng nhập vào biến này. Production yêu cầu HTTPS. Chỉ khi thử với SMTP local ở `localhost`, `127.0.0.1` hoặc `::1` mới đặt rõ `SMTP_REQUIRE_TLS=false`; không dùng giá trị này với dịch vụ SMTP thật. Máy chủ SMTP local không yêu cầu AUTH có thể để trống cả user và password.

`SESSION_SECRET` cần ít nhất **32 ký tự ngẫu nhiên**. Có thể điền `AUTH_TOKEN_SECRET` riêng, cũng ít nhất 32 ký tự; nếu để trống, ứng dụng dùng `SESSION_SECRET` làm khóa HMAC. Database lưu hash có khóa của OTP và reset token, không lưu giá trị gốc. Không đưa mật khẩu, OTP, reset token hoặc SMTP credentials vào log. Link đặt lại mật khẩu cũng là thông tin bí mật.

`ADMIN_REGISTRATION_CODE` là mã mời bí mật phía server, tối thiểu **16 ký tự**. Form đăng ký gửi trường `invitationCode`; mã đúng chỉ cho phép tạo tài khoản `viewer/pending`, không cấp quyền admin. Mã mời không được đưa sẵn vào HTML, hiển thị lại sau lỗi hoặc ghi log. Tài khoản được lưu trong database; ứng dụng không đăng nhập bằng `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` từ cấu hình cũ.

Luồng hoạt động:

1. Từ trang đăng nhập quản trị, mở `/auth/register`, nhập thông tin, mã mời và CAPTCHA. CAPTCHA là ảnh SVG 6 ký tự, có hiệu lực 5 phút và dùng một lần. Email được chuẩn hóa bằng cách bỏ khoảng trắng ngoài cùng và chuyển về chữ thường; email phải duy nhất. Mật khẩu tối thiểu 8 ký tự và tối đa **72 byte UTF-8** để phù hợp bcrypt; ký tự tiếng Việt/emoji có thể chiếm nhiều byte.
2. Đăng ký mới tạo tài khoản `viewer/pending` chưa xác minh và gửi OTP **6 chữ số**. Email mới, email đã tồn tại và lỗi gửi SMTP đều nhận cùng phản hồi đăng ký **303** và thông báo có điều kiện; email trùng không tạo thêm user, đổi mật khẩu hoặc gửi thêm email. OTP hết hạn sau **10 phút**, tối đa **5 lần nhập sai cho tài khoản chưa xác minh**. Xác minh cập nhật `emailVerifiedAt`, chuyển `status=active` và đánh dấu mã đã dùng; không tự đăng nhập hoặc thay role.
3. Gửi lại OTP ở `/auth/verify-email/resend` (alias `/auth/resend-otp`): cách lần gửi trước tối thiểu **60 giây**, tối đa **5 email mỗi giờ, tính cả email đầu tiên**. OTP mới thay thế mã cũ và **giữ nguyên số lần nhập sai**, kể cả sang cửa sổ gửi của giờ tiếp theo. Đủ 5 lần sai sẽ không gửi thêm OTP hoặc cho xác minh; người dùng cần liên hệ quản lý để được hỗ trợ, gửi lại/đăng ký trùng không mở lại lượt thử.
4. Chỉ tài khoản `active`, đã xác minh và có mật khẩu đúng được tạo session. Đăng nhập đổi session ID, lưu `userId`/phiên bản mật khẩu ở server; cookie chỉ mang mã session. Admin chuyển đến `/admin/dishes`, viewer đến `/auth/account`. Guard đọc quyền hiện tại từ database, yêu cầu active, đã xác minh, `role=admin` và `passwordVersion` khớp; viewer gọi URL CRUD trực tiếp vẫn bị chặn. Đăng xuất POST kèm CSRF hủy session server rồi xóa cookie.
5. `/auth/forgot-password` gửi link đặt lại mật khẩu qua cùng tiện ích email. Token ngẫu nhiên dài **64 ký tự hex**, hết hạn sau **30 phút**, chỉ dùng một lần và lưu riêng với OTP xác minh. Sau khi đổi mật khẩu, token bị vô hiệu hóa và `passwordVersion` tăng để các session cũ hết hiệu lực.

Để thử toàn bộ luồng, cần `DEMO_MODE=false`, mã mời hợp lệ, database đã áp dụng migration và SMTP có thể gửi đến hộp thư bạn kiểm soát. Sau đăng ký, xác minh email rồi thử đăng nhập viewer; người quản lý cấp admin trước khi thử CRUD. Phần OTP/email thuộc Thuyết, reset và nghiệm thu tích hợp thuộc Trang. Trang thực đơn công khai chỉ có liên kết **Quản trị** để vào luồng này. Thay đổi `.env` cần khởi động lại server.

## Session, cookie và chống brute force — phần Vy

Ngoài demo, session và bộ đếm đăng nhập sai lưu trong PostgreSQL. Giữ `SESSION_SECRET` ổn định để cookie còn được xác thực sau restart. Session có thời hạn tuyệt đối **2 giờ**; cookie `HttpOnly`, `SameSite=Lax`, `Secure` khi production. Hoạt động thông thường không kéo dài quá thời điểm hết hạn ban đầu. Đăng nhập đổi SID; logout xóa bản ghi session. Reset mật khẩu phải tăng `passwordVersion` để mọi session cũ bị từ chối.

Mặc định triển khai cần nhóm review: cửa sổ đếm **15 phút**; từ **3 lần sai** yêu cầu CAPTCHA; từ **5 lần sai theo tài khoản** hoặc **20 lần sai theo IP** tạm khóa **15 phút**. Bộ đếm được lưu phía server; CAPTCHA đúng không xóa bộ đếm và không vượt thời gian khóa. Giới hạn phụ **120 POST đăng nhập/IP/15 phút** không thay bộ đếm PostgreSQL. Không lưu email/IP dạng thô trong khóa chống brute force.

`TRUST_PROXY_HOPS` là số hop proxy tin cậy, số nguyên từ **0 đến 5**, mặc định **0** khi truy cập trực tiếp. Chỉ bật trust proxy khi giá trị lớn hơn 0 và cấu hình theo hạ tầng HTTPS thực tế; cấu hình sai có thể làm sai nhận diện IP hoặc cookie Secure. Production cần HTTPS. Chỉ MemoryStore trong demo phục vụ xem giao diện; không dùng demo làm cơ chế cấp quyền hoặc bằng chứng session tồn tại sau restart.

## Dữ liệu và route

- `Dish`: tên, mô tả, giá Decimal VNĐ, danh mục, trạng thái, đường dẫn ảnh, đầu bếp.
- `Chef`: tên, chuyên môn, giới thiệu.
- `Ingredient`: tên duy nhất, đơn vị.
- `DishIngredient`: quan hệ nhiều–nhiều và định lượng mỗi phần.
- `User`: tài khoản đội ngũ gồm `id`, `name`, `email` duy nhất, `passwordHash`, `emailVerifiedAt` có thể null, `role` mặc định `viewer`, `status` mặc định `pending`, `passwordVersion`, `createdAt`.
- `EmailVerification`: `userId` là khóa chính; `otpHash`, `expiresAt`, `attempts`, `lastSentAt`, `usedAt`, `sendWindowStartedAt`, `sendCount` quản lý OTP và giới hạn gửi.
- `PasswordResetToken`: record token đặt lại mật khẩu riêng, lưu hash, thời hạn và trạng thái đã dùng.
- `Session`: session phía server có mã session, dữ liệu, thời hạn và `userId` tùy chọn, lưu trong PostgreSQL.
- `LoginAttempt`: bộ đếm đăng nhập sai và thời gian tạm khóa theo khóa HMAC tài khoản/IP, lưu trong PostgreSQL.

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
| Đăng ký tài khoản đội ngũ bằng mã mời | GET, POST `/auth/register` |
| Ảnh CAPTCHA | GET `/auth/captcha` |
| Xác minh email | GET, POST `/auth/verify-email` |
| Gửi lại OTP | POST `/auth/verify-email/resend` (alias `/auth/resend-otp`) |
| Đăng nhập quản trị | GET, POST `/auth/login` |
| Đường dẫn đăng nhập quản trị cũ | GET `/admin/login` → `/auth/login` |
| Đăng xuất quản trị | POST `/auth/logout` |
| Tài khoản và quyền truy cập | GET `/auth/account` |
| Đổi họ tên của chính mình | POST `/auth/account/profile` |
| Đổi mật khẩu khi đã đăng nhập | POST `/auth/account/password` |
| Quên mật khẩu | GET, POST `/auth/forgot-password` |
| Đặt lại mật khẩu | GET, POST `/auth/reset-password` |

`:kind` là `dishes`, `chefs`, `ingredients`. Khi bật JavaScript, form sửa/xóa gửi PATCH/DELETE trực tiếp, kèm CSRF token và dữ liệu multipart. Network hiển thị đúng PATCH/DELETE. Khi JavaScript bị tắt, form dự phòng gửi POST với hidden `_method=PATCH/DELETE`; chỉ POST được override. Việc dùng fetch là thay đổi so với tiêu chí không dùng AJAX trong slide ban đầu. GET tuyệt đối không thay đổi record. Thao tác thành công redirect **303**; dữ liệu không hợp lệ trả **400**, giữ lại trường nhập (trình duyệt yêu cầu chọn lại file ảnh); ID không hợp lệ/không tồn tại trả **404**. Search, filter, sort, phân trang đều chạy phía server và giữ điều kiện trên URL. Trang khách 6 món/trang, trang quản trị 8 record/trang.

## Kiểm thử

Trang `/auth/account` có biểu tượng cây bút ngay cạnh họ tên và dòng mật khẩu ẩn; bấm biểu tượng để mở hoặc đóng form chỉnh sửa tại chỗ. Đổi họ tên chỉ cập nhật trường name của user trong session; form không được đổi email, quyền hoặc tài khoản khác. Đổi mật khẩu yêu cầu mật khẩu hiện tại, mật khẩu mới khác mật khẩu cũ và xác nhận khớp (ít nhất 8 ký tự, tối đa 72 byte UTF-8). Thành công sẽ tăng passwordVersion, vô hiệu link reset cũ, xóa mọi session của tài khoản và yêu cầu đăng nhập lại; quyền hiện tại được giữ nguyên. Mọi POST có CSRF; đổi mật khẩu giới hạn 5 yêu cầu/tài khoản và 20 yêu cầu/IP mỗi 15 phút trong tiến trình Node. Không cần migration mới. Chạy riêng kiểm thử bằng `npm run test:account`.

```powershell
npm run build
npm test
```

`npm test` chạy kiểm thử SSR, mutation và xác thực: form, session, trạng thái/role, guard CRUD, CSRF, validation, CAPTCHA, bộ đếm/khóa, OTP, giới hạn gửi/thử, reset token, vô hiệu hóa phiên cũ, method override, quan hệ dữ liệu, redirect, XSS và ID lỗi. Bộ test dùng Prisma stub trong bộ nhớ và email/Storage giả lập, **không kết nối hoặc ghi vào Supabase và không gửi email thật**. Có `npm run test:methods` cho PATCH/DELETE trên Chrome và `npm run test:visual` để kiểm tra giao diện khi server local đang chạy.

Đã kết nối PostgreSQL dùng chung với block-07, áp dụng migration bổ sung và kiểm tra session bằng database thật: store mới đọc được session đã lưu, logout xóa bản ghi; các trang đăng nhập/thực đơn/chi tiết trả 200 ở chế độ không demo. Dữ liệu nhà hàng và các trường tài khoản/OTP đã có được đối chiếu không đổi. Chưa thử mật khẩu tài khoản thật, upload hoặc gửi email. SMTP chưa được cấu hình; việc này thuộc phần Thuyết/Trang. `config:check` kiểm cả cấu hình email nên vẫn báo các mục SMTP còn thiếu; các mục này không chặn khởi động và đăng nhập bằng tài khoản đã kích hoạt. Không chạy seed hoặc migration trên database test tự động.

Migration `202610300002_normalize_chef_specialties` được giữ nguyên từ lịch sử chung để database mới tạo đúng quan hệ và chuyển dữ liệu cũ trước khi bỏ cột scalar. Database dùng chung đã có chuyên môn đầu bếp trong `Specialty`/`ChefSpecialty`; code đọc/ghi theo quan hệ này thay vì cột `Chef.specialty` cũ. Không chạy seed hoặc reset để sửa khác biệt cấu trúc trên database nhóm. Hai migration đăng ký đã có của Thuyết được giữ nguyên; các bản migration local cũ chưa từng áp dụng được lưu trong `tmp/migrations-before-shared-db`.

## Phạm vi triển khai

Ứng dụng hiện cấu hình chạy cục bộ ở `127.0.0.1`; ngoài demo dùng PostgreSQL session store. Triển khai Internet cần HTTPS và cấu hình proxy đúng số hop. Public Storage cho phép xem ảnh, còn key quản trị và kết nối database chỉ ở server. Không đưa khóa bí mật ra EJS hoặc log. Migration bật RLS cho các bảng ứng dụng; browser không truy vấn trực tiếp bảng qua Supabase REST API. Backend cần database role có quyền phù hợp (chuỗi kết nối server của project).
