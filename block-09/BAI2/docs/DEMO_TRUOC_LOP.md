# Kịch bản thuyết trình Bài 2 Block 9

Kịch bản dành cho nhóm trình bày Restaurant App SSR, tập trung vào **RBAC, ABAC và MFA** theo [BAI2_CONTRACT.md](../../BAI2_CONTRACT.md). Thời lượng chính khoảng **20 phút**, chia cho ba thành viên A, B, C; có thể đổi người nói theo phân công thực tế. Mỗi chặng có lời thoại, thao tác và bằng chứng cần cho lớp xem.

**Điều kiện sử dụng:** các kết quả dưới đây là kỳ vọng nghiệm thu theo contract. Tại thời điểm soạn ngày 20/11/2026, `src/auth/access.ts` vẫn dùng `requireAdmin` cho `/admin`, schema chưa có `User.chefId`, `Dish.status` và các trường/bảng MFA; module MFA đã có nhưng các view tương ứng chưa có. Nhóm cần hoàn tất tích hợp và diễn tập trước khi dùng toàn bộ luồng này trên lớp. Checklist cuối file dùng để đánh dấu kết quả thực tế; chưa chạy đạt thì chưa giới thiệu là đã hoàn thành.

## 1 Chuẩn bị trước buổi thuyết trình

### 1.1 Chạy đúng dự án và dữ liệu

Thực hiện từ thư mục gốc repo:

```powershell
Set-Location .\block-09\BAI2
npm install
npm run db:generate
npm run build
npm run dev
```

Trước khi chạy, người phụ trách cấu hình kiểm tra riêng `.env`: `DEMO_MODE=false`, kết nối PostgreSQL/Supabase và Storage đúng, các secret hợp lệ, có `MFA_ENCRYPTION_KEY` 32 byte dạng base64. Giữ một hostname xuyên suốt, ví dụ `http://localhost:3000`. Không mở `.env` trên màn chiếu.

DB thật dùng demo phải có migration Bài 2 đã kiểm tra trên DB cô lập, có ghi chép khôi phục và bảo toàn dữ liệu cũ. Nếu còn thiếu migration, hoàn tất trước buổi trình bày; không chạy `db:push`, seed/reset DB hoặc thay schema ngay trên lớp. `npm run db:generate` chỉ sinh Prisma Client, không bổ sung schema vào DB.

**Bản xem thử `DEMO_MODE=true` không dùng để chứng minh quyền ghi, session thật hoặc MFA.** Nó là chế độ chỉ đọc theo contract.

### 1.2 Chuẩn bị tài khoản và món demo

Tất cả tài khoản dưới đây phải active và đã xác minh email. Email/mật khẩu thực tế giữ trong ghi chú riêng, không điền vào file này.

| Nhãn dùng khi nói | Cấu hình | Mục đích |
| --- | --- | --- |
| Viewer | `role=viewer`, `chefId=null` | Đọc quản trị, bị chặn ghi |
| Editor A | `role=editor`, gắn Chef A | Tạo draft, sửa draft của mình |
| Editor B | `role=editor`, gắn Chef B | Đối chiếu quyền theo chủ sở hữu |
| Admin | `role=admin`, `chefId=null` | CRUD và đổi chef/status |
| MFA dự phòng | Tài khoản demo riêng đã bật MFA | Demo recovery, replay hoặc khóa sai mã mà không làm gián đoạn tài khoản chính |

Chuẩn bị các món có tiền tố **`B9B2-DEMO-`**:

| Ký hiệu trong kịch bản | Dữ liệu ban đầu | Ghi ID thực tế vào giấy riêng |
| --- | --- | --- |
| DRAFT_A | Draft thuộc Chef A | `DRAFT_A_ID = ...` |
| DRAFT_B | Draft thuộc Chef B | `DRAFT_B_ID = ...` |
| PUBLIC_A | Published thuộc Chef A, nên để `available=true` | `PUBLIC_A_ID = ...` |
| RACE_A | Draft thuộc Chef A, dành riêng cho demo mở form rồi mất quyền | `RACE_A_ID = ...` |
| CRUD_TEMP | Nguyên liệu mới, chưa được món nào sử dụng | `CRUD_TEMP_ID = ...` |

Các ký hiệu `DRAFT_A_ID`… trong URL phải được thay bằng ID thật, không gõ nguyên chữ vào thanh địa chỉ. Chuẩn bị một ID món chắc chắn không tồn tại cho ca 404. Không đổi/xóa món thật của nhóm để tạo minh chứng.

Chuẩn bị thêm một ảnh PNG/JPEG/WebP hợp lệ dưới 5 MB để tạo món; một điện thoại có app Authenticator và giờ tự động; bộ recovery code chưa dùng lưu riêng. Nếu trình bày reset mật khẩu, kiểm tra SMTP và hộp thư trước buổi học.

### 1.3 Bố trí màn hình và cửa sổ

| Cửa sổ | Đăng nhập | Tab mở sẵn |
| --- | --- | --- |
| Guest | Chưa đăng nhập | `/dishes` |
| Viewer | Viewer | `/admin/dishes` |
| Editor A | Editor A | `/admin/dishes`, form sửa RACE_A |
| Editor B | Editor B | `/admin/dishes` |
| Admin | Admin | `/admin/dishes`, `/admin/ingredients` |
| MFA | Tài khoản chuẩn bị cho chặng MFA | `/auth/account/mfa` hoặc `/auth/login` |

Dùng **profile trình duyệt riêng hoặc các trình duyệt khác nhau** cho các vai trò. Hai tab thường dùng chung cookie; nhiều cửa sổ ẩn danh trong cùng một trình duyệt cũng có thể dùng chung phiên ẩn danh. Diễn tập để chắc mỗi cửa sổ thực sự là một tài khoản khác.

