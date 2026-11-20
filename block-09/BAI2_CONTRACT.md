# Bài 2 Block 9 — contract chung

> **Trạng thái: APPROVED theo quyết định nhóm ngày 20/11/2026.** Nền bài là **Restaurant App SSR của Block 8**, bản người dùng xác nhận hiện trùng với GitHub `main`; ma trận quyền ở mục 4 được chấp thuận; dữ liệu demo dùng DB thật. Bài 1 CSR/JWT trong `block-09/BAI1` là dự án khác. Đối chiếu `docs/block9.pdf`, phần Bài tập 2 (trang PDF 60–69), và `block-09/docs/Phân quyền và MFA_ deck tương tác.html`.

## 1. Nền code và phạm vi

- Tạo `block-09/BAI2/` từ **bản `block-08/` hiện tại mà nhóm xác nhận trùng GitHub `main`**. Ghi SHA commit nguồn của GitHub `main` vào README Bài 2 khi lấy source; mọi thành viên xuất phát từ cùng snapshot Bài 2. Không lấy `HEAD` của nhánh local hiện tại làm SHA nguồn vì nhánh đó cũ hơn các file Block 8 đang có. Không chỉnh `block-08/` hay `block-09/BAI1/` trong lúc làm Bài 2.
- Giữ SSR, thực đơn công khai, CRUD món/đầu bếp/nguyên liệu, tìm kiếm, lọc, phân trang, đăng ký/xác minh email, đăng nhập, chống thử mật khẩu, quên/đặt lại mật khẩu, profile và các hành vi Block 8 đã có.
- Bổ sung RBAC cho `/admin`, ABAC cho món ăn, MFA TOTP và recovery code. Không dùng access token, refresh token, JWT hoặc API auth của Bài 1 cho dự án SSR này.
- Tất cả thay đổi CSDL đi qua Prisma migration: chạy kiểm tra trên DB cô lập trước, sau đó triển khai migration bổ sung lên **DB thật đang dùng cho demo**. Không dùng `prisma db push` trên DB thật. Bảo toàn tài khoản, món và ảnh hiện có; ghi lại migration/đường khôi phục trước khi áp dụng.

## 2. Stack và quy ước chung

| Thành phần | Quyết định đã chốt |
| --- | --- |
| Server và giao diện | Giữ Node.js, Express 5, TypeScript, EJS SSR, CSS/JS hiện có; form HTML và redirect 303. Không chuyển sang React/SPA. |
| Dữ liệu | Giữ PostgreSQL/Supabase, Prisma 6.12 và Supabase Storage đang dùng cho ảnh. |
| Đăng nhập | Giữ `express-session`, cookie `connect.sid` HttpOnly, SameSite Lax, Secure ở production, session lưu qua `PrismaSessionStore`; CSRF của Block 8. Không thêm Passport chỉ để bọc session đã có. |
| Mật khẩu | Giữ `bcryptjs` và luồng đặt lại mật khẩu Block 8. |
| TOTP | Thêm `otpauth` để tạo/xác minh TOTP; 6 chữ số, chu kỳ 30 giây, SHA-1 để tương thích app Authenticator. Dùng `qrcode` để tạo QR từ `otpauth://` URI. Khóa đúng phiên bản khi thêm vào `package-lock.json`. |
| Mã hóa và recovery | Dùng `node:crypto` (AES-256-GCM, `randomBytes`, HMAC-SHA-256); không tự viết thuật toán mật mã. Giữ `AUTH_TOKEN_SECRET` hiện có cho HMAC theo mục đích riêng; thêm `MFA_ENCRYPTION_KEY` 32 byte dạng base64 để mã hóa TOTP secret khi lưu. |
| Kiểm thử | Giữ `tsx --test` + Supertest; thêm kiểm thử tích hợp policy/MFA và một luồng trình duyệt Playwright cho SSR. |

