# Kịch bản demo Block 9 — Bài 1 CSR

Kịch bản dựa trên bản A+B+C local ngày 13/11/2026. Mục tiêu: người dùng thấy chức năng, giảng viên thấy request và cơ chế xác thực. Phần chính khoảng 15–20 phút; chọn phần nâng cao nếu còn thời gian.

## 1. Chuẩn bị trước buổi trình bày

- Terminal 1 tại block-09/BAI1/api: npm run dev.
- Terminal 2 tại block-09/BAI1/web: npm run dev.
- Mở http://localhost:5173/#/dishes bằng Edge/Chrome. Giữ hostname localhost ở cả web và API.
- Chuẩn bị một email nhận được thư thật để đăng ký/OTP/reset; một tài khoản active dự phòng; một tài khoản riêng để demo khóa đăng nhập.
- Chuẩn bị mật khẩu demo tối thiểu 8 ký tự, không quá 72 byte UTF-8; mật khẩu mới khác mật khẩu ban đầu.
- Chuẩn bị một nguyên liệu mới không dùng trong công thức, tên có tiền tố DEMO để thêm/sửa/xóa. Không xóa món hoặc nguyên liệu thật của nhóm.
- Diễn tập SMTP/Turnstile trên mạng sẽ dùng ở lớp. OTP sống 10 phút, link reset sống 30 phút; không lấy link quá sớm.
- Khi chiếu, che giá trị mật khẩu, OTP, accessToken, csrfToken, refresh cookie và URL reset có token. Chỉ trình bày tên trường, status, thuộc tính và kết quả. Không mở .env trên máy chiếu.

Phần upload ảnh không thuộc kịch bản đã kiểm chứng này. Demo CRUD nguyên liệu để chứng minh thao tác ghi cần đăng nhập, tránh phụ thuộc upload.

## 2. Cách dùng DevTools xuyên suốt

1. Nhấn Ctrl+Shift+I để mở DevTools; nếu tab bị ẩn, bấm dấu >> rồi chọn Network hoặc Application.
2. Chọn Network, bật Preserve log và chọn Fetch/XHR.
3. Bật Disable cache để dễ theo dõi các request mới trong lúc DevTools mở.
4. Trước mỗi chức năng, bấm Clear network log để dọn danh sách hiển thị; thao tác này không xóa cookie hay phiên.
5. Bấm một request:
   - Headers → General: URL, method, HTTP status.
   - Headers → Request Headers: tên Authorization hoặc X-CSRF-Token; che giá trị.
   - Payload: query/body gửi lên. Không chiếu Payload đăng nhập/reset vì có mật khẩu.
   - Preview/Response: ok, data hoặc error.code. Với login/refresh, tránh mở nguyên JSON chứa token; chỉ chỉ ra trường expiresIn và user khi đã che token.
6. Network chỉ ghi các request khi DevTools đang mở. Nếu thiếu request, giữ DevTools mở rồi thao tác lại.

