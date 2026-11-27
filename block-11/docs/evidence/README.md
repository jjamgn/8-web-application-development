# Theo dõi bằng chứng nghiệm thu

**Cập nhật bố cục 27/11/2026:** tim/lưu/tải chỉ hiện trên ảnh khi hover hoặc focus (cảm ứng vẫn hiện); modal có panel bo góc, nút ×/chevron ở nền tối, nhóm size/tải căn phải và bỏ mũi tên tải xuống. Web build và 42 UI tests đạt. Xem [chi tiết và bằng chứng](hover-modal/README.md).

**Mở rộng đã duyệt 27/11/2026:** tìm kiếm, modal có slug/URL, download WebP, yêu thích, bộ sưu tập riêng tư, hồ sơ công khai, follow và sửa avatar đã tích hợp. Avatar dùng SeaweedFS qua PhotoKind AVATAR và không xuất hiện trong gallery. Các bảng xã hội mới thuộc Block 11. Migration bổ sung `202611270003_social_profiles`; không cần đổi env hoặc cài thư viện frontend mới. Xem [API, cách dùng và kiểm chứng](social-profile/README.md). Các kết quả cũ trong tài liệu này là lịch sử trước mở rộng.

**Cập nhật UX 27/11/2026:** thư viện “Xem thêm ảnh” 12 ảnh/lần, giữ danh sách/cuộn khi quay từ chi tiết, skeleton, upload kéo thả và hồ sơ cá nhân. API hỗ trợ `mine=true` từ session; chưa áp hạn mức ngày. Xem [chi tiết và kiểm chứng](feed-upload-profile/README.md).

**Cập nhật ngày 27/11/2026 sau lượt chạy thật.** Bản A+B+C tại main `e5a8492` cộng sửa lỗi local `f3d2172` đã chạy trên Supabase project mới và SeaweedFS Windows 4.55. Build API/web đạt, backend 71/71, UI mock 28/28, controlled browser 1/1, HTTP live và browser live đều đạt. [REVIEW.md](review-20261127/REVIEW.md) là báo cáo mới nhất; [ABC-integration.md](ABC-integration.md) là lịch sử ghép trước lượt live. “Đã thử một phần” không có nghĩa ký đạt toàn bộ hàng nghiệm thu.

| Mã | Chủ trì | Trạng thái / bằng chứng hiện có | Còn cần |
| --- | --- | --- | --- |
| E01 | B + A | Live đạt JPEG/PNG, response từng file, nhận diện chủ ảnh; xem REVIEW | Gom ảnh chụp multipart/SQL/key theo rubric |
| E02 | B | HTTP live đạt ảnh tốt + JPEG giả; decoder hỏng có test backend | Kiểm kê DB/kho cho fixture hỏng/thiếu bytes trên cloud |
| E03 | B | Backend đạt JPEG hợp lệ đúng 10 MiB và vượt ngưỡng, file sau vẫn xử lý | Lặp bộ ranh giới với DB/kho thật và lưu bằng chứng |
| E04 | B | Backend đạt body 55 MiB và +1, chunked và Content-Length | Bằng chứng lượt cloud nếu rubric yêu cầu |
| E05 | B | Backend đạt cấu trúc/metadata/số file, không gọi publisher và dọn staging | HTTP/DB/key của lượt live lỗi cấu trúc |
| E06 | B | Backend đạt đúng/vượt 40 triệu pixel trước full decode | Bằng chứng live theo rubric |
| E07 | B | Backend đạt orientation 2/3/5/6/7/8 và bỏ GPS; có bộ demo EXIF kiểm qua pipeline | Network/file metadata cho lượt upload fixture EXIF thật |
| E08 | B + A | Live đạt variant và alpha; A smoke thật ghép khớp hash | Gom metadata/manifest của fixture theo hồ sơ nộp |
| E09 | A + B | Backend đạt fault injection/unknown commit/rollback; đã quan sát P2028 trên cloud rồi sửa | Fault matrix cloud có kiểm soát, retry journal |
| E10 | A + C | Có quy trình README, chưa chạy | HTTP trước/sau restart Express/SeaweedFS giữ volume |
| E11 | C | Mock đạt 6 viewport/DPR; live browser tải WebP và ảnh decode được | Bộ Network/currentSrc/cache theo viewport với backend thật |
| E12 | A | S3 probe thật đạt private bucket, MIME/cache qua live HTTP/browser | Outage/traversal/security matrix và minh chứng riêng |
| E13 | A + C | Live đạt Hủy/owner DELETE 204, GET 404; A smoke HEAD mảnh vắng sau xóa | Lượt lỗi storage trả 202 và cleanup retry trên cloud |
| E14 | C | Mock đạt pagination/empty/404; live đạt reload và UI upload/xóa; compiled server có regression test | Thử lại full production HTTPS/fallback khi triển khai |
| E15 | A | Backend đạt pending/orphan/age/published protection và S3 pagination | Chạy maintenance thật có fixture lỗi rồi kiểm kê |
| E16 | A + B + C | API/web build đạt, backend 71, mock 28, controlled 1, HTTP/browser live đạt | Giữ lockfile/env mẫu; kết quả không thay mọi E còn thiếu |
| E17 | B + C | Live đạt public/auth/cookie/session/CSRF/login/logout; session expiry có test | Phiên còn hiệu lực sau restart process thật |
| E18 | A + B + C | Live hai tài khoản đạt tên uploader, guest 401, khác chủ 403, chủ xóa; không lộ email/hash | Gom HTTP/SQL/key đã lọc vào hồ sơ demo |
| E19 | A | Unit đạt ranh giới chunk; smoke SeaweedFS thật có chunkCounts 1/1/2 và hash khớp | Lưu manifest/key có chọn lọc cho hồ sơ nộp |
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