Trên màn chiếu, ưu tiên giao diện web ở zoom 110–125%. Mở DevTools ở cạnh phải khi cần chứng minh request, đóng lại khi chuyển sang lời giải thích. Terminal chạy server để riêng, chỉ chiếu kết quả build/test đã kiểm tra không có dữ liệu nhạy cảm.

### 1.4 Cách dùng DevTools cho ứng dụng SSR

1. Mở DevTools → **Network → All**, bật **Preserve log**. Có thể bật Disable cache trong lúc DevTools mở.
2. Trước mỗi ca, Clear danh sách request để lớp dễ theo dõi.
3. Sau thao tác, chọn request gốc → **Headers → General** để chỉ URL, method, status; xem `Location` với redirect hoặc `Retry-After` với 429.
4. Form SSR thường có chuỗi **POST → 303 → GET 200**. Request GET cuối trả 200 không có nghĩa POST cũng trả 200. PATCH/DELETE có thể xuất hiện ở Fetch/XHR do JS gửi trực tiếp, trong khi trang vẫn do EJS render.
5. Application → Cookies → origin ứng dụng: chỉ chiếu tên `connect.sid` và các cột thuộc tính sau khi đã che cột Value. Cookie có thể tồn tại cả ở guest/pending; có cookie chưa chứng minh đã có full session.
6. Không mở Payload của login/MFA/reset, raw session JSON, `Set-Cookie` hay Response trang setup khi đang chiếu. Chúng có thể chứa mật khẩu, CSRF, OTP, QR URI hoặc recovery code.

Chỉ nói `Secure=true` khi demo qua HTTPS production. Với HTTP localhost ở development, đối chiếu cấu hình thực tế; thuộc tính bắt buộc cần giải thích là HttpOnly, SameSite Lax và Secure ở production.

## 2 Thứ tự trình bày trong 20 phút

| Thời gian | Người nói gợi ý | Phần trình bày | Màn hình chính |
| --- | --- | --- | --- |
| 00:00–01:30 | C | Giới thiệu nền SSR và mục tiêu | Contract mục 2 và 4 |
| 01:30–03:00 | C | Guest, published và draft | Guest + Network |
| 03:00–05:00 | A | Viewer và kiểm tra RBAC trực tiếp | Viewer + 403 |
| 05:00–08:00 | A | Editor và ABAC | Editor A/B + dữ liệu món |
| 08:00–10:00 | A | Admin CRUD và kiểm tra lại quyền lúc ghi | Admin + form cũ của Editor A |
| 10:00–12:30 | B | Bật MFA và lưu mã dự phòng | Trang quản lý MFA |
| 12:30–15:00 | B | Pending session rồi full session | Login MFA + Network |
| 15:00–17:30 | B | Replay, recovery và khóa thử sai | Tài khoản MFA dự phòng |
| 17:30–19:00 | C | Bằng chứng kiểm thử và dữ liệu | Kết quả test + ảnh DB đã che |
| 19:00–20:00 | C | Kết luận và chuyển sang hỏi đáp | Ma trận quyền + ba ý chính |

Để giữ mốc 20 phút, chuẩn bị sẵn hai phiên pending cho ca replay, chạy recovery trực tiếp và dùng clip ngắn cho ca khóa 5 lỗi nếu thao tác chậm. Nếu chạy toàn bộ replay, recovery và khóa trực tiếp từ đầu, dự trù thêm 3–5 phút.

**Câu chuyển người:** C → A: “Tiếp theo, bạn A sẽ dùng ba vai trò để chứng minh server quyết định quyền như thế nào.” A → B: “Quyền thao tác đã được giới hạn; bạn B sẽ trình bày bước xác minh thứ hai trước khi tạo phiên đăng nhập đầy đủ.” B → C: “Bạn C sẽ tổng hợp bằng chứng kiểm thử và các tình huống biên.”

## 3 Lời thoại và thao tác chi tiết

### Chặng 1 Giới thiệu nền ứng dụng

**Cho lớp xem:** contract mục 2 và ma trận mục 4, phóng đủ lớn để đọc. Chưa mở source dài hoặc toàn bộ README.

**Lời nói gợi ý:**

> “Nhóm em phát triển Bài 2 trên Restaurant App của Block 8. Ứng dụng dùng Express, TypeScript và EJS để render HTML ở server; dữ liệu nằm trên PostgreSQL, ảnh nằm trên Supabase Storage. Phần bổ sung gồm phân quyền theo vai trò, giới hạn quyền theo món ăn và xác thực hai bước bằng TOTP.”
>
> “Viewer được đọc; editor được tạo bản nháp và chỉ sửa bản nháp thuộc đầu bếp của mình; admin quản lý toàn bộ. Bài này dùng session phía server và cookie connect.sid. Bài 1 CSR/JWT là dự án riêng.”

**Chỉ tay vào ma trận:** khoanh ba dòng tạo món, sửa món và đổi chef/status. Giải thích một câu: “RBAC xét vai trò; ABAC xét thêm `User.chefId`, `Dish.chefId` và `Dish.status`.”

### Chặng 2 Guest chỉ thấy món published

**Thao tác theo thứ tự:**

1. Sang cửa sổ Guest → `/dishes`. Tìm tiền tố `B9B2-DEMO-`; mở PUBLIC_A, thử một bộ lọc hoặc chuyển trang để cho thấy chức năng cũ vẫn hoạt động.
2. Mở thẳng `/dishes/DRAFT_A_ID` → xem trang 404 và status 404 trong Network.
3. Mở `/admin/dishes` → xem chuyển về `/auth/login`. Chọn request `/admin/dishes`, chỉ status 303 và `Location`.

**Lời nói gợi ý:**

> “Thực đơn công khai vẫn giữ tìm kiếm, lọc và phân trang. Chỉ món published được công khai. Món draft bị loại từ truy vấn server nên gõ trực tiếp ID cũng trả 404. Khi chưa đăng nhập, truy cập quản trị sẽ được chuyển đến đăng nhập.”

