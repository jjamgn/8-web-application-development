# Khám phá ảnh và hồ sơ công khai — 27/11/2026

**Cập nhật bố cục 27/11/2026:** tim/lưu/tải chỉ hiện trên ảnh khi hover hoặc focus (cảm ứng vẫn hiện); modal có panel bo góc, nút ×/chevron ở nền tối, nhóm size/tải căn phải và bỏ mũi tên tải xuống. Web build và 42 UI tests đạt. Xem [chi tiết và bằng chứng](../hover-modal/README.md).

Phạm vi đã được người dùng duyệt trong [contract](../../../BLOCK11_CONTRACT.md): tìm kiếm, modal chi tiết gắn URL, slug, download WebP, yêu thích, bộ sưu tập riêng tư, hồ sơ công khai, follow và cập nhật avatar. Không bật hạn mức upload ngày.

## Dùng thử

Mở [website LAN](http://192.168.100.154:5173/photos). Các lệnh khởi động và cập nhật IP vẫn theo [LAN_SETUP.md](../../LAN_SETUP.md).

1. Nhập từ khóa vào ô tìm kiếm: tìm trên server theo tiêu đề, alt hoặc tên tác giả, không phân biệt hoa thường. Không tìm bằng nhận diện nội dung ảnh hoặc tag. “Xem thêm” vẫn lấy 12 ảnh/lần.
2. Bấm ảnh trong feed: mở cửa sổ nổi, có URL riêng, nút đóng/Esc, ảnh trước/tiếp trong danh sách đã tải. Đóng/Back giữ feed và scroll. Mở link trực tiếp hoặc reload mở trang chi tiết đầy đủ. Modal có focus trap của native dialog và trả focus khi đóng.
3. URL chuẩn `/photos/:slug/:id` dùng slug từ tiêu đề và UUID hiện có. Link cũ `/photos/:id` hoặc slug khác vẫn tìm bằng UUID, sau khi đọc ảnh sẽ replace bằng URL chuẩn trên client. Đây chưa phải HTTP 301 hoặc triển khai SSR/SEO.
4. Bấm tên người đăng để xem `/users/:id`: avatar, tên, bio, số ảnh và số follower/following. Khách xem được ảnh và thông tin công khai; đăng nhập để follow. Mục “Đang theo dõi” tại thư viện chỉ lấy ảnh từ tác giả đã follow. Không tự follow hoặc tạo follow trùng, chưa có thông báo hoặc danh sách chi tiết follower.
5. Bấm tên ở header để vào `/profile`: ảnh của mình, tab Yêu thích, tab Bộ sưu tập và liên kết hồ sơ công khai. Bấm Chỉnh sửa hồ sơ → chọn avatar/nhập tên/bio → Lưu thay đổi. Nếu phần avatar lỗi sau khi tên/bio đã lưu, tên/bio vẫn giữ thay đổi đã thành công; có thể sửa và lưu lại avatar.
6. Nút tim lưu/bỏ yêu thích. Nút Lưu chọn bộ sưu tập hoặc tạo bộ rồi lưu. Bộ sưu tập chỉ chính chủ đọc/sửa/xóa; có thể đổi tên và gỡ ảnh. Xóa bộ chỉ xóa liên kết, không xóa ảnh gốc. Tối đa 100 bộ/tài khoản để giới hạn danh sách quản lý.
7. Tải WebP không yêu cầu đăng nhập. Trong chi tiết chọn đúng kích thước variant đã có. Gallery tải variant lớn nhất đang lưu. Không cung cấp JPEG/PNG nguyên gốc; không lộ URL hay credential S3.

Cache feed ở bộ nhớ tab và tách theo bộ lọc. Các thay đổi favorite/collection/follow làm mới feed liên quan; đổi hồ sơ làm mới metadata. Reload bắt đầu lại. Không lưu token hoặc mật khẩu trong web storage. Ảnh hiện công khai vẫn có thể được người xem tải; bộ sưu tập riêng tư chỉ bảo vệ danh sách sắp xếp của người dùng.

## Avatar và dữ liệu

- Nhận đúng một JPEG/PNG tĩnh qua multipart `photos` + `metadata` (cùng định dạng parser), yêu cầu phiên đăng nhập, Origin và CSRF. 10 MiB/file, 40 triệu pixel, cùng kiểm tra signature/full decode/static frame của ảnh gallery.
- Áp EXIF trước, crop giữa thành vuông tối đa 512px, không phóng lớn, WebP và không giữ EXIF/GPS. Không có công cụ chọn vùng crop bằng tay trong phiên bản này.
- Lưu avatar bằng Photo/PhotoVariant/PhotoChunk với `Photo.kind=AVATAR`; ảnh cũ mặc định `PHOTO`. Gallery/search/following/favorites/collection chỉ lấy PHOTO. Media vẫn đọc avatar từ SeaweedFS qua manifest/hash.
- User tham chiếu `avatarPhotoId`. Khi thay avatar, lock hàng User trong transaction để đổi tham chiếu, sau đó xóa avatar trước qua lifecycle PhotoService. Nếu commit không rõ kết quả, kiểm tra tham chiếu trước khi dọn. Avatar không còn tham chiếu quá 24 giờ được maintenance chuyển sang DELETING; cleanup tiếp tục dọn như ảnh thông thường. Chạy cleanup theo quy trình maintenance đã dừng nhận upload.
- Giới hạn đổi avatar 20 request/IP/15 phút, có Retry-After. Đây là giới hạn tốc độ riêng, không phải hạn mức upload ảnh/ngày.
- Migration `202611270003_social_profiles` chỉ bổ sung field/enum/bảng và FK/index/check; chạy transaction. Thêm Favorite, Follow, Collection, CollectionItem; bật RLS không có policy public cho bốn bảng này, API dùng kết nối server PostgreSQL. Không đưa service credential vào frontend.
- Snapshot đối chiếu ảnh trước migration nằm trong `api/.runtime/backups/social-extension/` (ignored). Không reset/seed DB hoặc đổi data directory SeaweedFS.

## API bổ sung

Mọi response JSON dùng envelope hiện có. Mutation yêu cầu session + Origin + CSRF; query riêng tư yêu cầu session. Dữ liệu xã hội/hồ sơ trả `Cache-Control: no-store`.

| API | Hành vi |
| --- | --- |
| GET `/api/photos?page=1&q=...&user=:id` | Tìm/lọc tác giả công khai; pageSize 12. Query lạ, trùng hoặc sai kiểu trả 400. |
| GET `/api/photos?...&favorites=true` | Ảnh yêu thích của session hiện tại. |
| GET `/api/photos?...&following=true` | Ảnh từ người session đang follow. |
| GET `/api/photos?...&collection=:id` | Chỉ bộ của session; không tồn tại/khác chủ trả 404. |
| GET `/api/users/:id` | `{id,name,bio,avatarUrl,photoCount,followers,following,isFollowing}`, không email/hash/session. |
| PATCH `/api/me/profile` | JSON `{name,bio}`; không nhận ID tài khoản hoặc avatarPhotoId từ client. |
| POST `/api/me/avatar` | Multipart một ảnh; trả `{id,name,bio,avatarUrl}` sau khi lưu. |
| POST/DELETE `/api/users/:id/follow` | Follow/unfollow idempotent; self-follow 400. |
| GET `/api/photos/:id/activity` | `{likes,liked}`; liked dựa trên phiên đang xem. |
| POST/DELETE `/api/photos/:id/favorite` | Yêu thích/bỏ thích idempotent. Avatar không được favorite. |
| GET/POST `/api/me/collections` | Danh sách riêng `{items:[{id,title,count}]}` hoặc tạo `{title}`. |
| PATCH/DELETE `/api/me/collections/:id` | Đổi tên `{title}`/xóa bộ của chính chủ. |
| POST/DELETE `/api/me/collections/:id/photos/:photoId` | Thêm/gỡ ảnh đã công bố; không sao chép object. |
| GET `/media/photos/:id/:width.webp?download=1` | Ghép và kiểm hash như media, thêm Content-Disposition attachment. |

## Kiểm chứng

- Build API và web đạt. Backend 73/73 tests: gồm migration PostgreSQL nhúng kiểm tra ảnh cũ, mặc định PHOTO, FK/cascade, không tự follow, unique và RLS.
- UI mock 39/39 đạt trên Chrome, có tìm kiếm, modal/Esc/reload/Back, follow, yêu thích, CRUD bộ sưu tập, sửa tên/bio/avatar, download selector và responsive. Lưu trong `ui-full-results.json`. Kiểm tra tập trung cuối sau sửa bố cục mobile, focus và cache/trạng thái đạt 13/13, ghi riêng trong ui-targeted-results.json.
- `profile-desktop.png`, `profile-mobile.png`, `modal-desktop.png` là mock UI, không phải dữ liệu người dùng thật. Đã xem ảnh chụp để kiểm tra bố cục; không chỉ dựa vào kiểm tra tràn ngang.
- Smoke qua Supabase + SeaweedFS thật: `api/scripts/social-live-smoke.mjs`. Chỉ chạy opt-in tại API: `$env:BLOCK11_SOCIAL_LIVE='1'` rồi `node scripts/social-live-smoke.mjs`. Script xác minh project, dùng hai tài khoản thử riêng, kiểm tra phân quyền và dữ liệu, rồi dọn fixture qua lifecycle ảnh. `live-results.json` ghi checklist và kết quả cleanup; không chứa password/cookie/CSRF/connection string.
- Đối chiếu sau migration/smoke: 14/14 ảnh và 8/8 người dùng cũ giữ nguyên ID/tên/kích thước/hash manifest; preservation-results.json. LAN browser thật đạt 12→14 ảnh, modal/Esc giữ cuộn và hồ sơ tác giả; lan-browser-results.json.
- Không kiểm tra từ thiết bị vật lý thứ hai, deployment HTTPS/Internet, restart/outage hoặc stress nhiều người dùng trong lượt này. Không dùng kết quả mới để tự ký đạt toàn bộ E01–E20.
