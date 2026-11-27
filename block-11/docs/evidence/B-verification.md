# Kiểm chứng role B — 27/11/2026

> **SNAPSHOT LỊCH SỬ:** báo cáo/bàn giao này giữ kết quả tại thời điểm lập. Trạng thái tích hợp và môi trường thật mới nhất xem [báo cáo chạy thật](review-20261127/REVIEW.md) và [ma trận hiện hành](README.md). Các câu “chưa chạy/chưa có môi trường thật” bên dưới không phải kết luận hiện tại.

Build/test B độc lập trên Windows, Node 26.12.1, npm 11.20.0. Log lệnh ở `B-build.txt` và `B-tests.txt`. Không dùng test double làm bằng chứng PostgreSQL/SeaweedFS thật.

| Contract | B đã kiểm chứng | Còn cần tích hợp |
| --- | --- | --- |
| E01–E02 | JPEG/PNG/file giả/file thiếu bytes, index và kết quả riêng; identity không lộ email/hash | DB rows, object/chunk thật |
| E03–E04 | JPEG đúng 10 MiB; +1 byte lỗi riêng; multipart đúng 55 MiB và +1 byte, chunked và Content-Length | Kiểm kê DB/kho khi tích hợp |
| E05 | 0/6 file, metadata sai/trùng/thừa key, boundary hỏng; không gọi publisher, staging sạch; 5 file thành công | Xác nhận DB/kho không phát sinh |
| E06–E08 | 40 MP đúng ngưỡng và vượt; orientation xoay/lật, EXIF/GPS bị loại; width/height, alpha, WebP và không upscale | Manifest/hash/SeaweedFS/media |
| E09 | Publisher lỗi có kiểm soát: lỗi riêng, file sau vẫn được xử lý | Transaction, PUT lỗi, rollback, kết quả commit không rõ do A |
| E10–E12 | Media router được mount ngoài session; JSON 404/no-store lỗi | Restart thật, header/cache media A và responsive images C |
| E13–E15 | DELETE session/CSRF, truyền actor, ánh xạ 204/202/403/404 | Dọn object/task/temp cũ thật, UI và Playwright |
| E16 | API build và 38 backend tests đạt; lockfile/config mẫu | Web build/Playwright và A integration |
| E17–E18 | Auth/CSRF, rotate cookie/token, session absolute expiry, không hồi sinh sau logout, kiểm tra lại sau staging; public GET không Set-Cookie | Session PostgreSQL qua restart; owner enforcement trong transaction A |
| E19–E20 | Giao PreparedPhoto + actor vào publisher đúng interface | Chunker/media-integrity/cancel/upstream rollback thuộc A |

`npm run test:live` chưa chạy: cần backend A+B, PostgreSQL riêng và SeaweedFS thật. Chưa có E nào được đánh dấu nghiệm thu toàn hệ thống chỉ dựa trên các test B.