**Cần thấy trên màn hình:** danh sách có PUBLIC_A, 404 của DRAFT_A và redirect của guest. Nói rõ `available` là còn phục vụ, khác với `status` là trạng thái công bố.

### Chặng 3 Viewer đọc được nhưng không được ghi

**Thao tác theo thứ tự:**

1. Sang Viewer → `/admin/dishes`, mở danh sách/chi tiết. Cho thấy không có nút thêm/sửa/xóa ngoài quyền.
2. Gõ thẳng `/admin/dishes/DRAFT_A_ID/edit` → kỳ vọng trang SSR 403.
3. Trở về trang có full session và form chứa CSRF hiện tại. Dùng probe POST nguyên liệu ở mục 4 để kiểm tra server dù UI đã ẩn nút.
4. Chỉ request POST trả 403; kiểm tra nguyên liệu mang tên thử chưa được tạo.

**Lời nói gợi ý:**

> “Viewer vẫn được đọc quản trị theo ma trận của Bài 2. Việc ẩn nút giúp giao diện phù hợp vai trò. Để chứng minh quyền được kiểm tra ở server, em truy cập trực tiếp form sửa và gửi một request tạo mới với CSRF hợp lệ; cả hai đều bị từ chối 403, dữ liệu không đổi.”

**Cần thấy:** một danh sách đọc được, GET form 403, POST 403 và dữ liệu không đổi. Nếu POST trả 403 vì CSRF sai thì chưa chứng minh được RBAC; tải lại trang hợp lệ và lấy CSRF mới trước khi thử lại.

### Chặng 4 Editor sửa theo chef và trạng thái món

**Thao tác theo thứ tự:**

1. Sang Editor A → tạo món `B9B2-DEMO-CREATE-A`. Điền tên, mô tả, giá, danh mục, ảnh và nguyên liệu theo validation thực tế. Gửi form, chỉ POST thành công → 303.
2. Đối chiếu dữ liệu của món vừa tạo: server gán `chefId=Chef A`, `status=draft`. Editor không tự chọn chef hoặc tự công bố.
3. Mở DRAFT_A → sửa tên hoặc giá, lưu → PATCH thành công → 303. Reload để chứng minh dữ liệu đã lưu.
4. Gõ thẳng `/admin/dishes/DRAFT_B_ID/edit` → 403, vì món thuộc Chef B.
5. Gõ thẳng `/admin/dishes/PUBLIC_A_ID/edit` → 403, dù món thuộc Chef A nhưng đã published.
6. Sang Editor B → mở form DRAFT_B được phép, mở form DRAFT_A bị 403. Giữ phần đối chiếu này ngắn.
7. Dùng bản payload hợp lệ đã chuẩn bị ở mục 4 để thử PATCH DRAFT_B và DELETE một món demo với phiên Editor A → 403. Đối chiếu DB/danh sách sau request.

**Lời nói gợi ý:**

> “Cùng là editor nhưng hai tài khoản không sửa chung mọi món. Điều kiện sửa phải đồng thời đúng hai thuộc tính: món thuộc chef của người dùng và món đang draft. Editor được sửa available trên draft của mình, nhưng không được đổi chef, đổi trạng thái công bố hay xóa món.”

**Cần thấy:** một lần tạo thành công, một lần sửa thành công và hai lý do ABAC trả 403. Dùng ảnh DB đã che hoặc bảng dữ liệu chỉ có ID, tên, chefId, status, giá để đối chiếu; không mở toàn bộ bảng User.

**Ca giả mạo trường:** trên form draft hợp lệ của Editor A, thử gửi `chefId=Chef B` hoặc `status=published`. Theo mục 4 contract, server có thể bỏ qua trường ngoài quyền hoặc từ chối rõ ràng; trong cả hai trường hợp chef/status không được đổi. Không lấy 303 làm bằng chứng tự nâng quyền, phải đối chiếu dữ liệu sau ghi. Giả `role=admin` cũng không làm thay đổi role đang lấy từ DB. Nếu thay `_method` thành DELETE, server vẫn phải xét quyền xóa.

### Chặng 5 Admin CRUD và kiểm tra lại quyền khi ghi

**Phần CRUD ngắn:**

1. Sang Admin → `/admin/ingredients`: tạo `B9B2-DEMO-CRUD`, đổi tên/đơn vị rồi xóa đúng nguyên liệu vừa tạo, chưa được món nào tham chiếu. Chỉ POST/PATCH/DELETE thành công trong Network.
2. Mở RACE_A của Chef A và đổi `status` từ draft sang published. Admin có thể đổi cả chef; không cần làm cả hai trong ca này.

**Phần chứng minh kiểm tra tại thời điểm PATCH:**

1. Trước khi Admin công bố RACE_A, Editor A phải đã mở form sửa món đó ở một cửa sổ khác. Giữ nguyên form cũ, không reload.
2. Admin công bố RACE_A thành công.
3. Quay lại form cũ của Editor A → sửa tên thành `B9B2-DEMO-KHONG-DUOC-LUU` → bấm lưu.
4. Kỳ vọng PATCH trả 403. Sang Admin reload món: status vẫn published và tên không đổi thành giá trị vừa thử.

**Lời nói gợi ý:**

> “Admin có toàn quyền quản lý và quyết định công bố món. Ở đây editor mở form khi món còn draft, nhưng admin đã công bố trước lúc editor lưu. Server phải đọc lại quyền và trạng thái ngay lúc ghi, nên form cũ không thể giữ quyền sửa đã mất.”

**Cần thấy:** form cũ → admin đổi status → PATCH 403 → dữ liệu giữ nguyên. Chọn món RACE_A riêng để DRAFT_A vẫn sẵn sàng cho các phần khác. Sau buổi demo, chỉ Admin đưa RACE_A về trạng thái chuẩn bị ban đầu nếu cần diễn tập lại.