Tài liệu chính thức: [Network](https://developer.chrome.com/docs/devtools/network/overview/), [Preserve log và request details](https://developer.chrome.com/docs/devtools/network/reference/), [Application](https://developer.chrome.com/docs/devtools/application), [Cookies](https://developer.chrome.com/docs/devtools/application/cookies).

## 3. Khách chưa đăng nhập: public và protected

**Thao tác giao diện**

1. Đăng xuất nếu đang đăng nhập.
2. Mở Thực đơn, xem danh sách rồi mở chi tiết một món.
3. Bấm Quản trị: giao diện chuyển về Đăng nhập.

**Cho lớp xem bằng Network**

1. Ctrl+Shift+I → Network → Fetch/XHR → Clear.
2. Về Thực đơn và mở một món.
3. Chỉ ra GET /api/dishes và GET /api/dishes/:id trả 200.

**Chứng minh API cũng bảo vệ tài nguyên**

Console, chạy đoạn GET dưới đây; đoạn này không gửi Bearer và không gửi cookie:

~~~js
{
  const paths = ['dishes?pageSize=1', 'chefs', 'ingredients'];
  const results = await Promise.all(paths.map(async path => {
    const response = await fetch('http://localhost:3000/api/' + path, {
      credentials: 'omit'
    });
    return { endpoint: path, status: response.status };
  }));
  console.table(results);
}
~~~

Kỳ vọng: dishes 200; chefs và ingredients 401. Đây là kiểm tra API, khác với việc chỉ thấy frontend chuyển trang.

**Lời trình bày:** “Khách được đọc món ăn. Các tài nguyên và thao tác cần xác thực được kiểm tra ở server.”

Nếu tải lại khi chưa có cookie mà thấy GET /auth/csrf trả 401: đó là bootstrap thử khôi phục phiên, bình thường ở trạng thái khách.

## 4. Tìm kiếm, lọc và ba kiểu phân trang kế thừa Block 7

1. Thực đơn → nhập từ khóa không dấu phù hợp dữ liệu, ví dụ bo → Tìm món.
2. Kết hợp danh mục, khoảng giá, trạng thái và sắp xếp; chọn điều kiện chắc chắn có dữ liệu từ lần diễn tập.
3. Network → request dishes → Payload → Query String Parameters: chỉ ra q, category, minPrice/maxPrice, available, sort, page/pageSize theo request thực tế.
4. Xóa điều kiện, kéo xuống cuối danh sách → Tải thêm món. Chỉ ra request trang kế tiếp và số món đang xem tăng, danh sách cũ vẫn còn.
5. Chọn Khám phá món, cuộn xuống: request trang kế tiếp tự xuất hiện bằng Infinite Scroll.
6. Sau khi đăng nhập, mở Quản trị món hoặc nguyên liệu và bấm số trang 2: Page Numbers thay nội dung trang hiện tại; URL giữ tham số trang.

**Lời trình bày:** “Tìm kiếm/phân trang của Block 7 được giữ trong working copy. Load More và Infinite Scroll nối thêm dữ liệu; trang quản lý dùng số trang.”

Không khẳng định tải lại giữ toàn bộ các món đã nối thêm: danh sách nối thêm được thiết kế bắt đầu lại từ trang đầu; điều kiện tìm vẫn nằm trên URL.

## 5. Đăng ký → pending → OTP → active

1. Đăng ký bằng email nhận thư thật, điền tên/mật khẩu/xác nhận, hoàn tất Turnstile → Tạo tài khoản.
2. Network, lọc register: POST /api/auth/register, HTTP 200, ok:true và thông báo chung.
3. Chưa kích hoạt, sang Đăng nhập với đúng thông tin vừa đăng ký. Cho xem code ACCOUNT_NOT_ACTIVATED, HTTP 200, ok:false; chưa có phiên mới.
4. Mở email ngoài màn chiếu để lấy OTP; trở lại trang Nhập mã OTP.
5. Nếu muốn minh họa lỗi, nhập sai đúng một lần bằng 6 chữ số rồi chỉ ra INVALID_OTP. Không thử sai đủ 5 lần.
6. Nhập OTP đúng → Kích hoạt tài khoản. POST /api/auth/activate trả thành công; app không tự đăng nhập.
7. Nếu demo gửi lại, chờ ít nhất 60 giây từ lần gửi trước. POST /api/auth/activate/resend trả thông báo chung; cooldown/quota có thể khiến server chưa gửi thư mới dù response thành công.

**Lời trình bày:** “Tài khoản mới pending, role do server gán. Xác minh email xong mới đăng nhập; kích hoạt không cấp token.”

Đăng ký trùng email cũng trả thông báo chung. Không dùng thông báo đăng ký để kết luận email có tồn tại. Turnstile token dùng một lần; sau mỗi lần submit cần xác minh lại nếu widget yêu cầu.

## 6. Đăng nhập → Bearer JWT → cookie refresh

1. Đăng nhập tài khoản vừa active.
2. Network, lọc login: POST /api/auth/login trả 200, ok:true. Response có accessToken, tokenType Bearer, expiresIn 600, csrfToken, user; không có raw refresh token trong JSON.
3. Bấm Quản trị nguyên liệu. Chọn GET /api/ingredients → Headers → Request Headers: có Authorization: Bearer …; che giá trị.
4. Chuyển Application → Storage → Local Storage → http://localhost:5173; tiếp tục Session Storage. Không có access/refresh/CSRF token do app lưu ở đây. Có key từ extension thì không kết luận toàn bộ storage phải trống.
5. Application → Storage → Cookies → chọn origin localhost có cookie API. Tìm refresh_token; che cột Value.
6. Cho xem HttpOnly, Secure, SameSite Strict và Path /api/auth. Không có Domain cấu hình dùng chung tên miền: cookie host-only.

Nếu Cookies không hiện origin API, mở tab http://localhost:3000/api/dishes rồi mở Application của tab đó. Cookie thuộc host localhost, không được tách theo port; request vẫn phải khớp path/SameSite và fetch credentials.

**Lời trình bày:** “Access JWT trong memory được gửi ở Authorization. Refresh token ở cookie HttpOnly, JavaScript của app không đọc giá trị cookie này. HttpOnly không có nghĩa là DevTools không nhìn thấy cookie.”

Nút mang tên Quản trị là nhãn giao diện. Bài 1 không có RBAC: mọi tài khoản active có cùng quyền CRUD theo contract.

## 7. Reload: khôi phục đăng nhập

1. Khi đã đăng nhập, ở trang Quản trị, mở Network.
2. Lọc auth, Clear, giữ Preserve log.
3. Bấm F5 và đợi hoàn tất.
4. Chỉ ra theo thứ tự:
   - GET /api/auth/csrf → 200.
   - POST /api/auth/refresh → 200.
   - GET /api/auth/me → 200.
5. Chọn refresh → Headers: có X-CSRF-Token trong request, Set-Cookie trong response; che giá trị.
6. Chọn me → Request Headers: Bearer JWT. Giao diện vẫn có tên người dùng và vào được trang quản lý.

**Lời trình bày:** “Reload làm mất memory. Web dùng refresh cookie để lấy CSRF, xoay refresh token, nhận access JWT mới rồi lấy lại user.”

Nếu không có phiên hợp lệ, /csrf 401 và app trở thành khách. Đây là kết quả khác với reload khi đang đăng nhập.

## 8. CRUD đã xác thực

Demo ngắn, ít ảnh hưởng dữ liệu:

1. Quản trị → Nguyên liệu → Thêm nguyên liệu.
2. Tên DEMO_NHOM_<mốc-thời-gian>, đơn vị g → Lưu.
3. Network: POST /api/ingredients có Bearer, response thành công.
4. Tìm đúng nguyên liệu mới → Sửa → đổi đơn vị kg → Lưu.
5. Network: PATCH /api/ingredients/:id, Payload chỉ ra dữ liệu đổi; mở lại để xác nhận đã lưu.
6. Xóa đúng nguyên liệu DEMO → đọc màn hình xác nhận → xác nhận xóa.
7. Network: DELETE /api/ingredients/:id; nguyên liệu không còn trong danh sách.

Có thời gian thì trình bày thêm danh sách đầu bếp/chuyên môn, lọc nguyên liệu và form món chọn đầu bếp/công thức. Nếu demo thêm/sửa món, dùng món DEMO, chọn đầu bếp/nguyên liệu có sẵn và ảnh có sẵn; diễn tập đủ trước buổi trình bày.

## 9. Nâng cao: ba request 401 chỉ có một refresh

Chỉ dùng trên Vite dev localhost:5173, không dùng trên bản build/preview. Đoạn này chủ động thay access token trong memory bằng giá trị sai để tạo 401; phải nói rõ đây là mô phỏng token sai, không phải chờ JWT hết hạn thật. Refresh token thật không bị sửa.

1. Đăng nhập; F5 và chờ bootstrap xong để module ở trạng thái thống nhất.
2. Network → Fetch/XHR → xóa bộ lọc auth → Clear.
3. Console, chạy:

~~~js
{
  const api = await import('/src/lib/api.ts');
  const csrf = api.getCsrfToken();
  if (!csrf) throw new Error('Hãy đăng nhập và chờ bootstrap xong.');
  api.setAuthTokens({
    accessToken: 'demo-invalid-access-token',
    csrfToken: csrf
  });
  const paths = ['chefs', 'ingredients', 'auth/me'];
  console.table(await Promise.all(paths.map(async path => {
    try {
      await api.request(path);
      return { endpoint: path, result: 'OK sau refresh' };
    } catch (error) {
      return { endpoint: path, status: error.status, code: error.code };
    }
  })));
}
~~~

4. Network: ba request ban đầu 401; đúng một POST /auth/refresh; ba request retry trả 200. Không tính OPTIONS preflight là một lần refresh.
5. Sau đó thao tác trang quản lý bình thường để cho thấy phiên vẫn dùng được.

**Lời trình bày:** “API client dùng một refresh promise chung. Từng request gốc chỉ retry tối đa một lần; refresh lỗi thì xóa memory và trở về trạng thái chưa đăng nhập.”

Nếu không muốn dùng Console trước lớp, trình bày bằng chứng test: tại web chạy npm run test:auth. Bộ test có ca concurrent và late 401, không refresh sau 403 và refresh thất bại không tạo vòng lặp. Đây là test tự động, không gọi dịch vụ thật.

## 10. Đăng xuất và chứng minh phiên đã thu hồi

**Phần cơ bản**

1. Network → lọc auth → Clear.
2. Bấm Đăng xuất.
3. Chọn POST /api/auth/logout: có X-CSRF-Token và cookie; response thành công.
4. Application → Cookies: refresh_token bị xóa.
5. Mở lại Quản trị → phải đăng nhập. F5 không khôi phục được phiên cũ.

Chỉ nhìn frontend chuyển về login chưa đủ chứng minh access JWT cũ bị server thu hồi. Nếu cần chứng minh sâu, dùng phần dưới.

**Giữ một access JWT thử trong memory để kiểm tra sau logout**

Đăng nhập, rồi chạy đoạn sau trước logout. Đoạn này thực hiện thêm một lần refresh thật; token chỉ được giữ trong closure, không in ra Console hay Web Storage:

~~~js
{
  const api = await import('/src/lib/api.ts');
  const csrf = api.getCsrfToken();
  if (!csrf) throw new Error('Chưa đăng nhập.');
  const response = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf }
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error('Chưa tạo được mẫu kiểm tra.');
  const heldAccess = body.data.accessToken;
  window.demoCheckOldAccess = async () => {
    const checked = await fetch('http://localhost:3000/api/auth/me', {
      credentials: 'omit',
      headers: { Authorization: 'Bearer ' + heldAccess }
    });
    console.log('Access JWT đã giữ: HTTP', checked.status);
  };
  console.log('Đã giữ mẫu kiểm tra trong memory, không hiển thị token.');
}
~~~

