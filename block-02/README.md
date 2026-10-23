# NHÓM 8
## 1. THÔNG TIN THÀNH VIÊN 
- 24127554 - Ngô Thị Thanh Thuyết
- 24127566 - Nguyễn Lâm Thảo Trang
- 24127598 - Cao Hải Vy

## 2. HƯỚNG DẪN CHẠY VÀ DỪNG SERVER
### 2.1. Cách chạy:
1. Mở PowerShell.
2. Di chuyển đến thư mục `source`: `cd đường_dẫn_đến_thư_mục`
3. Chạy lệnh: `C:\caddy\caddy.exe run` (dựa theo đường dẫn đến caddy.exe)  

### 2.2. Cách dừng:
- Nhấn tổ hợp phím `Ctrl + C` tại cửa sổ PowerShell.

### 2.3. Địa chỉ truy cập:
- Local: http://localhost:8000
- Public: https://thanhthuyet102.github.io/webportfolio/

## 3. GIẢI THÍCH MỘT CẶP REQUEST/RESPONSE ĐÃ QUAN SÁT
Khi nhập `localhost:8000` vào trình duyệt, browser gửi request `GET /` đến server Caddy. 
Server nhận request, tìm thấy file `index.html` trong thư mục gốc và trả về response với status `200 OK`, Content-Type là `text/html`. Trình duyệt nhận được HTML, bắt đầu parse và tiếp tục gửi các request tiếp theo để tải `styles.css`, `effects.css`, `script.js`,...

*Hình ảnh minh chứng cho cặp request/response: `evidence/request_response_200.png`*