### Chặng 6 Bật MFA bằng mã đầu tiên

**Thao tác theo thứ tự:**

1. Sang tài khoản MFA chính đang có full session, chưa bật MFA → `/auth/account/mfa`.
2. Chọn thiết lập; POST `/auth/account/mfa/setup`, sau đó GET trang setup. Nếu UI chưa có link, mở route quản lý; thao tác tạo secret vẫn phải là POST có CSRF.
3. **Tạm dừng chia sẻ hoặc chuyển máy chiếu sang contract** khi QR/mã nhập tay xuất hiện. Quét QR bằng Authenticator. Không chiếu QR, secret hoặc quay video bước quét.
4. Gửi mã TOTP đầu tiên đúng qua POST `/auth/account/mfa/enable`. Chỉ lúc xác minh thành công MFA mới bật.
5. Lưu riêng đủ **10 recovery code** ở trang hiển thị một lần. Không chiếu trang này. Sau khi đã lưu, rời trang mã rồi quay lại màn hình quản lý để cho lớp thấy MFA đang bật.

**Lời nói gợi ý trong lúc chuyển màn hình:**

> “TOTP là mã sáu chữ số, thay đổi theo chu kỳ 30 giây. Việc tạo QR chưa bật MFA; người dùng phải nhập đúng mã đầu tiên để chứng minh đã thiết lập Authenticator. Secret được mã hóa AES-256-GCM khi lưu. Mã dự phòng được hiển thị một lần, DB chỉ giữ hash và mỗi mã chỉ dùng được một lần.”

**Cần thấy:** trạng thái trước/sau bật, request enable thành công đã che nội dung nhạy cảm, bảng DB chỉ hiện `mfaEnabled` và trạng thái có/không của encrypted secret. Nếu vừa bật xong cần đăng nhập ngay, chờ sang bước thời gian TOTP mới: mã dùng để bật đã được tính chống replay.

### Chặng 7 Mật khẩu đúng chỉ tạo pending session

**Thao tác theo thứ tự:**

1. Đăng xuất tài khoản vừa bật MFA. Đăng nhập lại bằng mật khẩu đúng; nhập riêng, không chiếu Payload.
2. Cho xem request POST `/auth/login` → 303 tới `/auth/mfa`, rồi trang yêu cầu mã.
3. **Chưa nhập OTP**, gõ thẳng `/admin/dishes`, tiếp tục thử `/auth/account` → không được vào trang bảo vệ. Riêng `/admin/*` phải 303 về `/auth/mfa` khi pending còn hạn.
4. Trở lại `/auth/mfa`, nhập một mã mới hợp lệ. POST `/auth/mfa` thành công → 303; editor/admin về `/admin/dishes`, viewer về `/auth/account`.
5. Thử lại trang bảo vệ đã bị chặn ở bước 3 → nay được phép theo role.

**Lời nói gợi ý:**

> “Mật khẩu đúng mới hoàn tất yếu tố thứ nhất. Server đổi session ID và tạo phiên chờ tối đa 5 phút, chưa đặt session.userId. Vì vậy gõ trực tiếp URL quản trị vẫn không vượt được MFA. Sau mã hợp lệ, server đổi session ID lần nữa rồi mới tạo phiên đầy đủ, có hạn tuyệt đối 2 giờ.”

**Cần thấy:** chuyển đến MFA → thử vượt bước bị chặn → xác minh đúng → truy cập thành công. Dùng ảnh session đã xử lý nếu cần minh họa các field pending và `userId`; che SID và không mở raw session JSON. Việc đổi SID được đối chiếu riêng trước/sau, chỉ đưa kết luận “đã thay đổi”, không chiếu giá trị.

### Chặng 8 TOTP không dùng lại và recovery chỉ dùng một lần

Đây là hai ca riêng. Dùng tài khoản dự phòng; không dùng mã đã nhập sai nhiều lần ở chặng khóa.

**Ca TOTP replay:**

1. Chuẩn bị hai profile độc lập, cùng đăng nhập bằng mật khẩu của tài khoản đã bật MFA để cả hai đang ở `/auth/mfa`.
2. Khi Authenticator vừa sang mã mới, gửi mã đó ở profile thứ nhất → thành công.
3. Trong cùng bước 30 giây, gửi đúng mã đó ở profile thứ hai → kỳ vọng 400, vẫn chưa có full session.
4. Nếu đã qua bước thời gian, làm lại với mã mới và hai phiên pending; không dùng kết quả “mã cũ hết thời gian” để kết luận đã chứng minh chống replay. Một ca đồng thời chính xác nên đưa bằng test/video đã diễn tập.

**Lời nói:**

> “Mã đã được chấp nhận ở một bước thời gian không được dùng lại ở bước đó, kể cả từ một phiên khác. Server lưu mốc đã dùng và cập nhật nguyên tử để hai request không cùng tiêu thụ một mã.”

**Ca recovery:**

1. Tạo phiên pending mới, chọn phương thức recovery (`method=recovery`). Nhập riêng một mã chưa dùng → thành công.
2. Đăng xuất, đăng nhập mật khẩu để tạo **pending mới**. Gửi lại chính recovery code vừa dùng → 400, không có full session.
3. Đối chiếu bản ghi recovery tương ứng có `usedAt`; chỉ trình chiếu ID và `usedAt`, không chiếu code hoặc hash.

**Lời nói:**

> “Recovery code dùng khi không có Authenticator. Nó thay cho yếu tố thứ hai trong lần đăng nhập này và chỉ dùng một lần. Muốn chứng minh đã tiêu thụ, em tạo phiên chờ mới rồi thử lại chính mã đó.”

### Chặng 9 Khóa xác minh khi sai nhiều lần

**Thao tác theo thứ tự:**

