# Kết quả kiểm tra phần C

> **SNAPSHOT LỊCH SỬ:** báo cáo/bàn giao này giữ kết quả tại thời điểm lập. Trạng thái tích hợp và môi trường thật mới nhất xem [báo cáo chạy thật](review-20261127/REVIEW.md) và [ma trận hiện hành](README.md). Các câu “chưa chạy/chưa có môi trường thật” bên dưới không phải kết luận hiện tại.

Đây là báo cáo **trước khi ghép A/B**. Xem [ABC-integration.md](ABC-integration.md) cho trạng thái mới; JSON/screenshot mock được tạo lại khi kiểm tra bản ghép và có thể mang đường dẫn checkout tích hợp.

Ngày 27/11/2026, chạy tại `D:\project\WEB\block-11\web`. Node dùng cho build/test **22.23.3**, npm **10.7.0**, Google Chrome **158.0.8127.38**, Windows. Nhánh `codex/block11-c`.

## Lệnh thực tế

| Lệnh | Kết quả cuối |
| --- | --- |
| `npm exec --yes --package=node@22.23.3 -- npm ci --no-audit --no-fund --fetch-retries=0` | Exit 0, thêm 77 package từ lockfile |
| `npm exec --yes --package=node@22.23.3 -- npm run build` | Exit 0, TypeScript đạt, Vite 7.3.8 build đạt; 45 modules |
| `npm exec --yes --package=node@22.23.3 -- npm run test:e2e` | Exit 0, **28 passed (32.9s)**, 2 workers, không retry |
| `npm exec --yes --package=node@22.23.3 -- npm run test:e2e:live -- --list` | Exit 0, nhận diện 1 test live; **chỉ liệt kê, chưa chạy** |
| `npm audit --json` | Exit 0, vulnerabilities: 0 (info/low/moderate/high/critical đều 0) |

Máy có Node mặc định 20.14; npm launcher hiện tại vẫn in cảnh báo engine trong bước cài đặt, dù child process build/test đã dùng Node 22. Cài/chọn Node 22 theo README sẽ tránh cảnh báo này. Không hạ Vite về major cũ để chạy Node không phù hợp.

Các bản Router/Vite tham chiếu ban đầu đã được cập nhật trong cùng major lên `react-router@7.18.7`, `vite@7.3.8`, sau đó áp dụng bản vá dependency tương thích bằng npm và kiểm tra lại từ `npm ci`. Lockfile là nguồn phiên bản tái lập. React/React DOM 19.2.0, TypeScript 5.9.3, Playwright 1.56.1.

## Phạm vi 28 ca browser đạt

- 13 ca auth/upload: đăng ký không auto-login, quay về upload sau login, xoay CSRF, logout, không ghi web storage, allowlist returnTo, `/me` cũ không ghi đè login, lỗi login 401/403/429, mật khẩu UTF-8/confirm, metadata Unicode, thứ tự FormData, mixed/all-failed, lỗi request/network/session, khóa gửi và giới hạn client. Một số ca gộp nhiều kiểm tra trong cùng luồng.
- 7 ca gallery/detail/delete: công khai dù me 401/503, thông tin uploader, reload detail, ảnh eager, pagination/empty/query/404/retry, chỉ hiện nút đúng chủ, Hủy/ESC không DELETE, xác nhận 204/202 và lỗi 403.
- 6 ca responsive: 375px DPR 1–2, 600px DPR 1, 1024px DPR 1, 1440px DPR 1–2; đúng 1/2/3 cột, không tràn ngang, sizes khớp chiều rộng ô, thuộc tính ảnh đầy đủ, currentSrc là variant được khai báo.
- 2 ca visual form/dialog: login/register/upload/delete tại 375px và 1440px không tràn ngang, có ảnh chụp.

Máy chủ Vite do Playwright tự quản lý đã dừng sau test. API và media trong bộ này đều do Playwright mock; không thay đổi DB hoặc bucket.

## Bằng chứng

- Báo cáo máy đọc được: [mock-browser/playwright-results.json](mock-browser/playwright-results.json), `expected=28`, `unexpected=0`, `skipped=0`, `flaky=0`.
- Ảnh gallery: [desktop](mock-browser/gallery-1440-dpr1.png), [mobile](mock-browser/gallery-375-dpr1.png).
- Ảnh form: [login desktop](mock-browser/login-1440.png), [upload mobile](mock-browser/upload-375.png), [xác nhận xóa mobile](mock-browser/delete-dialog-375.png).
- DOM/Network: [mobile DPR 1](mock-browser/responsive-375-dpr1.json), [mobile DPR 2](mock-browser/responsive-375-dpr2.json), [desktop DPR 1](mock-browser/responsive-1440-dpr1.json), [desktop DPR 2](mock-browser/responsive-1440-dpr2.json).

Lần mở rộng trước đó có 2 lỗi strict locator ở test xóa do cùng lúc có hai phần tử `role=status` (thông báo xóa và đang tải gallery). Đã sửa selector theo nội dung thông báo; toàn bộ 28 ca cuối đạt mà không retry. Khi kiểm tra ảnh đã sửa hiển thị tên user trên mobile và vị trí skip link; artefact hiện tại được tạo lại sau sửa.

## Chưa chạy / không thể kết luận

Không có API/DB/SeaweedFS trong checkout này; **chưa chạy live suite**, backend build/test, xác thực session/CSRF thật, bảo vệ ownership thật, media WebP/hash/chunk, DB/object cleanup, restart, outage, production Express deep link. Mock media dùng SVG theo chủ ý; ảnh chụp và Network mock không chứng minh MIME WebP/cache/integrity thật. Không có hàng E01–E20 được ký nghiệm thu toàn bộ.

Sau khi A/B bàn giao, dùng các lệnh live và quy trình README, thu bằng chứng đã lọc bí mật vào thư mục riêng, cập nhật checklist theo kết quả thực tế.
