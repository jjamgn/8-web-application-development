# Đã xóa bảng Restaurant khỏi project Block 11

**Mở rộng đã duyệt 27/11/2026:** tìm kiếm, modal có slug/URL, download WebP, yêu thích, bộ sưu tập riêng tư, hồ sơ công khai, follow và sửa avatar đã tích hợp. Avatar dùng SeaweedFS qua PhotoKind AVATAR và không xuất hiện trong gallery. Các bảng xã hội mới thuộc Block 11. Migration bổ sung `202611270003_social_profiles`; không cần đổi env hoặc cài thư viện frontend mới. Xem [API, cách dùng và kiểm chứng](../evidence/social-profile/README.md). Các kết quả cũ trong tài liệu này là lịch sử trước mở rộng.

Ngày thực hiện: **27/11/2026**, theo yêu cầu người dùng xóa hẳn các bảng không thuộc Block 11 trên Supabase project **swuswowkpsffkrvvyblo**.

## Thay đổi đã thực hiện

- Áp dụng migration `202611270002_remove_legacy_restaurant` thành công, finished_at **2026-11-27T12:44:58.106Z (UTC)**.
- Chỉ xóa `public.Chef`, `public.Dish`, `public.Ingredient`, tương ứng 4/12/12 dòng tại lúc backup.
- `DROP TABLE ... RESTRICT` trong transaction; không CASCADE, không reset/seed DB và không sửa/xóa lịch sử migration cũ.
- Schema lưu trữ `legacy_restaurant` **không được tạo**. Phương án archive trước đó được thay bằng quyết định xóa rõ ràng của người dùng. File archive draft chỉ giữ làm lịch sử, không tự chạy.

## Sao lưu và kiểm chứng phục hồi

Trước khi xóa đã lưu cấu trúc, toàn bộ 28 dòng dưới dạng JSON PostgreSQL nguyên bản, sequence/state, constraint/index, quyền truy cập và trạng thái RLS. Bản backup có SHA-256, không chứa connection string hoặc mật khẩu. Không commit dữ liệu backup vào Git.

Vị trí local tương đối từ API: `.runtime/backups/legacy-before-drop-20261127/` (có ở worktree kiểm tra và bản `block-11/api/` chính). Các file:

- `backup.json`: metadata + row JSON gốc + fingerprint từng bảng.
- `restore.sql`: tạo lại cấu trúc, sequence, dữ liệu, constraint/index và quyền cho role hiện có; **chỉ chạy phục hồi vào schema/DB cô lập trống trước**, không chạy mù trên project có dữ liệu.
- `checksums.json`, `restore-verification.json`, `after-delete-verification.json`: checksum và kết quả kiểm tra.

Đã phục hồi `restore.sql` vào PostgreSQL nhúng PGlite cô lập: đúng số dòng **4/12/12** và fingerprint JSONB khớp toàn bộ dữ liệu gốc. Đã thử migration xóa trên bản phục hồi, xác nhận Photo/User/lịch sử sentinel không mất; chạy lặp khi ba bảng không tồn tại cũng an toàn. Sau đó mới xác nhận fingerprint cloud chưa đổi và chạy migrate deploy thật.

## Trạng thái sau xóa

| Bảng Photo Gallery | Trước | Sau |
| --- | ---: | ---: |
| Photo | 13 | 13 |
| PhotoVariant | 29 | 29 |
| PhotoChunk | 29 | 29 |
| User | 8 | 8 |
| Session | 10 | 10 |
| StorageCleanupTask | 69 | 69 |

Public hiện chỉ còn **Photo, PhotoVariant, PhotoChunk, User, Session, StorageCleanupTask, _prisma_migrations**. Lịch sử vẫn có init cũ, migration Photo Gallery và migration dọn mới; giữ init cũ là chủ ý, không có nghĩa ba bảng cũ vẫn tồn tại.

Không thao tác object storage hoặc file ảnh. API local trả ECONNREFUSED tại lúc kiểm tra nên **chưa kiểm lại URL media sau xóa**; không báo API/hash live đạt cho lượt này. Kiểm chứng bảo toàn số liệu trên Supabase đã đạt. Số dòng ở bảng là snapshot, có thể thay đổi khi người dùng thao tác tiếp.