1. Dùng tài khoản MFA dự phòng riêng, có bộ đếm sạch và chưa bị khóa; đăng nhập mật khẩu để vào pending.
2. Trong vòng 15 phút, gửi 5 mã sai qua POST `/auth/mfa`. Chuẩn bị trước chuỗi sáu số xác nhận không phải mã hợp lệ ở thời điểm thử; không gửi quá nhanh thành spam request.
3. Đối chiếu các lần sai, đến ngưỡng khóa phải thấy **429** và header **`Retry-After`**. Mã recovery sai cũng được tính vào cùng bộ đếm.
4. Dừng ca này, chuyển sang tài khoản chính hoặc bằng chứng đã chuẩn bị. Không chờ 15 phút trên lớp và không xóa bộ đếm DB để “vượt khóa”.

**Lời nói gợi ý:**

> “Sau 5 lần MFA sai trong cửa sổ 15 phút, tài khoản bị khóa xác minh 15 phút. Response 429 có Retry-After để báo thời gian chờ. Bộ đếm tài khoản nằm trong DB, tách khỏi bộ đếm mật khẩu; hệ thống còn giới hạn theo IP.”

**Cần thấy:** request `/auth/mfa`, status 429, Retry-After. Đảm bảo đó là khóa theo tài khoản sau 5 lỗi, không phải limiter IP do nhóm thao tác quá nhiều trước đó.

### Chặng 10 Bằng chứng và kết thúc

**Cho lớp xem:** kết quả build/test và ảnh hoặc video trình duyệt SSR đã diễn tập. Chỉ trình chiếu số ca pass và tên nhóm ca; không cuộn log có dữ liệu nhạy cảm.

> “Nhóm kiểm tra cả thao tác hợp lệ và request vượt quyền: viewer chỉ đọc, editor sửa đúng draft của mình, admin quản lý toàn bộ. Server kiểm tra lại quyền khi ghi, không chỉ kiểm tra lúc mở form. Phần MFA kiểm tra phiên chờ, chống dùng lại TOTP, recovery một lần và khóa thử sai. Các ca thời gian hoặc đồng thời được bổ sung bằng kiểm thử để kết quả có thể lặp lại.”

Chỉ dùng câu “đã kiểm tra” cho các ca checklist đã chạy đạt. Nếu còn ca chưa đạt, nêu đúng ca và trạng thái thực tế.

**Câu kết:**

> “Ba điểm nhóm muốn chứng minh là: quyền được quyết định ở server từ dữ liệu hiện tại; quyền editor phụ thuộc cả chef lẫn trạng thái món; và tài khoản bật MFA chỉ có phiên đầy đủ sau yếu tố thứ hai. Nhóm xin nhận câu hỏi.”

## 4 Request trực tiếp để chứng minh server chặn quyền

Các đoạn dưới đây **chỉ dùng trên ứng dụng và bản ghi demo của nhóm**. Người thao tác kiểm tra trước đúng profile, đúng origin và đúng ID có tiền tố `B9B2-DEMO-`. Thực hiện trong lúc diễn tập; trên lớp chỉ chạy đoạn đã chuẩn bị, không sửa request tùy hứng.

### 4.1 Viewer gửi POST với CSRF hợp lệ

Đứng ở trang Viewer có form chứa `_csrf`, ví dụ `/auth/account`, rồi mở Console. Đoạn này không in token hay response body:

```js
{
  const csrf = document.querySelector('input[name="_csrf"]')?.value;
  if (!csrf) throw new Error('Mở lại trang tài khoản có CSRF hiện tại trước khi thử.');
  const response = await fetch('/admin/ingredients', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: csrf,
      name: 'B9B2-DEMO-HTTP-VIEWER',
      unit: 'g'
    })
  });
  console.table({
    method: 'POST',
    path: '/admin/ingredients',
    status: response.status,
    redirected: response.redirected
  });
}
```

Kỳ vọng `status=403`, `redirected=false`; thông báo trang lỗi phải là từ chối quyền, không phải lỗi CSRF. Nếu được tạo ngoài kỳ vọng, dừng ca và ghi nhận lỗi; Admin chỉ dọn đúng nguyên liệu demo vừa tạo sau khi xác định ID. Không tiếp tục nói rằng RBAC đã đạt.

### 4.2 Editor gửi PATCH sang món của chef khác

Đứng ở form sửa **DRAFT_A hợp lệ** của Editor A. Sao chép FormData từ form đang mở để giữ payload hợp lệ, gồm CSRF và các giá trị món. Thay duy nhất `TARGET_DEMO_ID` bằng ID thật của **DRAFT_B đã xác minh là món demo**:

```js
{
  const targetId = Number('TARGET_DEMO_ID');
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    throw new Error('Điền ID số của DRAFT_B demo trước khi chạy.');
  }
  const form = document.querySelector('form.edit-form');
  if (!(form instanceof HTMLFormElement)) throw new Error('Mở form sửa DRAFT_A hợp lệ.');
  const body = new FormData(form);
  body.delete('_method');
  body.delete('image');
  body.set('name', 'B9B2-DEMO-KHONG-DUOC-PATCH');
  const response = await fetch(`/admin/dishes/${targetId}`, {
    method: 'PATCH', credentials: 'same-origin', body
  });
  console.table({ method: 'PATCH', targetId, status: response.status,
    redirected: response.redirected });
}
```

Kỳ vọng 403 và DRAFT_B không đổi tên, chef, status, imagePath hay nguyên liệu. Thử tương tự với PUBLIC_A để kiểm tra điều kiện trạng thái. Không thử bằng một ID chưa tồn tại vì 404 không chứng minh ABAC.

### 4.3 Các probe còn lại chuẩn bị qua Network

Chuẩn bị request từ lần thao tác hợp lệ đã diễn tập, dùng công cụ chỉnh và gửi lại request của trình duyệt hoặc công cụ HTTP của nhóm. Request phải dùng cookie/CSRF **của tài khoản đang kiểm tra**, không giữ cookie Admin từ bản sao request. Không lưu cookie/token thật vào repo, HAR hoặc ảnh nộp chưa xử lý.

