# Rà soát database ngoài phạm vi Block 11

> **CẬP NHẬT SAU RÀ SOÁT:** người dùng đã yêu cầu xóa hẳn; ba bảng đã được backup, kiểm chứng phục hồi và xóa bằng migration `202611270002_remove_legacy_restaurant`. Xem [kết quả thực hiện](LEGACY_REMOVAL.md). Nội dung dưới đây là snapshot trước khi được phép xóa, không phải trạng thái DB hiện tại.

Ngày rà soát: **27/11/2026**. Chỉ đọc số dòng, schema, constraint/dependency và migration; không xuất nội dung record, không xóa/chuyển dữ liệu.

## Kết quả xác minh

- Target là Supabase project **swuswowkpsffkrvvyblo** qua Session pooler. Đã đối chiếu cấu hình riêng; không kết nối DB của Block 8–9.
- Ba bảng sau có sẵn trước migration Photo Gallery, thuộc mô hình Restaurant và không nằm trong schema Prisma/code runtime của Block 11.

| Bảng public | Số dòng tại lúc rà soát |
| --- | ---: |
| Chef | 4 |
| Dish | 12 |
| Ingredient | 12 |

- `_prisma_migrations` có migration `20261016000000_init`, finished_at `2026-10-16T04:01:10.606Z`, và migration Block 11 `202611270001_photo_gallery`, finished_at `2026-11-27T03:23:14.574Z` (UTC). Tên/lịch sử này chứng minh có migration cũ, **không xác định được ai/thao tác nào đã tạo hoặc nhập nó vào project**.
- Không tìm thấy foreign key vào/ra ba bảng hoặc nối chúng với Photo Gallery tại thời điểm kiểm tra. Các dependency thông thường được trả về là CHECK constraint của chính ba bảng; không thấy view/function bên ngoài trong lượt truy vấn dependency trực tiếp này. Không coi kết quả đó là cam kết không có ứng dụng bên ngoài dùng bảng hoặc SQL động tham chiếu bằng tên.
- Dữ liệu Photo Gallery hiện có **13 Photo, 29 PhotoVariant, 29 PhotoChunk, 8 User**. Đây là dữ liệu đang dùng; không seed/reset/cleanup các record này. Số dòng có thể tăng khi người dùng thao tác tiếp.
- Schema app chỉ gồm User, Session, Photo, PhotoVariant, PhotoChunk và StorageCleanupTask. Không có route/service nào dùng Chef/Dish/Ingredient.

## Quyết định trong lượt làm việc này

**Giữ nguyên cả ba bảng và lịch sử migration.** Người dùng yêu cầu xem xét bảng ngoài phạm vi, chưa yêu cầu xóa 28 record đang tồn tại. Không chạy DROP/TRUNCATE, không xóa bản ghi trong `_prisma_migrations` và không dùng Prisma reset/db push để “làm sạch”.

Khuyến nghị nếu muốn public chỉ còn Photo Gallery: sao lưu có thể phục hồi, sau đó **chuyển ba bảng sang schema lưu trữ `legacy_restaurant`**, thay vì xóa dữ liệu. Bản SQL [archive-legacy.DRAFT.sql](archive-legacy.DRAFT.sql) là phương án cụ thể để xem xét, **chưa áp dụng, không nằm trong thư mục migration tự chạy**.

Đã kiểm chứng bản SQL draft trên PostgreSQL nhúng PGlite cô lập: thiếu cờ opt-in thì bị chặn; khi bật cờ, chuyển schema giữ đúng số dòng 4/12/12, không đổi Photo/lịch sử migration, và chuyển ngược về public được. Đây không phải thực thi trên Supabase và không thay bước sao lưu/duyệt trước khi áp dụng thật.

## Trình tự khi phương án lưu trữ được duyệt

1. Xác nhận không có app khác dùng ba bảng trên project mới. Dừng ghi trong cửa sổ bảo trì.
2. Sao lưu schema + dữ liệu + sequence/constraint/index liên quan bằng công cụ PostgreSQL phù hợp; ghi target/thời điểm và thử phục hồi vào DB cô lập. Không commit dump dữ liệu thật hoặc credential.
3. Kiểm tra lại số dòng/dependency và đích legacy chưa có bảng trùng. Đưa thay đổi đã duyệt thành migration riêng có version; không sửa checksum/body migration đã chạy.
4. Chạy chuyển schema trong transaction, không CASCADE và không DROP. Script mẫu có khóa NOWAIT và cờ opt-in để ngăn chạy nhầm; chỉ cờ không thay cho bước sao lưu/duyệt.
5. Xác nhận public không còn ba bảng, legacy giữ nguyên số dòng; Photo/User/Session/chunk count không giảm. Kiểm tra list/detail/upload/xóa của Photo Gallery.
6. Nếu cần hoàn tác ngay trong cửa sổ bảo trì: chuyển ba bảng từ legacy_restaurant về public khi tên đích chưa tồn tại; không xóa schema còn chứa đối tượng. Hạn chế thay đổi dữ liệu trong khi kiểm chứng.

Nếu người dùng muốn **xóa hẳn** thay vì lưu trữ, cần quyết định riêng sau sao lưu và xác nhận 28 dòng không còn cần thiết. Không tự suy diễn “ngoài phạm vi” thành được phép xóa dữ liệu.