`otpauth` hỗ trợ RFC 6238, còn `qrcode` tạo QR từ URI. Dùng TOTP 30 giây và chống dùng lại cùng bước thời gian theo [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238); tham khảo [OTPAuth](https://github.com/hectorm/otpauth) và [node-qrcode](https://github.com/soldair/node-qrcode).

## 3. Mô hình dữ liệu và migration

| Bảng | Thay đổi đã chốt |
| --- | --- |
| `User` | Giữ `role` chuỗi hiện có, chỉ chấp nhận `viewer`, `editor`, `admin`. Thêm `chefId Int?` liên kết `Chef`: `editor` phải có `chefId`; `viewer/admin` để `null`. Thêm `mfaEnabled Boolean @default(false)`, `mfaSecretEncrypted String?`, `mfaLastUsedStep BigInt?`. TOTP secret chưa kích hoạt chỉ nằm ở dạng **đã mã hóa** trong pending session tối đa 5 phút, không ghi vào `mfaSecretEncrypted` của user cho đến khi xác minh mã đầu tiên. |
| `Dish` | `chefId` **đã có trong Block 8**, không thêm cột trùng. Thêm `status` với hai giá trị `draft`, `published`, mặc định `published`; backfill món cũ thành `published`. Giữ `available` vì nó biểu thị còn/phục vụ món, khác với quyền công bố. |
| `RecoveryCode` | `id`, `userId` FK cascade, `codeHash` unique, `createdAt`, `usedAt?`; index theo `userId`. Chỉ lưu hash; mỗi code dùng một lần bằng thao tác DB có điều kiện/transaction. |
| `Session`, `LoginAttempt`, `EmailVerification`, `PasswordResetToken` | Giữ schema và chức năng Block 8; tái dùng `LoginAttempt` với key có tiền tố `mfa:` để tách bộ đếm OTP khỏi bộ đếm mật khẩu. |

Migration phải bảo toàn user, món ăn và ảnh hiện có. Khi thêm `status`, public query chỉ lấy `published` nhưng vẫn giữ bộ lọc `available` và phân trang; direct GET món `draft` từ khách trả 404. Không để `status` mới làm món cũ biến mất.

## 4. Ma trận quyền RBAC/ABAC

Role và `chefId` luôn lấy từ DB theo session ở mỗi request, không lấy từ form, query string, hidden field hay session snapshot. User `pending`/chưa xác minh email không có quyền. `admin` có toàn quyền CRUD trong `/admin`; `viewer` chỉ đọc; `editor` đọc và có quyền món ăn theo bảng sau.

| Tác vụ SSR | Viewer | Editor | Admin |
| --- | --- | --- | --- |
| GET danh sách/chi tiết trong `/admin` | Có | Có | Có |
| POST tạo món | Không | Có; server gán `chefId = User.chefId`, `status = draft` | Có; có thể chọn chef/status |
| GET form sửa hoặc PATCH món | Không | Chỉ món `chefId` của mình **và** `status = draft` | Có |
| DELETE món | Không | Không | Có |
| Tạo/sửa/xóa chef, ingredient | Không | Không | Có |
| Đổi `Dish.chefId` hoặc `Dish.status` | Không | Không | Có |

- Viewer/editor không thấy nút ngoài quyền trong UI, nhưng server phải chặn trực tiếp từng GET form và từng POST/PATCH/DELETE. Với role hợp lệ nhưng món không thuộc phạm vi: **403**. Với ID không tồn tại: **404**.
- PATCH phải đọc lại `User.role`, `User.chefId`, `Dish.chefId`, `Dish.status` ngay lúc ghi; update có điều kiện hoặc transaction để chặn trường hợp mở form trước rồi role/status bị đổi. Check khi GET form chưa đủ. Không upload ảnh lên Storage trước khi qua guard/CSRF/ABAC; nếu upload đã xảy ra rồi DB từ chối, dọn ảnh vừa upload.
- Editor gửi giả `role`, `chefId`, `status`, `available` hoặc `_method` không thể tăng quyền. `available` chỉ là thuộc tính món mà editor có thể sửa trên món draft của mình; `chefId`/`status` của editor bị server bỏ qua hoặc từ chối rõ ràng.
- GET tuyệt đối không làm thay đổi dữ liệu. Demo mode đọc như Block 8 và chặn mọi mutation.

## 5. Session và MFA

### Đăng nhập

1. `POST /auth/login` giữ bước kiểm tra email/mật khẩu, account active, CAPTCHA và rate limit Block 8. `/admin/login` tiếp tục chỉ chuyển về `/auth/login`.
2. Nếu `mfaEnabled=false`, tạo full session như Block 8. Nếu `mfaEnabled=true`, regenerate SID rồi tạo **pending session** tối đa 5 phút: `mfaPendingUserId`, `mfaPendingPasswordVersion`, `mfaPendingExpiresAt`; **không có `session.userId`**. Chỉ redirect 303 tới `/auth/mfa`.
3. `GET /auth/mfa` chỉ hiển thị form cho pending session. `POST /auth/mfa` nhận `_csrf`, `method=totp|recovery`, `code`. Sau mã đúng, regenerate SID lần nữa, xóa pending, đặt `session.userId`, `passwordVersion`, `absoluteExpiresAt` và redirect 303 tới `/admin/dishes` cho editor/admin hoặc `/auth/account` cho viewer.
4. Pending session không được truy cập `/admin`, `/auth/account` hoặc thao tác quản trị. Với pending, `/admin/*` redirect 303 về `/auth/mfa` và không lộ dữ liệu; pending hết hạn về `/auth/login`. Sau reset mật khẩu, pending cũ vô hiệu nhờ `passwordVersion`.
5. Giữ full session tối đa 2 giờ như Block 8. Logout phá hủy session; reset/đổi mật khẩu vẫn thu hồi session như Block 8 và **không tắt MFA**. Lần đăng nhập kế tiếp vẫn phải nhập TOTP/recovery.

### TOTP, khóa thử sai và mã dự phòng

- TOTP 6 số/30 giây, cho lệch tối đa một bước 30 giây trước/sau. So `mfaLastUsedStep` và cập nhật nguyên tử cho **mọi lần chấp nhận TOTP**, kể cả mã đầu tiên lúc bật MFA và mã dùng để reauth, để một step không dùng lại được dù có hai request đồng thời. Đồng bộ đồng hồ server. Không log mã, secret, URI QR hay recovery code.
- Sau **5 lần MFA sai trong 15 phút**, khóa xác minh MFA cho user 15 phút, trả trang 429 cùng `Retry-After`; bộ đếm lưu DB qua `LoginAttempt` key HMAC có tiền tố MFA. Có thêm giới hạn request theo IP để tránh quét nhiều tài khoản. Mã recovery cũng tính vào bộ đếm này. Thành công xóa bộ đếm MFA của user.
- Khi bật MFA, tạo **10 recovery code** ngẫu nhiên (mỗi mã tối thiểu 128 bit entropy), hiển thị đúng một lần trên trang sau kích hoạt; DB chỉ lưu HMAC-SHA-256 theo `userId` và purpose. Mỗi mã chỉ dùng một lần; dùng lại trả lỗi, không tạo full session. Nếu cấp bộ mới, thu hồi toàn bộ bộ cũ.
- TOTP secret mã hóa AES-256-GCM với nonce ngẫu nhiên riêng cho mỗi lần ghi; key chỉ ở env server. `MFA_ENCRYPTION_KEY` khác `SESSION_SECRET`/`AUTH_TOKEN_SECRET`, không commit. Mất key sẽ không giải mã được MFA secret, cần quy trình phục hồi tài khoản của nhóm.

### Trang quản lý MFA trong profile

| Route | Điều kiện và tác dụng |
| --- | --- |
| GET `/auth/account/mfa` | Full session; trạng thái MFA và link setup/đổi/tắt. Không trả secret đã bật. |
| GET/POST `/auth/account/mfa/setup` | Full session chưa bật MFA; POST tạo pending secret trong session 5 phút, GET hiển thị QR và mã nhập tay chỉ trong setup. |
| POST `/auth/account/mfa/enable` | `_csrf`, `code` TOTP đầu tiên đúng mới lưu encrypted secret, bật cờ và tạo recovery codes. |
| POST `/auth/account/mfa/recovery/regenerate` | Full session, xác nhận mật khẩu hiện tại **và** TOTP/recovery; tạo bộ mới, thu hồi bộ cũ, hiển thị một lần. |
| POST `/auth/account/mfa/replace` | Full session, xác nhận mật khẩu hiện tại **và** TOTP/recovery; tạo pending secret mới. POST `/auth/account/mfa/replace/confirm` nhận TOTP của secret mới rồi thay secret và cấp bộ recovery mới. Trước confirm, secret cũ vẫn hiệu lực. |
| POST `/auth/account/mfa/disable` | Full session, xác nhận mật khẩu hiện tại **và** TOTP/recovery; xóa secret, mốc chống replay và recovery codes. |

Mọi POST trên có CSRF. Sau **bật**, đổi/tắt MFA hoặc cấp lại mã, thu hồi các session khác của user; session hiện tại được giữ, với các thao tác đổi/tắt/cấp lại chỉ sau khi reauth thành công. Không dùng một password-only session để bỏ MFA. Không đưa MFA secret/recovery code vào `res.locals`, log hay response sau trang setup/hiển thị lần đầu. Quy tắc này theo [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

## 6. HTTP và lỗi SSR

| Tình huống | Kết quả |
| --- | --- |
| Khách chưa có full session vào `/admin/*` | 303 tới `/auth/login`; nếu đang pending còn hạn thì 303 tới `/auth/mfa`. |
| Full session nhưng thiếu RBAC/ABAC | Render trang lỗi SSR với **403**, không đổi DB/Storage. |
| Form sai định dạng, TOTP/recovery sai | Render lại form **400** với thông báo chung, không lộ mã có tồn tại hay không. |
| MFA đang khóa | **429** và `Retry-After`. |
| CSRF sai | **403** theo middleware Block 8. |
| Thành công POST/PATCH/DELETE | **303** tới trang SSR tương ứng. |

`GET /admin/:kind/:id/edit` và `PATCH /admin/:kind/:id` phải cho cùng quyết định quyền; server xét lại điều kiện khi PATCH. Không tự thêm API JSON/JWT cho Bài 2.

## 7. Phân chia cho ba thành viên

| Người | Chủ sở hữu file/chức năng | Bàn giao cho nhóm |
| --- | --- | --- |
| **A — dữ liệu và phân quyền** | `prisma/schema.prisma`, migration, script gán role/chef cho tài khoản demo; `src/auth/access.ts`, module policy mới; các route `/admin` trong `src/app.ts`, `src/validation.ts`; kiểm thử RBAC/ABAC và race khi PATCH. | Migration được thử trên DB cô lập rồi áp dụng lên DB thật; ma trận request/response; API nội bộ `requireFullSession`, `canRead`, `canCreate`, `canEdit`, `canDelete`; chính sách role và chef lấy từ DB. |
| **B — MFA và session** | `src/auth/login.ts`, `src/auth/routes.ts` phần MFA, module `src/auth/mfa.ts` mới, `src/auth/session-store.ts` nếu cần TTL pending, env/config; test TOTP, replay, recovery, lock, reset-password-still-MFA. **Không sửa `src/app.ts`/policy của A**; yêu cầu hook qua interface đã chốt. | Contract field pending session, routes/payload/status đúng mục 5–6, test đồng thời cho replay và recovery, hướng dẫn cấu hình secret. |
| **C — SSR UI và kiểm chứng tích hợp** | `views/auth/*`, `views/admin-list.ejs`, `views/form.ejs`, `views/partials/*`, `public/styles.css` và JS giao diện; Playwright end-to-end và README/hướng dẫn minh chứng. **Không tự đổi policy/endpoint/schema**. | Giao diện theo role, MFA setup/login/recovery, ảnh/luồng demo, lỗi 403 rõ; không dùng UI để thay server guard. |

**Điểm ghép cố định:** A định nghĩa type user/policy và session guard; B định nghĩa đúng bốn field pending ở mục 5 cùng route/field form; C dùng đúng route/field đó. A là người duy nhất sửa migration và `app.ts`; B là người duy nhất sửa login/MFA service. Nếu hai phần cần giao nhau, tạo PR nối ở bước tích hợp, không để coding agent tự đổi interface. Mỗi người làm nhánh riêng từ cùng commit nền; tích hợp theo thứ tự migration → policy/backend → MFA backend → UI, chạy lại toàn bộ test sau mỗi merge.

## 8. Điều kiện nghiệm thu chung

- Guest vẫn xem món `published`, tìm kiếm/lọc/phân trang; món cũ còn hiển thị; draft không hiện công khai. Thử cả UI và HTTP trực tiếp.
- Viewer chỉ đọc admin; editor tạo món draft của chef mình, chỉ sửa món draft của mình; admin CRUD tất cả, đổi chef/status. Direct POST/PATCH/DELETE vượt quyền và hidden field giả mạo đều bị chặn 403, DB không đổi.
- Mở form sửa hợp lệ rồi đổi role/chef/status trong DB trước PATCH: PATCH phải bị từ chối. GET không đổi DB. Ảnh Storage không bị rác khi mutation bị chặn.
- Password đúng với tài khoản MFA chỉ tạo pending session; truy cập thẳng `/admin` vẫn không được. TOTP đúng tạo full session; mã cùng step dùng lại bị từ chối; 5 mã sai bị khóa; recovery code chỉ dùng một lần.
- Bật MFA cần mã TOTP đầu tiên; thay/tắt/cấp lại mã cần reauth; reset mật khẩu không tắt MFA. Secret, QR URI và recovery plaintext không có trong log/DB/commit.
- `npm run build`, `npm test` và luồng trình duyệt SSR chạy trên Bài 2; nộp screenshot/video Network, cookie/session, response 403/429 và DB theo rubric PDF, che credential/secret trước khi trình chiếu.

## 9. Quyết định đã chốt và dữ liệu demo

1. **Source nền:** dùng bản `block-08/` hiện tại mà nhóm xác nhận trùng GitHub `main`; khi tạo `block-09/BAI2/`, ghi SHA của commit GitHub chứa đúng bản đó vào README Bài 2. Việc xác minh SHA diễn ra lúc lấy source vì nhánh local hiện tại không phải `main`.
2. **Quyền:** áp dụng đúng ma trận mục 4: viewer đọc `/admin`, editor tạo món draft và chỉ sửa món draft thuộc chef mình, admin CRUD và đổi chef/status. Không để coding agent tự sửa ma trận.
3. **DB demo:** dùng DB thật đang cấu hình cho ứng dụng. Tạo tối thiểu 1 viewer, 2 editor gắn 2 chef khác nhau, 1 admin, 2 món draft thuộc 2 chef và 1 món published. Gắn tiền tố nhận diện, chẳng hạn `B9B2-DEMO-`, cho bản ghi demo mới để kiểm tra và dọn đúng bản ghi; không sửa/xóa dữ liệu thực có sẵn để tạo minh chứng. Không đưa mật khẩu, OTP, khóa MFA hoặc chuỗi kết nối vào repo/ảnh/video.
4. **Kiểm thử:** test tự động có thể dùng DB cô lập hoặc transaction rollback; không chạy test có thao tác xóa/cập nhật hàng loạt trực tiếp trên DB demo thật. Chỉ migration đã kiểm tra và thao tác chuẩn bị demo có phạm vi xác định mới tác động DB thật.

Mọi thành viên và coding agent phải bám bảng quyền, endpoint, payload, HTTP status, token/session policy và chủ sở hữu file trong contract này. Nếu cần đổi quyết định chung, nhóm cập nhật contract trước khi chỉnh code tương ứng.