| Profile và request | Chuẩn bị | Kỳ vọng |
| --- | --- | --- |
| Viewer POST `/admin/dishes` | Payload tạo món hợp lệ, CSRF Viewer | 403, không tạo món/ảnh |
| Editor A DELETE `/admin/dishes/DRAFT_A_ID` | ID demo tồn tại, CSRF Editor A | 403, món vẫn còn |
| Editor A POST/PATCH/DELETE chef hoặc ingredient | Dữ liệu hợp lệ, bản ghi demo | 403, dữ liệu không đổi |
| Viewer/Admin gửi mutation thiếu hoặc sai CSRF | ID demo tồn tại; dùng Admin cho ca tách riêng CSRF khỏi RBAC | 403 do CSRF, không đổi dữ liệu |
| Editor A PATCH sau khi Admin đổi role/chef/status làm mất quyền sửa | Form từng hợp lệ, cookie/CSRF vẫn hợp lệ | 403, không ghi thay đổi |
| Người có quyền đọc GET món không tồn tại | ID đã xác nhận không có | 404 |

Khi kiểm tra request bị chặn có đính kèm ảnh, đối chiếu thêm danh sách object Storage trước/sau: không có object mới bị bỏ lại. Chỉ GET trang/form không được tạo, sửa hoặc xóa dữ liệu nghiệp vụ.

## 5 Phần nâng cao khi còn thời gian

Chọn một hoặc hai ca, mỗi ca khoảng 1–2 phút. Các ca có chờ lâu hoặc điều kiện đồng thời nên dùng video/test đã chuẩn bị, ghi rõ là minh chứng từ lần chạy trước.

| Ca | Thứ tự thao tác | Bằng chứng cần chiếu |
| --- | --- | --- |
| Cấp lại recovery | Full session → nhập mật khẩu hiện tại và TOTP/recovery → POST `/auth/account/mfa/recovery/regenerate` → lưu riêng bộ mới → pending mới thử mã cũ | Mã cũ bị từ chối, bộ mới có 10 mã; các session khác bị thu hồi |
| Đổi Authenticator | Reauth bằng mật khẩu và TOTP/recovery → POST `/auth/account/mfa/replace` → quét riêng QR mới → POST `/auth/account/mfa/replace/confirm` với mã mới | Trước confirm secret cũ vẫn hiệu lực; sau confirm dùng secret mới và bộ recovery mới, thu hồi session khác |
| Tắt MFA | Full session → mật khẩu đúng nhưng thiếu/sai yếu tố thứ hai bị chặn → nhập đủ reauth → POST `/auth/account/mfa/disable` | Sau thành công, secret, mốc replay và recovery bị xóa; session khác bị thu hồi |
| Reset mật khẩu vẫn giữ MFA | Tài khoản bật MFA → nhận email riêng → reset → thử phiên cũ → đăng nhập mật khẩu mới | Phiên cũ vô hiệu; MFA vẫn bật; đăng nhập mới vẫn tới `/auth/mfa` |
| Pending hết hạn | Giữ pending quá 5 phút rồi gửi OTP hoặc vào `/admin` | Về login, không tạo full session |
| Reset khi còn pending | Mở pending ở profile 1 → reset mật khẩu ở profile 2 → quay lại profile 1 gửi mã | Pending cũ không được nâng cấp do `passwordVersion` đã thay đổi |
| Hai request TOTP/recovery đồng thời | Chạy test tích hợp trên DB cô lập | Chỉ một request tiêu thụ thành công, request còn lại bị từ chối |
| Role thay ngay trong DB | Editor mở form → người phụ trách đổi role thành viewer hoặc đổi chef làm mất quyền trên món, bằng thao tác có phạm vi trên tài khoản demo → gửi PATCH từ form cũ | Quyền mới có hiệu lực ngay lúc ghi; không tin role cũ trong session |

Mọi POST quản lý MFA có CSRF. Khi đổi/tắt MFA hoặc cấp lại recovery, session hiện tại chỉ được giữ sau reauth thành công; kiểm tra session khác bị thu hồi bằng profile thứ hai, không chỉ dựa vào thông báo UI.

## 6 Màn hình dữ liệu và source khi được hỏi

Không mở code liên tục trong phần chính. Dùng bảng này để chuyển đúng vị trí khi giảng viên hỏi cơ chế:

| Câu hỏi | Mở ở đâu sau tích hợp | Chỉ ra điều gì |
| --- | --- | --- |
| Quyền lấy từ đâu | `src/auth/access.ts` và module policy của A | User role/chef lấy lại từ DB theo session ở mỗi request |
| Chặn ghi ở đâu | Guard và route mutation trong `src/app.ts` | Thứ tự guard/CSRF/ABAC trước upload; kiểm tra lại tại thời điểm PATCH |
| Vì sao form cũ không ghi được | Đoạn transaction/update có điều kiện của PATCH | Điều kiện user và món được xét lúc ghi |
| Có JWT hay refresh token không | `src/auth/login.ts`, `src/auth/session-store.ts` | Cookie SID và session PostgreSQL, hai lần regenerate ở luồng MFA |
| TOTP và recovery lưu thế nào | `src/auth/mfa.ts`, schema và migration | AES-256-GCM, mốc chống replay, recovery hash và tiêu thụ một lần |
| Khi reset mật khẩu | `src/auth/password-recovery.ts` | Tăng passwordVersion/thu hồi phiên, giữ MFA |
| UI có thay server guard không | `views/admin-list.ejs`, `views/form.ejs` và route tương ứng | UI ẩn nút; request trực tiếp vẫn được server kiểm tra |

Chuẩn bị ảnh hoặc truy vấn chỉ đọc đã giới hạn đúng bản ghi demo:

| Bảng | Trường được trình chiếu | Cách đối chiếu |
| --- | --- | --- |
| User | ID, nhãn demo, role, chefId, mfaEnabled, passwordVersion | Trước/sau thao tác quyền hoặc MFA |
| Dish | ID, tên demo, chefId, status, available, giá, updatedAt | Tạo/sửa hợp lệ và request bị chặn |
| RecoveryCode | ID, userId, usedAt | `usedAt` thay đổi sau một lần dùng; không hiện codeHash |
| Session | Bản tổng hợp có/không userId, trạng thái pending/full, expiresAt | Không hiện SID hoặc nguyên JSON `sess` |
| LoginAttempt | failures, lockedUntil của bản ghi đã xác định riêng | Không mở toàn bộ key/hồ sơ tài khoản |

Không dùng ảnh chụp toàn bộ bảng có email cá nhân, passwordHash, ciphertext, session ID hoặc chuỗi kết nối. Bằng chứng về mã hóa/hash có thể là schema/đoạn code và cờ “có giá trị”, không cần chiếu dữ liệu mật.

## 7 Minh chứng và checklist chạy thử

### 7.1 Kết quả kiểm thử cần chuẩn bị

Chạy build và test theo cấu hình Bài 2 sau tích hợp. Trước `npm test`, người phụ trách xác nhận fixture/DB kiểm thử: không chạy test xóa/cập nhật hàng loạt trên DB demo thật.

```powershell
npm run build
npm test
```

Kiểm tra script `test` thực sự gồm ca Bài 2, không chỉ ca nền Block 8. Cần có nhóm test RBAC/ABAC, race lúc PATCH, TOTP/recovery đồng thời, khóa MFA và reset vẫn giữ MFA. Chuẩn bị kết quả một luồng trình duyệt Playwright SSR theo cấu hình đã tích hợp; không tự coi script cũ `test:methods` là đã bao phủ MFA.

Ghi lại trước khi lên lớp:

- Commit/build demo: `...`
- Thời điểm diễn tập, người chạy: `...`
- DB cô lập dùng cho test và DB demo đã được phân biệt: `...`
- Kết quả build/test và số ca: `...`
- Lệnh Playwright thực tế, kết quả và nơi lưu video: `...`
- Migration Bài 2 đã áp dụng, vị trí ghi chép khôi phục: `...`
- SHA nguồn GitHub main được ghi trong README Bài 2: `...`

### 7.2 Checklist trước giờ trình bày

- [ ] Build đạt; schema, migration, backend và view Bài 2 đã tích hợp đầy đủ.
- [ ] Viewer đọc được `/admin`, khác guard admin-only của nền Block 8.
- [ ] Guest tìm/lọc/phân trang được; món cũ published vẫn hiển thị; direct draft trả 404.
- [ ] Viewer GET form và mutation trực tiếp bị 403 với CSRF hợp lệ.
- [ ] Editor tạo draft đúng chef, sửa draft của mình được, các trường hợp ngoài quyền bị chặn.
- [ ] Giả role/chef/status/_method không tăng quyền; phân biệt available với status.
- [ ] Admin CRUD được; form editor mở trước khi đổi status không ghi được sau đó.
- [ ] Mutation bị chặn không đổi DB, không để ảnh rác trên Storage; GET không ghi dữ liệu nghiệp vụ.
- [ ] MFA setup cần mã đầu tiên, có đúng 10 recovery code, QR và code không lọt ảnh/video.
- [ ] Mật khẩu đúng tạo pending; pending không vào admin/account; MFA đúng mới có full session.
- [ ] TOTP cùng bước bị từ chối khi dùng lại; recovery dùng lần hai bị từ chối ở pending mới.
- [ ] 5 lỗi MFA khóa 15 phút, có 429 và Retry-After; tài khoản chính không bị khóa.
- [ ] Thay/tắt/cấp lại mã cần reauth và thu hồi session khác; reset không tắt MFA.
- [ ] Test tích hợp và Playwright SSR có kết quả thật, ảnh/video đã che bí mật.
- [ ] Tài khoản/profile, ID món, file ảnh và Authenticator sẵn sàng; đồng hồ đồng bộ.

### 7.3 Bộ minh chứng nên mở sẵn

| Nhãn gợi ý | Nội dung | Dùng ở chặng |
| --- | --- | --- |
| E01 | Public published 200, draft 404, guest admin 303 | 2 |
| E02 | Viewer đọc được và GET/POST ngoài quyền 403 | 3 |
| E03 | Editor tạo/sửa được; khác chef hoặc published bị 403; dữ liệu trước/sau | 4 |
| E04 | Form cũ, admin đổi status, PATCH bị 403, DB không đổi | 5 |
| E05 | Trạng thái MFA bật, pending bị chặn, xác minh xong vào được | 6–7 |
| E06 | Replay/recovery dùng lại bị 400; usedAt; khóa 429 + Retry-After | 8–9 |
| E07 | Kết quả build/test/Playwright và thu hồi session sau reauth/reset | 10 hoặc phần nâng cao |

Đây là danh mục cần chuẩn bị, không phải các tệp minh chứng đã tồn tại. Tên file có thể đổi theo quy định nộp bài; ảnh/video chỉ giữ thông tin cần chứng minh.

## 8 Bản rút gọn trong 10 phút