1. Chạy await window.demoCheckOldAccess() → phải 200.
2. Bấm Đăng xuất trên UI.
3. Chạy lại await window.demoCheckOldAccess() → phải 401.
4. Hoàn tất trong vòng 10 phút để không nhầm hết hạn JWT với thu hồi do logout.
5. Dọn biến sau demo: delete window.demoCheckOldAccess.

**Lời trình bày:** “Logout thu hồi family ở DB. Middleware kiểm tra sid còn hoạt động nên JWT cũ cũng bị từ chối ngay ở request kế tiếp.”

## 11. Quên mật khẩu → email → reset → không tự đăng nhập

1. Ở Đăng nhập, bấm Quên mật khẩu.
2. Điền email demo, hoàn tất Turnstile → Gửi hướng dẫn.
3. Network: POST /api/auth/forgot, 200 và thông báo chung. Không chiếu Payload có captchaToken.
4. Lấy link reset từ email; mở link trên trình duyệt đang demo. URL chứa token nên che thanh địa chỉ khi chiếu.
5. Nhập mật khẩu mới và xác nhận → Đặt lại mật khẩu.
6. Network: POST /api/auth/reset, 200, ok:true. Không mở Payload chứa token và mật khẩu.
7. App về Đăng nhập với thông báo đặt lại thành công, không tự đăng nhập.
8. Đăng nhập bằng mật khẩu mới → thành công. Có thể thử mật khẩu cũ đúng một lần rồi dùng mật khẩu mới, tránh cộng dồn brute force.
9. Có thể mở lại link đã dùng và submit: INVALID_RESET_TOKEN, HTTP 200, ok:false.

