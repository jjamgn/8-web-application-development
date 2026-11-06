# Nguyên liệu, tìm kiếm không dấu và skeleton

## Giao diện

- Thêm/sửa món: đầu bếp được chọn bằng ô tìm và các nút kết quả, không dùng dropdown. Tìm tên/chuyên môn không dấu; hiển thị đầu bếp đang chọn độc lập với từ khóa. Bộ đầu bếp hiện tại được tải từ API một lần, lọc trong frontend; quan hệ ghi vẫn dùng chefId. Khi chỉ đổi đầu bếp, PATCH không gửi lại/xóa công thức nguyên liệu.

- `/#/admin/ingredients`: server-side Page Numbers, 12 nguyên liệu/trang. Tìm tên có/không dấu; đổi từ khóa reset trang 1. URL giữ q/page, reload/back khôi phục; sửa/thêm/hủy quay lại danh sách theo returnTo nội bộ. Khi xóa hết trang cuối, trang danh sách tự về trang hợp lệ.
- Thêm/sửa món có vùng “Nguyên liệu của món”: tìm trên server (debounce 250ms), duyệt 8 kết quả/trang, chọn nhiều, chặn chọn trùng, nhập lượng theo đơn vị, bỏ từng nguyên liệu. Danh sách đã chọn được giữ khi đổi từ khóa/trang.
- Số lượng >0, tối đa 99.999.999,99, tối đa 2 chữ số thập phân; mỗi món tối đa 100 nguyên liệu. Bấm Enter trong ô tìm nguyên liệu không gửi cả form món.
- Khi sửa, dữ liệu công thức hiện có được nạp lại. Chỉ đổi tên/ảnh thì không gửi lại công thức; thay công thức thì gửi toàn bộ tập chọn; bỏ hết thì gửi mảng rỗng.
- Skeleton dùng cho bảng khi tải/chuyển trang, kết quả chọn nguyên liệu khi chờ tìm kiếm và danh sách đầu bếp khi tải. Lỗi có nút thử lại; draft và nguyên liệu đã chọn được giữ.

## API

```http
GET /api/ingredients?page=1&pageSize=12&q=dau%20hu
```

```json
{"ok":true,"data":{"items":[{"id":9,"name":"Đậu hũ","unit":"g"}],"total":1,"page":1,"pageSize":12},"error":null}
```

Tìm/lọc ở server, count trước LIMIT/OFFSET, order name/id ổn định. pageSize <=100. Không tham số thì GET /api/ingredients vẫn trả mảng để giữ tương thích consumer cũ.

POST/PATCH món nhận thêm:

```json
{"ingredients":[{"ingredientId":9,"quantity":100},{"ingredientId":4,"quantity":2.5}]}
```

Server validate ID, lượng, giới hạn và trùng nguyên liệu; kiểm tra nguyên liệu tồn tại. Prisma nested write ghi món/công thức nguyên tử. PATCH không có ingredients giữ công thức; ingredients:[] xóa quan hệ của riêng món đó. Không nhận lệnh Prisma tùy ý từ client.

## Tìm không dấu

Migration `202610300002_normalize_vietnamese_search` bổ sung extension unaccent, hàm public.b7_normalize với dictionary cố định và các chỉ mục normalized. Áp dụng bằng `.\run.cmd db:migrate` khi triển khai trên DB khác; không cần seed lại.

Chuẩn hóa cả document và query trước khi tìm, cho cả Basic/Advanced/Fuzzy/Full-text và nguyên liệu. UI giữ nguyên từ khóa người dùng nhập; fuzzy vẫn được gọi đầu tiên khi có từ khóa.

Ví dụ đã xác nhận trên PostgreSQL thật:

```text
GỎI MỰC ĐẬU HŨ -> goi muc dau hu
websearch_to_tsquery('simple', b7_normalize('goi muc')) -> 'goi' & 'muc'
to_tsvector('simple', b7_normalize('Gỏi mực')) @@ query -> true
```

Tham chiếu PostgreSQL: [unaccent](https://www.postgresql.org/docs/current/unaccent.html) và [chuẩn hóa document/query cho full-text](https://www.postgresql.org/docs/current/textsearch-controls.html).

## Kiểm chứng

Kết quả lượt mới nhất: build FE/BE thành công; 19/19 nhóm API test, 11/11 nhóm browser smoke và 5/5 nhóm kiểm tra API/Supabase thật PASS. DB có 1.000 món trước và sau kiểm tra; bản ghi thử do script tạo đã được dọn. Đã kiểm tra bố cục mới trên desktop/mobile.

Cập nhật bộ chọn đầu bếp: build FE thành công, browser smoke mới nhất 12/12 nhóm PASS. Ca mới kiểm tra skeleton, chọn qua tìm tên/chuyên môn không dấu, validation/focus, không submit khi Enter trong ô tìm, hiển thị lựa chọn cũ khi sửa và giữ nguyên nguyên liệu khi chỉ thay chefId. Kiểm tra desktop/mobile: [đầu bếp](evidence/chef-search-picker.png), [đầu bếp mobile](evidence/chef-search-picker-mobile.png).

- Build FE/BE và test API: `.\pnpm.cmd build` tại web; `.\run.cmd build`, `.\run.cmd test` tại api.
- Browser smoke: web/tests/smoke.mjs có các ca phân trang nguyên liệu, skeleton, tìm không dấu, chọn lượng, tạo/sửa/bỏ công thức và hồi quy hiện có.
- `.\run.cmd verify:enhancements` tạo listener tạm để kiểm tra HTTP -> Supabase thật. Chỉ tạo/sửa một món thử do script sở hữu, sau đó dọn; không sửa món/nguyên liệu có sẵn.
- [Kết quả API thật](evidence/ingredients-live.json), [browser smoke](evidence/fe-smoke.json).
- [Bảng nguyên liệu](evidence/ingredient-admin-pages.png), [form chọn nguyên liệu](evidence/dish-ingredient-picker.png).
- Mobile: [bảng nguyên liệu](evidence/ingredient-admin-mobile.png), [form chọn nguyên liệu](evidence/dish-ingredient-picker-mobile.png).
