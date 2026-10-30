# Triển khai frontend Block 7 - TV2

Ngày: 30/10/2026. Mã trong block-07 được tái sử dụng từ Block 6; nguồn Block 6 không bị sửa.

## Phạm vi TV2 và trải nghiệm tìm kiếm

- Page Numbers tại quản trị món, Load More tại thực đơn, Infinite Scroll tại Khám phá.
- Hook dùng chung: thay/nối danh sách, hủy request cũ, khóa request đang chạy, dedup ID, retry đúng trang, báo hết kết quả.
- URL giữ điều kiện đã áp dụng; quản trị giữ cả trang. Hai danh sách nối mở lại từ đầu; browser scroll restoration đặt manual để reload không tự nhảy xuống phần cũ.
- Theo yêu cầu mới, đã bỏ hoàn toàn dropdown “Kiểu tìm kiếm”. Người dùng chỉ nhập từ khóa và các bộ lọc.
- Frontend tự dùng Basic/Advanced theo bộ lọc. Khi chưa có kết quả thì gọi Full-text, rồi Fuzzy. Nếu kết quả đến từ mô tả/tên gần giống, hiển thị gợi ý dễ hiểu và thứ tự “Phù hợp nhất”. Cách tìm đã có kết quả được giữ trong các lần tải tiếp của cùng query, không trộn các nguồn.
- Toolbar dùng cùng API filter/sort; không tự lọc riêng trang đang có. Chi tiết, layout, ảnh, card và CRUD được giữ.
- Form thêm/sửa món nhận file JPEG/PNG/WebP <=5 MB hoặc link HTTPS trực tiếp; có preview, giữ draft khi lỗi và giữ ảnh khi PATCH không thay ảnh.

API/schema/index/seed nằm ở api để phục vụ tích hợp. Vai trò TV1 vẫn sở hữu search/query/upload server; TV3 sở hữu seed/filter-sort/QA theo plan. Đợt chỉnh UX tiếp theo tập trung code frontend, không mở rộng nghiệp vụ backend.

## Cấu hình và dữ liệu

- Đã kết nối Supabase thật và xác nhận 1.000 món, 3 đầu bếp, 10 nguyên liệu.
- Đã áp dụng migration tìm kiếm Block 7. Script seed xác nhận đủ 1.000 nên không thêm hoặc ghi đè dữ liệu.
- Không chép file secret; runner nạp cấu hình backend cũ vào môi trường khi chưa có api/.env riêng.
- Không có service role key trong cấu hình hiện tại. Upload được nghiệm thu với file bền vững tại api/var/uploads; nhánh Supabase Storage có trong mã, chưa được kiểm tra bằng key thật.
- Chưa có job tự dọn file upload mồ côi. Link ảnh phụ thuộc host cho phép nhúng; ảnh cũ không bị tự xóa.

## Lỗi đã phát hiện và sửa

### 1. Reload cuộn vô hạn tải vượt trang đầu

Tái hiện: mở /explore, cuộn tải 24 món, reload ở vị trí phía dưới. Browser khôi phục scroll cũ, observer thấy sentinel và tải tiếp; smoke chờ 12 món nhưng quan sát được 24. Đây là lỗi hành vi thực tế được thấy trong lần chạy browser test đầu.

Nguyên nhân: chính sách “mở lại từ đầu” chưa vô hiệu hóa scroll restoration của browser.

Sửa: đặt history.scrollRestoration = manual trước khi render React; giữ scroll về đầu khi đổi route. Ca smoke hiện kiểm tra tải 12 -> 24, reload -> 12, không trùng món.

### 2. Tên có dấu gạch dưới không tìm lại được

Tái hiện khi live test tạo món có tên B7_TEST_... với price=0, available=false. GET chi tiết đúng nhưng search tên kèm hai bộ lọc không trả bản ghi đó.

Nguyên nhân: backslash trong template literal của SQL bị JavaScript xử lý, SQL thực tế có ESCAPE '' trong khi pattern vẫn chứa backslash. Chuỗi gạch dưới vì vậy không được tìm đúng nghĩa literal.

Sửa tối thiểu để tích hợp: dùng ký tự escape !, escape !/%/_ trong tham số bind, SQL ESCAPE '!'. Test kiểm tra cả SQL sinh ra và tìm lại món vừa tạo trên DB thật. Không thay contract API.

## Kết quả đã chạy

- Build frontend và backend: thành công.
- API regression: 17/17 nhóm test PASS (DB được stub trong bộ test này).
- Browser smoke: 7/7 nhóm PASS, gồm tự phối hợp search và không có bộ chọn kiểu tìm.
- Live integration: 9/9 nhóm PASS, không có lỗi JavaScript chưa xử lý.
- Tổng món trước/sau live test đều 1.000; món và file do lượt test tạo đã được dọn.

## Bằng chứng

- [Smoke frontend](evidence/fe-smoke.json): fixture riêng cho race, retry, URL, tìm kiếm tự động, HTTP 422, mobile. Không dùng fixture làm minh chứng DB.
- [Live integration](evidence/fe-be-integration.json): browser -> API -> Supabase thật, response/Network, tổng trước/sau và ID bản ghi thử đã dọn.
- [Số trang ở quản trị](evidence/live-admin-page-2.png)
- [Tải thêm thực đơn](evidence/live-menu-load-more.png)
- [Cuộn vô hạn](evidence/live-infinite-scroll.png)
- [Ảnh upload sau reload](evidence/live-created-upload.png)
- [Link ảnh ngoài](evidence/live-external-image.png)
- [Mobile thực đơn](evidence/live-menu-mobile.png)
- [Mobile quản trị](evidence/live-admin-mobile.png)

Các JSON ghi kết quả từng nhóm test của lượt gần nhất. Chỉ xem là nghiệm thu đầy đủ khi mọi nhóm đã PASS; không suy ra thành công từ việc có sẵn một ảnh chụp.