Để chứng minh không lộ email tồn tại, có thể gửi forgot với một email demo chắc chắn không có tài khoản như no-user-demo-<mốc-thời-gian>@example.invalid: thông báo chung giống nhau; không dùng thời gian phản hồi để khẳng định đã chống mọi dạng dò email.

**Chứng minh các phiên cũ mất hiệu lực sau reset, nếu còn thời gian**

1. Ở cửa sổ A đã đăng nhập, chuẩn bị demoCheckOldAccess theo phần 10; kiểm tra 200.
2. Ở cửa sổ B/ẩn danh, làm forgot/reset bằng cùng tài khoản. Khi lấy link email, dán link vào đúng cửa sổ B để giữ cửa sổ A.
3. Trở lại Console cửa sổ A, gọi demoCheckOldAccess → 401.
4. Thao tác trang quản trị A: access cũ bị từ chối, refresh family cũ cũng không dùng được; yêu cầu login lại.

**Lời trình bày:** “Reset tăng passwordVersion và thu hồi mọi refresh family của user trong cùng transaction.”

## 11a. Profile và đổi mật khẩu trước phần brute force

1. Đăng nhập, bấm tên tài khoản góc phải → /profile. Cho xem tên/email và avatar chữ cái đầu.
2. Nhập mật khẩu cũ sai một lần, mật khẩu mới/xác nhận khớp → thông báo mật khẩu hiện tại chưa đúng. Network: POST /api/auth/change-password, 200, ok:false, CURRENT_PASSWORD_INVALID.
3. Nhập đúng mật khẩu cũ, mật khẩu mới và xác nhận → cập nhật. Không chiếu Payload vì có mật khẩu.
4. Request có Authorization và X-CSRF-Token; response có Set-Cookie và access JWT/CSRF mới, che giá trị. Người dùng ở lại profile và tiếp tục vào trang quản lý; F5 vẫn khôi phục phiên mới.
5. Các phiên cũ bị thu hồi. Để chứng minh, trước bước 3 có thể dùng demoCheckOldAccess ở phần 10 để xác nhận 200; sau đổi mật khẩu kiểm tra lại trong vòng 10 phút phải nhận 401.
6. Phân biệt với quên/reset qua email: profile xác minh mật khẩu cũ và cấp phiên mới tại chỗ; reset qua email vẫn trở về login.

