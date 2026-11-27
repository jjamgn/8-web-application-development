# Hướng dẫn local và nguồn tài liệu hiện hành

Cập nhật 27/11/2026. **Block 11 đã tích hợp A+B+C**, không còn ở trạng thái “chỉ có Role A”. CSR React/Vite gọi Express API; Prisma/PostgreSQL giữ metadata và SeaweedFS giữ các mảnh ảnh.

## Source trên máy này

- `block-11/` ở gốc repo được đồng bộ từ bản A+B+C đã chạy thử, gồm các sửa ESM/transaction/Vite của commit local `f3d2172` và tài liệu cập nhật sau đó. `.env` local được giữ nguyên, không đưa lên GitHub.
- `.block11-review/block-11/` là worktree kiểm tra trên nhánh `codex/block11-integration-review`. Các dịch vụ đã chạy thử vẫn lấy source/build từ worktree này để tránh gián đoạn lúc đồng bộ.
- Không đồng thời chạy API/Vite từ cả hai vị trí vì cùng dùng cổng 3000/5173. Chọn một vị trí để phát triển tiếp; các file không tự đồng bộ sau lượt sao chép này.
- GitHub main tại lần kiểm tra gần nhất là `e5a8492`, đã có A+B+C nhưng chưa có commit sửa lỗi `f3d2172` và các cập nhật tài liệu local. Không nói “GitHub giống hệt bản chạy” cho đến khi push và kiểm tra remote.

## Chạy từ thư mục chính

Chuẩn bị Node 22.12+ (lượt mới kiểm chứng Node 26.13.0), .env API đúng target và SeaweedFS đang chạy. Không chép API .env vào web.

Terminal backend, từ `block-11/api/`:

```powershell
npm ci
npm run db:generate
npm run build
npm start
```

Hoặc `npm run dev` để watch TypeScript. `npm start` dùng output đã compile; sửa source phải build lại. `.env` phát triển trên máy này có APP_ORIGIN `http://localhost:5173`, NODE_ENV development; Vite phục vụ giao diện.

Terminal frontend, từ `block-11/web/`:

```powershell
npm ci
npm run dev
```

Mở `http://localhost:5173/photos`. Dùng nhất quán localhost cho browser để Origin/session đúng; Vite proxy API/media sang 127.0.0.1:3000.

Database của máy này đã áp dụng migration Block 11. Với môi trường mới, kiểm tra target trước rồi dùng `npm run db:migrate`; không reset hoặc seed DB hiện có. [Rà soát bảng legacy](database/OUT_OF_SCOPE_REVIEW.md) giải thích vì sao còn Chef/Dish/Ingredient.

## SeaweedFS: chọn một trong hai cách

**Windows native — đã chạy thật, không cần Docker:** `weed.exe` 4.55 nằm tại `.block11-review/.runtime-tools/seaweedfs/weed.exe`, data tại `.block11-review/.runtime-tools/seaweed-data/`. Phải giữ data directory này để giữ ảnh hiện có. Dữ liệu ảnh không nằm trong Git/Supabase.

Khi khởi động thủ công từ repo root, dùng credential trong `block-11/infra/seaweedfs/.env` cho biến môi trường AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY và S3_BUCKET; không gõ secret trên command line/log. Chạy weed mini với `-dir=<đường dẫn data hiện có> -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3.port=8333`. Chỉ bind mà không đặt IP quảng bá từng làm thành phần nội bộ gọi nhầm địa chỉ mạng trên máy này.

**Docker Compose — cấu hình có sẵn, chưa nghiệm thu Docker tại máy này:** xem [infra README](../infra/seaweedfs/README.md). Docker volume là kho khác với data native; không chuyển cách chạy rồi kỳ vọng các ảnh trong native tự xuất hiện. Cần kế hoạch sao lưu/chuyển dữ liệu trước khi đổi storage.

Sau khi kho và DB sẵn sàng, từ API chạy `npm run storage:check`. Lệnh ghi/xóa một object probe có journal, không phải kiểm tra chỉ đọc.

## Kiểm tra và tài liệu

- `api/`: `npm test` — hiện 71 test; build/test không cần ghi vào DB thật.
- `web/`: `npm run build`, `npm run test:e2e` — 28 UI mock; test tự chạy server, không chạy trùng Vite cùng cổng.
- Live HTTP/browser cần môi trường được phép ghi tài khoản/ảnh test; xem API/root README. Tài khoản fixture có thể còn lại theo contract; không xóa ảnh người dùng để ép gallery rỗng.
- [Báo cáo live hiện tại](evidence/review-20261127/REVIEW.md), [ma trận E01–E20](evidence/README.md), [bộ ảnh EXIF demo](demo-assets/exif/README.md).
- Các báo cáo A/B/C và validation ban đầu được giữ làm lịch sử; thông báo “chưa có môi trường thật” trong bản snapshot không ghi đè kết quả mới.
