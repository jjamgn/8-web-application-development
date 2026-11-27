# Theo dõi bằng chứng nghiệm thu

**Báo cáo kỹ thuật để nộp:** [02-kiem-chung-ky-thuat.md](02-kiem-chung-ky-thuat.md), lượt live bắt đầu 27/11/2026: HTTP, DB/key/hash, EXIF/alpha, file lỗi, FK lỗi thật sau PUT, restart Express thử và owner delete. Build đạt; backend 76/76, UI mock 47/47. Báo cáo ghi rõ phần chưa kiểm và không thay video Network/DOM.

**Cập nhật upload/profile 27/11/2026:** so sánh trước/sau mặc định đóng, title/alt có dấu bắt buộc; nút avatar chuyển cạnh chỉnh sửa hồ sơ. Localhost/127.0.0.1 được cho phép explicit trong env development để sửa lỗi Origin/CSRF khi APP_ORIGIN là LAN; production vẫn chỉ một origin. Xem [quy cách và kiểm chứng](compact-upload-profile/README.md).

**Cập nhật tác giả/tải ảnh 27/11/2026:** avatar + tên người đăng nằm trong lớp hover, chi tiết luôn hiện avatar/tên; Tải WebP có dropdown gắn liền, chọn size tải ngay. DTO uploader bổ sung avatarUrl công khai/null; không đổi schema/env. Xem [quy cách và kiểm chứng](author-download/README.md). Các mô tả bố cục cũ bên dưới được thay thế bởi bản cập nhật này.

**Cập nhật bố cục 27/11/2026:** tim/lưu/tải chỉ hiện trên ảnh khi hover hoặc focus (cảm ứng vẫn hiện); modal có panel bo góc, nút ×/chevron ở nền tối, nhóm size/tải căn phải và bỏ mũi tên tải xuống. Web build và 42 UI tests đạt. Xem [chi tiết và bằng chứng](hover-modal/README.md).

**Mở rộng đã duyệt 27/11/2026:** tìm kiếm, modal có slug/URL, download WebP, yêu thích, bộ sưu tập riêng tư, hồ sơ công khai, follow và sửa avatar đã tích hợp. Avatar dùng SeaweedFS qua PhotoKind AVATAR và không xuất hiện trong gallery. Các bảng xã hội mới thuộc Block 11. Migration bổ sung `202611270003_social_profiles`; không cần đổi env hoặc cài thư viện frontend mới. Xem [API, cách dùng và kiểm chứng](social-profile/README.md). Các kết quả cũ trong tài liệu này là lịch sử trước mở rộng.

**Cập nhật UX 27/11/2026:** thư viện “Xem thêm ảnh” 12 ảnh/lần, giữ danh sách/cuộn khi quay từ chi tiết, skeleton, upload kéo thả và hồ sơ cá nhân. API hỗ trợ `mine=true` từ session; chưa áp hạn mức ngày. Xem [chi tiết và kiểm chứng](feed-upload-profile/README.md).

**Cập nhật ngày 27/11/2026 sau lượt chạy thật.** Bản A+B+C tại main `e5a8492` cộng sửa lỗi local `f3d2172` đã chạy trên Supabase project mới và SeaweedFS Windows 4.55. Build API/web đạt, backend 71/71, UI mock 28/28, controlled browser 1/1, HTTP live và browser live đều đạt. [REVIEW.md](review-20261127/REVIEW.md) là báo cáo mới nhất; [ABC-integration.md](ABC-integration.md) là lịch sử ghép trước lượt live. “Đã thử một phần” không có nghĩa ký đạt toàn bộ hàng nghiệm thu.

