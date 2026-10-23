# NHÓM 8
## 1. THÔNG TIN THÀNH VIÊN 
- 24127554 - Ngô Thị Thanh Thuyết
- 24127566 - Nguyễn Lâm Thảo Trang
- 24127598 - Cao Hải Vy

## 2. NHỮNG QUYẾT ĐỊNH CỦA NHÓM 
- Website giới thiệu nhóm và cả 3 thành viên. Người xem có thể biết nhóm là ai, mỗi người có kỹ năng gì và nhóm muốn giới thiệu những dự án nào.
- Mỗi thành viên có một phần hồ sơ riêng, mở bằng nút Xem hồ sơ.
- Ba nội dung được ưu tiên là giới thiệu nhóm, thành viên và dự án. Ngoài ra, trang có thêm kỹ năng, cách làm việc và thông tin liên hệ để người xem hiểu rõ hơn về nhóm.
- Các dự án mẫu được ghi rõ là nội dung minh họa. 
- Dùng HTML, CSS và JavaScript thuần
    - HTML: tạo nội dung và chia các phần của trang.
    - CSS: chỉnh màu sắc, bố cục và hiệu ứng.
    - JavaScript: xử lý các thao tác như lọc dự án, mở hồ sơ và mở menu.
- Trang dùng CSS tự viết, chưa dùng framework. Cách này giúp nhóm dễ đọc mã, tự chỉnh sửa và giải thích được từng phần. Bản hiện tại chưa cần máy chủ xử lý dữ liệu hay cơ sở dữ liệu.
- Chỉnh thông tin ở một nơi: thông tin nhóm, thành viên và dự án được đặt trong data.js. Khi đổi tên, email hoặc kỹ năng, chỉ cần tìm và sửa thông tin trong file này. Ban đầu, thông tin cá nhân được để trống để từng người tự điền. 
- Trang đọc dữ liệu trước, rồi mới tạo phần hiển thị.
- Làm giao diện đẹp nhưng vẫn dễ sử dụng
- Sau khi có bản đầu tiên, giao diện được đổi sang nền xanh đen, thêm ánh sáng xanh và hiệu ứng chuyển động nhẹ. Mục đích là tạo ấn tượng với người xem nhưng vẫn giữ chữ rõ và bố cục gọn.
- Trang có hiệu ứng khi cuộn, khi đưa chuột vào thẻ và khi mở phần chi tiết. Chuyển động được giảm khi người xem bật tùy chọn giảm hiệu ứng trên thiết bị.
- Bố cục thay đổi theo kích thước màn hình:
    - Trên máy tính, các thẻ có thể nằm cạnh nhau. 
    - Trên điện thoại, nội dung được xếp lại và menu thu gọn để dễ đọc, dễ bấm.
- Chọn tương tác có ích cho người xem: 
    - Lọc dự án giúp người xem tìm loại dự án mình quan tâm. Khi chọn một bộ lọc, danh sách dự án trên trang thay đổi.
    - Các nút có thể được chọn bằng phím Tab và kích hoạt bằng Enter. Phần hồ sơ và chi tiết dự án có nút đóng, đồng thời hỗ trợ phím Esc.

## 3. LỖI ĐÃ PHÁT HIỆN VÀ SỬA
Lỗi 1: Đã đổi tên nhưng trang vẫn hiện [Họ và tên]. 
- Vấn đề: Thông tin đã được sửa trong data.js, nhưng trang đang xem vẫn hiện dòng chữ mẫu.
- Sửa lỗi: nhấn F5