| Phút | Thao tác giữ lại | Câu nói trọng tâm |
| --- | --- | --- |
| 0–1 | Giới thiệu ma trận quyền và session SSR | “RBAC theo role, ABAC theo chef và trạng thái.” |
| 1–2 | Guest xem published, direct draft 404 | “Draft không được công khai từ server.” |
| 2–3 | Viewer đọc được, POST hợp lệ bị 403 | “Ẩn nút đi kèm guard phía server.” |
| 3–5 | Editor sửa draft mình, khác chef/published bị 403 | “Điều kiện chef và draft phải cùng đúng.” |
| 5–6 | Admin công bố, editor gửi form cũ bị 403 | “Server kiểm tra lại khi ghi.” |
| 6–8 | Dùng tài khoản đã bật MFA: mật khẩu → pending → thử admin → OTP → full | “Mật khẩu đúng chưa hoàn tất đăng nhập.” |
| 8–9 | Recovery một lần hoặc video replay/429 | “Mã có điều kiện tiêu thụ và giới hạn thử sai.” |
| 9–10 | Kết quả kiểm thử và kết luận | “Quyền và MFA được kiểm tra bằng cả UI lẫn request trực tiếp.” |

Bản rút gọn dùng tài khoản đã bật MFA từ trước, không quét QR tại lớp. Bỏ CRUD đầy đủ và các luồng quản lý MFA nâng cao trước khi cắt phần pending hoặc kiểm tra request trực tiếp.

## 9 Xử lý sự cố trong lúc demo

| Hiện tượng | Kiểm tra nhanh | Cách tiếp tục |
| --- | --- | --- |
| Viewer vào admin bị 403 ngay | Đúng bản Bài 2 và guard mới chưa; role DB có đúng không | Nếu còn guard Block 8, ghi nhận phần chưa tích hợp; dùng minh chứng có thật, không đổi lời giải thích quyền |
| Mutation trả 503 | `DEMO_MODE` hoặc phụ thuộc DB | Chuyển sang video đã chạy thật; không coi read-only demo là bằng chứng ghi |
| Lỗi CSRF 403 ngoài dự kiến | Profile, trang cũ sau regenerate SID, token hiện tại | Reload một trang được phép để lấy token mới, rồi thử lại một lần |
| OTP đúng trên điện thoại nhưng bị từ chối | Đã dùng trong setup/login/reauth chưa; đã sang bước mới chưa; giờ có đồng bộ không | Chờ bước mới và kiểm tra giờ; dùng recovery chưa dùng nếu phù hợp |
| MFA trả 429 | Tài khoản đã chạm ngưỡng hoặc IP bị giới hạn | Chỉ Retry-After rồi dùng tài khoản dự phòng; không sửa DB để vượt khóa |
| Không thấy 303 | Network chưa Preserve log hoặc đang nhìn GET cuối | Clear rồi thao tác lại, chọn request POST/PATCH gốc |
| Console báo status 0 khi redirect manual | Công cụ đang dùng `redirect: manual` có thể trả opaqueredirect | Xem status thực trong Network; không kết luận status 0 là lỗi server |
| Các vai trò bỗng dùng cùng tài khoản | Các cửa sổ đang chung cookie | Chuyển sang profile độc lập đã chuẩn bị, kiểm tra nhãn tài khoản |
| Tạo món lỗi ảnh | Định dạng, kích thước, Storage, validation | Dùng ảnh đã diễn tập; không sửa cấu hình/khóa ngay trên màn chiếu |
| Mạng/DB/SMTP lỗi | Phụ thuộc ngoài đang không sẵn sàng | Dùng ảnh/video từ lần chạy đã ghi thời điểm; nói rõ là minh chứng đã ghi trước |

Sau buổi trình bày, chỉ dọn các bản ghi demo đã ghi ID và xác định quan hệ phụ thuộc; kiểm tra ảnh liên quan trước khi xóa. Không xóa theo điều kiện rộng trên DB thật. Nếu cần diễn tập tiếp, khôi phục đúng trạng thái các tài khoản/món demo bằng quy trình của nhóm, không reset dữ liệu thật.

## 10 Câu hỏi thường gặp và câu trả lời ngắn

**RBAC khác ABAC ở đâu?** RBAC xét viewer/editor/admin. ABAC bổ sung quan hệ chef của user với chef của món và trạng thái draft/published; cùng một editor có thể sửa món này nhưng bị cấm sửa món khác.

**Ẩn nút rồi có cần guard không?** Có. Người dùng vẫn có thể gõ URL hoặc gửi HTTP trực tiếp; mọi GET form và mutation phải được kiểm tra ở server.

**Vì sao GET form được nhưng PATCH lại 403?** Quyền hoặc trạng thái có thể thay đổi trong khoảng thời gian người dùng mở form. PATCH phải xét lại dữ liệu hiện tại và điều kiện tại lúc ghi.

**Vì sao có cookie mà chưa vào được quản trị?** Cookie định danh session; session có thể đang là guest hoặc pending. Chỉ full session và quyền phù hợp mới được truy cập.

**OTP email có phải MFA đang demo không?** OTP email dùng để xác minh email lúc đăng ký. MFA Bài 2 dùng TOTP từ Authenticator hoặc recovery code cho yếu tố thứ hai khi đăng nhập.

**Hash hay mã hóa TOTP secret?** Secret cần giải mã để xác minh TOTP nên dùng AES-256-GCM. Recovery code chỉ cần đối chiếu nên lưu HMAC-SHA-256, không lưu plaintext.

**Reset mật khẩu có tắt MFA không?** Không. Reset thu hồi phiên cũ và đổi passwordVersion, còn MFA vẫn bật. Lần đăng nhập mới vẫn yêu cầu TOTP/recovery.

**Nếu mất Authenticator thì sao?** Dùng recovery code chưa dùng. Cấp lại bộ mã hoặc thay/tắt MFA yêu cầu mật khẩu hiện tại và TOTP/recovery; nếu mất cả hai yếu tố cần quy trình phục hồi tài khoản của nhóm.

**Vì sao response cuối 200 nhưng nói thao tác ghi trả 303?** Trình duyệt đi theo redirect. Request ghi trả 303 rồi GET trang đích trả 200; cần chọn đúng request gốc trong Network.

**Bài này có access token và refresh token không?** Không. Bài 2 giữ Express session và cookie connect.sid; luồng JWT/refresh thuộc Bài 1 CSR.