## 12. Brute force: đặt CUỐI buổi demo

Mục này thật sự ghi bộ đếm/khóa trong DB. Dùng tài khoản demo riêng, bắt đầu khi account/IP chưa có thất bại trong 15 phút. Mở tab mới hay ẩn danh không xóa bộ đếm DB và không đổi IP.

1. Đăng xuất, vào Đăng nhập.
2. Network → lọc login → Clear.
3. Nhập đúng email demo, mật khẩu sai; gửi lần 1, 2, 3.
4. Các lần sai ban đầu: HTTP 200, ok:false, INVALID_CREDENTIALS.
5. Sau ba failure, server yêu cầu CAPTCHA ở request kế tiếp. UI hiện widget khi nhận CAPTCHA_REQUIRED; không cam kết widget xuất hiện ngay sau response sai thứ ba.
6. Lần 4 gửi khi chưa có CAPTCHA: CAPTCHA_REQUIRED (200), widget xuất hiện. Lần này cũng được tính là thất bại trong code hiện tại.
7. Hoàn tất CAPTCHA, vẫn dùng mật khẩu sai và gửi lần 5: 429 RATE_LIMITED; Headers có Retry-After.
8. Thử mật khẩu đúng ngay khi đang khóa: vẫn 429. Kết thúc phần demo ở đây; khóa kéo dài 15 phút.