| Mã | Chủ trì | Trạng thái / bằng chứng hiện có | Còn cần |
| --- | --- | --- | --- |
| E01 | B + A | Live cùng lượt: JPEG/PNG, DTO/uploaderId, Photo/Variant/Chunk và HEAD/hash trong báo cáo kỹ thuật | Chụp Network multipart/response cho video |
| E02 | B | Live 1 file tốt + 4 lỗi (giả, cắt bytes, quá bytes, quá pixel); 0 Photo lỗi và 0 key thừa | Lưu video nếu cần minh họa UI; bằng chứng kỹ thuật đã có |
| E03 | B | Backend đạt JPEG hợp lệ đúng 10 MiB và vượt ngưỡng, file sau vẫn xử lý | Lặp bộ ranh giới với DB/kho thật và lưu bằng chứng |
| E04 | B | Backend đạt body 55 MiB và +1, chunked và Content-Length | Bằng chứng lượt cloud nếu rubric yêu cầu |
| E05 | B | Backend đạt cấu trúc/metadata/số file, không gọi publisher và dọn staging | HTTP/DB/key của lượt live lỗi cấu trúc |
| E06 | B | Backend đạt đúng/vượt 40 triệu pixel trước full decode | Bằng chứng live theo rubric |
| E07 | B | Live Orientation 6/GPS giả → 1000×600, đầu ra không EXIF; orientation flip khác có backend tests | Quay so sánh trước/sau trong video |
| E08 | B + A | Live 320/960/1000 và 320/960/1600, alpha, HEAD từng mảnh và SHA-256 media khớp manifest | Ảnh nhỏ hơn 320px và các ranh giới khác có unit tests |
| E09 | A + B | Live fixture: PUT thật rồi PostgreSQL P2003 do FK, không Photo, object rollback hết và journal DONE | Outage, commit-unknown và retry matrix thật còn thiếu |
| E10 | A + C | Đã restart API thử cổng 3001 cùng DB/bucket, URL/hash và session giữ nguyên; không dừng API chính | Restart/recreate SeaweedFS giữ dữ liệu và xóa staging vẫn cần bằng chứng riêng |
| E11 | C | Mock đạt 6 viewport/DPR; live browser tải WebP và ảnh decode được | Bộ Network/currentSrc/cache theo viewport với backend thật |
| E12 | A | S3 probe thật đạt private bucket, MIME/cache qua live HTTP/browser | Outage/traversal/security matrix và minh chứng riêng |
| E13 | A + C | Live owner DELETE 204, Photo/Variant/Chunk về 0, HEAD mảnh hết, detail/media mới 404 | Outage trả 202 và cleanup retry trên cloud |
| E14 | C | Mock đạt pagination/empty/404; live đạt reload và UI upload/xóa; compiled server có regression test | Thử lại full production HTTPS/fallback khi triển khai |
| E15 | A | Backend đạt pending/orphan/age/published protection và S3 pagination | Chạy maintenance thật có fixture lỗi rồi kiểm kê |
| E16 | A + B + C | Lượt hiện tại: API/web build đạt, backend 76/76, UI mock 47/47; có báo cáo live kỹ thuật | Các kết quả này không thay mọi hàng E còn thiếu |
| E17 | B + C | Live public detail/media, guest upload/xóa 401 và session còn sau restart API thử; auth/CSRF có backend tests | Expiry và CSRF đầy đủ có test kiểm soát; không khẳng định đã chạy mọi ca cloud |
| E18 | A + B + C | Live hai tài khoản: uploaderId khớp A, response chỉ id/name/avatarUrl, guest 401/B 403/A xóa 204 | Payload giả chủ đã kiểm ở backend; video thể hiện hai tài khoản |
| E19 | A | Live PNG 3.258.290 bytes tại width 1600 có 4 mảnh; HEAD/bytes/SHA-256 đúng và dọn hết | Bằng chứng trong báo cáo; các ranh giới chunk có backend tests |
| E20 | A + B | Backend đạt 502/no-store, corrupt/missing/hash và abort cleanup | Fault/disconnect trên hạ tầng thật, không chỉ test double |

Các bài kiểm tra A/B có fault injection, decoder, chunk và migration đã chạy sau ghép; log `ABC-api-tests.txt` và `abc-browser-results.json` giữ lịch sử lượt controlled. Lượt live mới ở `review-20261127/REVIEW.md` và `gallery-live.png`. [Bộ demo EXIF](../demo-assets/exif/README.md) có JPEG Orientation=6, bản raw preview và WebP expected; không chứa dữ liệu cá nhân.

**Kiểm chứng bổ sung:** so sánh EXIF đạt **30 UI mock tests và 2 controlled browser tests**; xem [báo cáo riêng](exif-comparison/README.md). Các số 28/1 trong báo cáo cũ giữ kết quả lượt trước. LAN đã kiểm API/gallery/media/CSRF qua IP Wi-Fi tại máy chủ; Origin sai bị từ chối, frontend listen LAN, API/S3 giữ loopback. Xem [LAN_SETUP.md](../LAN_SETUP.md). Chưa kiểm từ thiết bị thứ hai; kết quả này không chứng minh Internet/HTTPS hoặc ký đạt thêm E01–E20.

## Artefact mock hiện có

- `mock-browser/gallery-<viewport>-dpr<dpr>.png`: gallery 375/DPR 1–2, 600/1, 1024/1, 1440/1–2.
- `mock-browser/responsive-<viewport>-dpr<dpr>.json`: src/srcset/sizes/width/height/loading/alt, currentSrc, renderedWidth, grid columns, DPR và media Network không chứa token.
- `mock-browser/login-*.png`, `register-*.png`, `upload-*.png`, `delete-dialog-*.png`: form/dialog tại 375 và 1440px.
- `validation.md`: lệnh đã chạy, kết quả và giới hạn. HTML report phát sinh ở `web/playwright-report/`, không commit.
- `mock-browser/playwright-results.json`: báo cáo lần chạy cuối, 28 đạt, 0 lỗi/skip/flaky; chỉ chứa dữ liệu test giả lập.

Các ảnh minh họa SVG và tài khoản fixture **không phải dữ liệu/storage thật**. Content-Type SVG trong JSON Network mock là chủ ý; WebP MIME/cache/integrity phải thu ở test live.

## Quy tắc thu bằng chứng thật

Dùng môi trường Block 11 cô lập. Ghi ngày, version/commit, lệnh, viewport/DPR, cache và dữ liệu test. Che giá trị cookie, CSRF, password, credential, connection string. Chỉ giữ HTTP status/header cần thiết, DTO công khai và SQL/key đã lọc; không lưu HAR/trace auth thô. Không xóa volume/DB dùng chung để làm sạch bằng chứng. A/B chịu phần của họ; C tổng hợp khi có kết quả thật.
