# StudentSpace — Express + EJS SSR

Ứng dụng quản lý sinh viên, render HTML tại server bằng Express 5 và EJS.
Dữ liệu nằm trong `data/students.json`; không cần cơ sở dữ liệu hoặc JavaScript ở trình duyệt.

## Chạy ứng dụng

Yêu cầu Node.js 20 trở lên.

```powershell
npm install
npm start
```

Mở http://localhost:3000/students.

Chế độ phát triển tự khởi động lại khi code thay đổi:

```powershell
npm run dev
```

Đổi cổng trong PowerShell nếu cần:

```powershell
$env:PORT = '3001'
npm start
```

## Chức năng

- Danh sách sinh viên, tổng số sinh viên và số lớp.
- Lọc sinh viên theo mã lớp bằng form GET trên trang danh sách. Ví dụ: `/students?className=CNTT01`.
  So sánh chính xác mã lớp, không phân biệt hoa/thường, bỏ khoảng trắng ở hai đầu.
  Bỏ lọc hoặc chọn "Tất cả lớp" để xem toàn bộ. Thống kê tổng sinh viên/số lớp luôn tính toàn bộ dữ liệu.
- Form thêm mới: mã sinh viên, họ tên, email, lớp. ID nội bộ được tạo bằng `crypto.randomUUID()`.
- Kiểm tra dữ liệu ở server, chuẩn hóa mã sang chữ hoa và email sang chữ thường, loại bỏ khoảng trắng ở hai đầu.
- Mã sinh viên và email phải duy nhất, so sánh không phân biệt chữ hoa/chữ thường.
- Hiển thị lỗi theo trường, giữ lại dữ liệu đã nhập. Thành công thì redirect 303 về danh sách.
- Giao diện tiếng Việt, thích ứng màn hình nhỏ; EJS escape thông tin sinh viên khi hiển thị.
- Có sẵn dữ liệu sinh viên để thử danh sách và bộ lọc lớp. Nếu file JSON chưa tồn tại khi khởi động, tạo danh sách rỗng.

## Cấu trúc

```text
app.js                       Cấu hình Express, views và xử lý lỗi
server.js                    Kiểm tra dữ liệu và mở cổng server
routes/students.js           Định nghĩa các endpoint
controllers/studentController.js  Xử lý request và render EJS
services/studentService.js   Kiểm tra dữ liệu, hàng đợi đọc/ghi JSON
data/students.json           Dữ liệu được lưu lâu dài
views/partials/              Header và footer dùng chung
views/students/              Trang danh sách và form thêm
views/error.ejs              Trang lỗi
public/style.css            Giao diện
test/students.test.js        Kiểm thử dữ liệu và HTTP
```

| Method | Đường dẫn | Chức năng |
| --- | --- | --- |
| GET | `/` | Chuyển đến danh sách |
| GET | `/students` | Đọc JSON và render danh sách; query `className` tùy chọn để lọc theo mã lớp |
| GET | `/students/new` | Render form thêm |
| POST | `/students` | Kiểm tra, ghi JSON, chuyển về danh sách |

## Cơ chế lưu file

Dùng `node:fs/promises` với `async/await`. Tất cả thao tác của store đi qua một hàng đợi
trong cùng tiến trình. Việc thêm sinh viên bao gồm đọc, kiểm tra trùng, thêm và ghi trong
một lượt của hàng đợi, tránh mất dữ liệu khi nhiều request cùng thêm.

Ghi JSON hoàn chỉnh vào file tạm cùng thư mục, sau đó dùng `rename` thay thế file chính.
Lỗi của một lượt không làm dừng hàng đợi. File JSON hỏng hoặc chứa bản ghi sai/trùng sẽ
được báo lỗi, không tự ghi đè. Lỗi chi tiết được ghi ở terminal, trang lỗi không lộ đường dẫn.

Ứng dụng dành cho demo local, chạy **một tiến trình Node.js**. Không sửa file JSON bằng
tay khi server đang chạy. Hàng đợi không phối hợp nhiều tiến trình hoặc nhiều instance;
nếu mở rộng theo hướng đó, chuyển sang cơ sở dữ liệu. Bản demo chưa có đăng nhập,
phân quyền hay bảo vệ CSRF; cần bổ sung trước khi dùng công khai cho dữ liệu thực.
Ghi file tạm không thay thế việc sao lưu hoặc bảo đảm dữ liệu còn nguyên sau sự cố nguồn điện.

## Kiểm thử

```powershell
npm test
```

Các test sử dụng thư mục tạm, không thay đổi dữ liệu mẫu. Kiểm tra lưu qua lần khởi động,
20 lượt thêm đồng thời, trùng dữ liệu, lỗi validation, bảo toàn JSON hỏng, HTTP routes,
escape HTML, redirect, giới hạn request và trang lỗi.
