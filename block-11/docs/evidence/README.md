# Theo dõi bằng chứng nghiệm thu

Ngày 27/11/2026. A+B+C đã ghép từ main `223c6e9`; API và React build đã có. **Chưa có môi trường PostgreSQL/SeaweedFS thật**. Không có hàng nào dưới đây được đánh dấu đạt toàn bộ. “Mock đạt” chỉ là kiểm tra UI có kiểm soát; báo cáo sau ghép ở [ABC-integration.md](ABC-integration.md).

| Mã | Chủ trì | Trạng thái / bằng chứng hiện có | Còn cần |
| --- | --- | --- | --- |
| E01 | B + A | Chưa chạy thật; live suite có luồng upload JPEG/PNG | Multipart, response thật, SQL/key |
| E02 | B | Mock UI có mixed/all-failed | Fixtures decoder và kiểm kê DB/kho thật |
| E03 | B | UI chặn >10 MiB; fixture bytes client không dùng nghiệm thu decoder | Ảnh hợp lệ đúng 10 MiB và vượt ngưỡng, DB/kho |
| E04 | B | Chưa kiểm tra | Body/chunked 55 MiB và >55 MiB |
| E05 | B | UI cảnh báo >5 file | HTTP parser/metadata/boundary và staging thật |
| E06 | B | Chưa kiểm tra | Decoder 40 triệu pixel và vượt ngưỡng |
| E07 | B | Chưa kiểm tra | Orientation/EXIF/GPS đầu ra thật |
| E08 | B + A | Chưa chạy thật; live suite kiểm tra width variants | WebP/alpha/manifest/hash thật |
| E09 | A + B | Chưa kiểm tra | Fault injection, rollback/task thật |
| E10 | A + C | Có quy trình README, chưa chạy | HTTP trước/sau restart Express/SeaweedFS giữ volume |
| E11 | C | Mock đạt; `mock-browser/responsive-*.json`, `gallery-*.png` | DOM/Network/currentSrc với WebP thật, cache có kiểm soát |
| E12 | A | Chưa chạy thật; live suite kiểm tra MIME/cache thành công | Media security, S3 riêng tư và outage thật |
| E13 | A + C | Mock đạt Hủy, 204, 202; screenshot dialog | DELETE/GET thật, SQL/key, cleanup và HEAD object |
| E14 | C | Mock đạt pagination/empty/404/reload/upload/khóa gửi | Lặp trên API và fallback production thật |
| E15 | A | Chưa kiểm tra | Cleanup/task/orphan phân trang, kiểm kê thật |
| E16 | A + B + C | Web build + Playwright mock; xem `validation.md` | API build/test, cấu hình mẫu A/B, live integration |
| E17 | B + C | Mock đạt public/auth/redirect/token rotation/logout | Cookie đã che, session SQL, CSRF/expiry/restart thật |
| E18 | A + B + C | Mock UI owner-only, tên uploader, không gửi uploaderId | Hai tài khoản HTTP/DB/storage thật; live suite sẵn có |
| E19 | A | Chưa kiểm tra | Chunk boundaries, manifest, GET/hash WebP thật |
| E20 | A + B | Chưa kiểm tra | Integrity 502/no-store, rollback/disconnect/tmp thật |

Các bài kiểm tra A/B có fault injection, decoder, chunk và migration đã được chạy lại sau ghép; bảng trên giữ trạng thái nghiệm thu **hạ tầng thật**, không phải đánh giá thiếu test source. Log API ở `ABC-api-tests.txt`; browser qua API có kiểm soát ở `abc-browser-results.json`.

## Artefact mock hiện có

- `mock-browser/gallery-<viewport>-dpr<dpr>.png`: gallery 375/DPR 1–2, 600/1, 1024/1, 1440/1–2.
- `mock-browser/responsive-<viewport>-dpr<dpr>.json`: src/srcset/sizes/width/height/loading/alt, currentSrc, renderedWidth, grid columns, DPR và media Network không chứa token.
- `mock-browser/login-*.png`, `register-*.png`, `upload-*.png`, `delete-dialog-*.png`: form/dialog tại 375 và 1440px.
- `validation.md`: lệnh đã chạy, kết quả và giới hạn. HTML report phát sinh ở `web/playwright-report/`, không commit.
- `mock-browser/playwright-results.json`: báo cáo lần chạy cuối, 28 đạt, 0 lỗi/skip/flaky; chỉ chứa dữ liệu test giả lập.

Các ảnh minh họa SVG và tài khoản fixture **không phải dữ liệu/storage thật**. Content-Type SVG trong JSON Network mock là chủ ý; WebP MIME/cache/integrity phải thu ở test live.

## Quy tắc thu bằng chứng thật

Dùng môi trường Block 11 cô lập. Ghi ngày, version/commit, lệnh, viewport/DPR, cache và dữ liệu test. Che giá trị cookie, CSRF, password, credential, connection string. Chỉ giữ HTTP status/header cần thiết, DTO công khai và SQL/key đã lọc; không lưu HAR/trace auth thô. Không xóa volume/DB dùng chung để làm sạch bằng chứng. A/B chịu phần của họ; C tổng hợp khi có kết quả thật.