Ngưỡng tài khoản là 5 failure; ngưỡng IP là 20 failure và quota phụ login 120 POST/IP/15 phút. Không cần thử đủ 20 lần trên mạng demo vì có thể ảnh hưởng các tài khoản khác cùng IP. Đăng nhập thành công xóa failure tài khoản, giữ lịch sử IP.

**Lời trình bày:** “Frontend chỉ hiển thị CAPTCHA/lỗi. Bộ đếm, xác minh CAPTCHA và khóa tạm thời do server xử lý; chỉnh giao diện không bỏ qua được.”

## 13. Bảng giải thích status khi giảng viên hỏi

| Trường hợp | HTTP | Body |
|---|---:|---|
| Đăng nhập đúng | 200 | ok:true, access JWT và user; refresh qua cookie |
| Sai mật khẩu | 200 | ok:false, INVALID_CREDENTIALS |
| Chưa kích hoạt | 200 | ok:false, ACCOUNT_NOT_ACTIVATED |
| OTP sai/hết hạn/hết lượt | 200 | ok:false, INVALID_OTP |
| CAPTCHA thiếu/sai | 200 | ok:false, CAPTCHA_REQUIRED hoặc INVALID_CAPTCHA |
| Reset token sai/hết hạn/đã dùng | 200 | ok:false, INVALID_RESET_TOKEN |
| API protected thiếu/sai Bearer | 401 | UNAUTHENTICATED |
| Refresh không còn hợp lệ | 401 | INVALID_REFRESH_TOKEN |
| Refresh token dùng lại | 401 | REFRESH_TOKEN_REUSED, family bị thu hồi |
| CSRF sai / Origin không được phép | 403 | CSRF_INVALID / ORIGIN_FORBIDDEN |
| Đang khóa hoặc vượt quota | 429 | RATE_LIMITED |

Luôn xem cả HTTP status và ok/error.code. Quy ước lỗi nghiệp vụ 200 là theo contract bài tập.

## 14. Nếu chỉ có 10 phút

Theo thứ tự: public/protected (1 phút) → đăng ký/OTP (2 phút) → login + cookie/Bearer (2 phút) → reload csrf/refresh/me (1 phút) → CRUD nguyên liệu + tìm kiếm/phân trang (2 phút) → logout hoặc forgot/reset (2 phút).

Giữ demo single-flight/thu hồi token cũ/brute force làm phần giảng viên hỏi thêm. Nếu bài chấm bắt buộc tất cả chức năng, xin thêm thời gian cho email và CAPTCHA; không trình bày bằng chứng test như đã demo luồng thật.

## 15. Xử lý tình huống tại lớp

- Không có Network request: mở DevTools trước thao tác, kiểm tra đang chọn Fetch/XHR và bộ lọc không che request.
- Cookie không lưu: kiểm tra Set-Cookie/cảnh báo ở Network, cùng hostname localhost, credentials, flags; không bỏ HttpOnly/Secure để chạy demo.
- Đăng nhập đúng vẫn 429: đang khóa account/IP, không phải lỗi mật khẩu. Chờ đủ thời gian hoặc dùng bằng chứng đã diễn tập; đừng xóa counter DB để giả làm đã hết khóa.
- Thư chưa đến: kiểm tra Spam, SMTP và cooldown. Dùng account active dự phòng cho phần tiếp theo rồi quay lại OTP/reset.
- Forgot hiển thị thành công không chứng minh thư đã gửi: đó là phản hồi chung được thiết kế để không lộ trạng thái email.
- Login/reset trả HTTP 500: dừng và kiểm tra server/DB; không gọi đây là lỗi nhập liệu. DB hiện đã được bổ sung RefreshToken theo bản vá tương thích.
- F5 lại mất login: xem csrf/refresh/me theo thứ tự để biết request nào lỗi; không kết luận ngay rằng memory token phải được lưu vào localStorage.
