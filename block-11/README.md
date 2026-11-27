# Block 11 — Khoảnh khắc / Photo Gallery

**Cập nhật tác giả/tải ảnh 27/11/2026:** avatar + tên người đăng nằm trong lớp hover, chi tiết luôn hiện avatar/tên; Tải WebP có dropdown gắn liền, chọn size tải ngay. DTO uploader bổ sung avatarUrl công khai/null; không đổi schema/env. Xem [quy cách và kiểm chứng](docs/evidence/author-download/README.md). Các mô tả bố cục cũ bên dưới được thay thế bởi bản cập nhật này.

**Cập nhật bố cục 27/11/2026:** tim/lưu/tải chỉ hiện trên ảnh khi hover hoặc focus (cảm ứng vẫn hiện); modal có panel bo góc, nút ×/chevron ở nền tối, nhóm size/tải căn phải và bỏ mũi tên tải xuống. Web build và 42 UI tests đạt. Xem [chi tiết và bằng chứng](docs/evidence/hover-modal/README.md).

**Mở rộng đã duyệt 27/11/2026:** tìm kiếm, modal có slug/URL, download WebP, yêu thích, bộ sưu tập riêng tư, hồ sơ công khai, follow và sửa avatar đã tích hợp. Avatar dùng SeaweedFS qua PhotoKind AVATAR và không xuất hiện trong gallery. Các bảng xã hội mới thuộc Block 11. Migration bổ sung `202611270003_social_profiles`; không cần đổi env hoặc cài thư viện frontend mới. Xem [API, cách dùng và kiểm chứng](docs/evidence/social-profile/README.md). Các kết quả cũ trong tài liệu này là lịch sử trước mở rộng.

**Cập nhật UX 27/11/2026:** thư viện “Xem thêm ảnh” 12 ảnh/lần, giữ danh sách/cuộn khi quay từ chi tiết, skeleton, upload kéo thả và hồ sơ cá nhân. API hỗ trợ `mine=true` từ session; chưa áp hạn mức ngày. Xem [chi tiết và kiểm chứng](docs/evidence/feed-upload-profile/README.md).

Bản ghép **A + B + C**, theo [BLOCK11_CONTRACT.md](BLOCK11_CONTRACT.md): React 19 + Vite 7 + React Router 7, Express 5/TypeScript, Prisma 6.12.0/PostgreSQL và SeaweedFS S3. Phần A/B được kéo từ GitHub main `223c6e9`; C nối trực tiếp DTO/limits trong `contracts/`.

Tài liệu: [API](api/README.md), [SeaweedFS](infra/seaweedfs/README.md), [bàn giao A](docs/handoffs/A.md), [B](docs/handoffs/B.md), [C](docs/handoffs/C.md), [báo cáo ghép A+B+C](docs/evidence/ABC-integration.md), [đề bài](<docs/Upload, xử lý, lưu trữ và.html>).

## Trạng thái bàn giao

- Có gallery công khai, phân trang 12 ảnh theo API, chi tiết, đăng ký/đăng nhập/đăng xuất, upload nhiều ảnh với preview và metadata riêng, xóa có xác nhận và chỉ hiện cho chủ ảnh.
- Có Playwright mock cho UI, kiểm thử browser qua Express/sharp/PhotoService/media thật với DB/S3 test double, và live suite riêng cho PostgreSQL/SeaweedFS. Ứng dụng production không có API giả hoặc fallback dữ liệu demo.
- Bằng chứng và giới hạn kiểm tra: [docs/evidence/README.md](docs/evidence/README.md). Điểm ghép: [docs/handoffs/C.md](docs/handoffs/C.md).
- Đã chạy thực tế trên Windows/Node 26.13.0, Supabase project mới qua Session pooler và SeaweedFS 4.55 Windows: build API/web đạt, **71/71 backend**, **28/28 UI mock**, **1/1 controlled browser**, HTTP live, browser live hai tài khoản và smoke chia/ghép/hash/xóa mảnh đều đạt. Xem [báo cáo chạy thật](docs/evidence/review-20261127/REVIEW.md).
- Chưa ký đạt toàn bộ E01–E20: restart có ảnh tồn tại, fault matrix trên cloud, Docker và HTTPS/multi-instance vẫn cần minh chứng riêng. Xem [ma trận bằng chứng hiện tại](docs/evidence/README.md).
- [Hướng dẫn local thống nhất](docs/LOCAL_SETUP.md) phân biệt source chính `block-11/` với worktree kiểm tra `.block11-review/block-11/`; không còn dùng README thời điểm chỉ có Role A để kết luận chưa tích hợp.
- Trang upload có so sánh pixels gốc chưa áp dụng EXIF với WebP thật sau khi server trả thành công. Lượt cập nhật giao diện này đạt **30 UI tests và 2 controlled browser tests**; xem [bằng chứng so sánh EXIF](docs/evidence/exif-comparison/README.md). Chạy SeaweedFS Windows bằng `infra/seaweedfs/start-native.ps1`, không bắt buộc Docker.
- Máy người dùng đã cấu hình [demo LAN](docs/LAN_SETUP.md): dùng `npm run dev:lan` ở web, APP_ORIGIN trùng URL LAN và Firewall giới hạn LocalSubnet. IP hiện tại `192.168.100.154`; khi đổi mạng phải kiểm tra lại IP/origin/rule. Chỉ `npm run dev` vẫn bind localhost.
- [Dọn bảng ngoài phạm vi đã hoàn tất](docs/database/LEGACY_REMOVAL.md): Chef/Dish/Ingredient đã được backup, kiểm chứng phục hồi và xóa theo yêu cầu người dùng bằng migration riêng; giữ nguyên dữ liệu Photo Gallery và lịch sử migration. [Bản rà soát cũ](docs/database/OUT_OF_SCOPE_REVIEW.md) chỉ là lịch sử trước khi quyết định xóa.

## Nền và phiên bản

- Bản tích hợp được chuẩn bị trên `main` từ commit nền A+B `223c6e9` ngày 27/11/2026. C ban đầu được dựng độc lập trên `codex/block11-c` từ HEAD cũ `213f076`, rồi ghép vào nền A+B; giữ lịch sử A/B.
- Đã tham chiếu `block-07/web/package.json`, `vite.config.ts` và cấu hình Playwright của Block 9; dựng bộ khung gọn, không sao chép nghiệp vụ Restaurant App. Không sửa source block trước.
- Node **22.23.3**, npm **10.7.0**, Chrome **158.0.8127.38** đã dùng để kiểm tra. Node mặc định 20.14 trên máy này quá cũ để chạy Vite 7. Dùng Node 22.12+ hoặc Node 20.19+; `.nvmrc` ghi phiên bản đã kiểm chứng. Yêu cầu Node của Vite 7: [tài liệu chính thức](https://v7.vite.dev/guide/migration).
- Để chạy cả API và web, dùng **Node 22.12+** theo engines của API.
- Lượt kiểm chứng mới nhất dùng Node **26.13.0**, npm **11.20.0**; đã sửa module boundary ESM của `contracts/`, timeout transaction Supabase và watcher Vite Windows. Kết quả Node 22 bên trên là lịch sử bàn giao C, không phải phiên bản Node duy nhất được hỗ trợ.
- Dependency trực tiếp khóa phiên bản trong `web/package.json`; `web/package-lock.json` dùng cho `npm ci`. Giữ các major đã chốt trong contract.

**Chế độ LAN hiện tại:** tại `web/` dùng `npm run dev:lan`, mở `http://192.168.100.154:5173/photos`, API đặt APP_ORIGIN trùng origin này. Xem [LAN_SETUP.md](docs/LAN_SETUP.md). Các lệnh localhost bên dưới chỉ dùng sau khi đổi APP_ORIGIN về localhost và restart API. Khi chạy live tests qua LAN, đặt LIVE_BASE_URL theo URL LAN đang dùng.

## Chạy web

Tại `block-11/web/`, sau khi chọn Node phù hợp:

```powershell
npm ci
npm run dev
```

Mở **http://localhost:5173**. Không dùng lẫn `127.0.0.1` và `localhost` cho origin của trình duyệt. Vite proxy `/api` và `/media` tới `http://127.0.0.1:3000`, giữ nguyên Origin của browser. Backend B phải cấu hình `APP_ORIGIN=http://localhost:5173`.

```powershell
npm run build
npm run preview
```

Build nằm ở `web/dist/`. `preview` chỉ kiểm tra bundle tĩnh tại cổng 4173, không có proxy backend; dùng `npm run dev` khi kiểm tra API hoặc production Express của B khi kiểm tra cùng origin.

Nếu chưa đổi Node mặc định, có thể chạy tạm bằng Node 22 đã tải qua npm:

```powershell
npm exec --yes --package=node@22.23.3 -- npm run build
npm exec --yes --package=node@22.23.3 -- npm run dev
```

Frontend không cần `.env`, URL tuyệt đối hoặc credential. Các request dùng đường dẫn tương đối và `credentials: 'same-origin'`. CSRF và user chỉ giữ trong memory, `/me` đọc lại sau reload. Không ghi token hay mật khẩu vào localStorage/sessionStorage. Browser tự đặt Origin và boundary multipart.

## Kiểm thử giao diện độc lập

Chạy tại `web/`, dừng Vite cổng 5173 nếu đang chạy. Playwright tự khởi động/dừng máy chủ của bài test, không tái sử dụng server chưa biết nguồn.

```powershell
npm run test:e2e
```

Mặc định dùng Chrome được cài trên máy ở chế độ headless. Nếu dùng Chromium của Playwright:

```powershell
npx playwright install chromium
$env:PLAYWRIGHT_CHANNEL = 'chromium'
npm run test:e2e
```

Test chặn API/media bằng fixtures trong `tests/mock-api.ts`, không cần API/DB/S3. Mock trả ảnh SVG minh họa dưới URL variant để kiểm tra DOM và lựa chọn resource, **không chứng minh WebP, hash hoặc object storage**. Test responsive dùng context mới cho mỗi viewport/DPR, tránh cache dùng chung, ghi `currentSrc`, kích thước ô, thuộc tính DOM và response media tại `docs/evidence/mock-browser/`.

HTML report ở `web/playwright-report/`; lỗi có screenshot/trace ở `web/test-results/`, các thư mục này bị gitignore. Có thể mở bằng `npx playwright show-report`. Cấu hình webServer theo [Playwright chính thức](https://playwright.dev/docs/test-webserver).

## Kiểm thử tích hợp thật

Chỉ chạy sau khi A/B đã dựng API đúng contract, migration DB Block 11 riêng, bucket SeaweedFS riêng và Vite hoặc production Express đang phục vụ. Không dùng DB Restaurant App.

Tại `web/`:

```powershell
$env:LIVE_BASE_URL = 'http://localhost:5173'
$env:LIVE_RUN_MUTATIONS = '1'
npm run test:e2e:live
```

Đây là bài kiểm tra thật, không intercept request: tạo hai tài khoản test `@example.test`, tạo JPEG/PNG từ canvas 1200×800, upload qua UI, kiểm tra variants, khách đọc ảnh, MIME/cache, khách xóa 401, người khác xóa 403, chủ ảnh hủy/xác nhận xóa, reload và logout. **Luồng này đã đạt trên môi trường thật**; lượt cloud có expect timeout 20 giây, timeout tổng 240 giây và chờ logout 204 trước khi điều hướng. Test cố gắng dọn ảnh của nó trong `finally`; 202 nghĩa cần A chạy cleanup. Tài khoản test vẫn còn vì baseline không có xóa tài khoản. Trace live tắt để không lưu mật khẩu/cookie/CSRF. Không bật trace/HAR thô chứa bí mật để làm bằng chứng.

Nếu không đặt `LIVE_RUN_MUTATIONS=1`, test live bị **skip**, không được báo pass tích hợp. Test này không tự restart dịch vụ, fault injection hay kiểm kê DB/S3; các phần đó cần bằng chứng A/B và quy trình bên dưới.

## Chạy production A+B+C

1. Build web bằng `npm run build` từ `web/`, API bằng `npm run build` từ `api/`. Express đã tìm `web/dist` theo vị trí source hoặc module đã build, không dựa vào cwd.
2. Auth/photos đã mount ở `/api`, media A ở `/media` trước static/SPA. Unknown `/api` và `/media` trả JSON 404, không trả `index.html`.
3. Express đã phục vụ static và fallback `index.html` cho route React, kể cả khi source nằm dưới thư mục có dấu chấm. Reload trực tiếp `/photos/:id`, `/photos/upload`, `/register`, `/login` hoạt động qua fallback.
4. Production `APP_ORIGIN` là HTTPS origin thật; cookie Secure, session PostgreSQL, cấu hình proxy đúng hạ tầng. API và media cùng origin với React; không expose S3/Filer/Admin cho browser.
5. Build không chứa credential; không đưa các biến `S3_*`, database hay session secret vào `VITE_*`.

Chạy `npm start` từ `api/` sau khi điền `.env`, migrate DB Block 11 riêng, kiểm tra storage và build cả hai phần. Xem API README để cấu hình HTTPS reverse proxy.

Không có server giả trong bản giao C. Khi API chưa chạy, UI báo lỗi kết nối; đó không phải dữ liệu gallery rỗng.

## Cài đặt và chạy backend / SeaweedFS

Source A/B, package/lockfile, migration và Compose đã có trong bản ghép. API không khởi động bằng test double; cần DB và bucket riêng có xác thực. Chi tiết đầy đủ ở [API README](api/README.md) và [SeaweedFS README](infra/seaweedfs/README.md).

| Thư mục | Lệnh tối thiểu sau khi ghép |
| --- | --- |
| `api/` | `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run dev`, `npm run build`, `npm test` |
| `api/` | `npm run storage:check`, `npm run storage:cleanup` |
| `infra/seaweedfs/` | Copy `.env.example` thành `.env`, điền credential; `docker compose up -d`, `docker compose stop`, `docker compose start` |

Copy `api/.env.example` thành `api/.env` và điền `DATABASE_URL` riêng, `SESSION_SECRET`, `APP_ORIGIN`, `UPLOAD_TMP_DIR`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`; `PORT` mặc định 3000 và `TRUST_PROXY_HOPS` đúng proxy. Giữ credential/bucket nhất quán với `infra/seaweedfs/.env`. Không commit `.env` hoặc dữ liệu thật.

Thứ tự dev: khởi động SeaweedFS; tại `api/` chạy `npm ci`, generate/migrate, storage check và `npm run dev`; tại `web/` chạy `npm ci` và `npm run dev`.

## Kiểm thử browser xuyên A+B+C có kiểm soát

Sau `npm ci` và `npm run db:generate` trong `api/`, chạy từ `web/`:

```powershell
npm run test:e2e:integration
```

Lệnh build React rồi mở Chrome qua Express tại localhost:3000; kiểm tra hai tài khoản, cookie/CSRF, upload JPEG/PNG bằng sharp, chia/ghép WebP bởi A, quyền xóa, MIME/cache, reload production và logout. Không intercept API/media trong browser. Chỉ DB/user/session repository và object storage là test double, nằm trong `api/tests/browser-server.ts`; không được dùng làm server demo hoặc production. Máy chủ được test tự quản lý, cần cổng 3000 trống. Kết quả JSON ở `docs/evidence/abc-browser-results.json`.

Đây là kiểm tra điểm ghép, không chứng minh persistence/restart PostgreSQL hoặc SeaweedFS thật. Dùng `test:e2e:live` khi đã cấu hình dịch vụ thật.

## Demo và nghiệm thu phối hợp

1. Khởi động DB/API/SeaweedFS thật, chạy migration Block 11 và `storage:check`. Khách mở `/photos` và detail, xác nhận gallery không phụ thuộc đăng nhập.
2. Khách vào upload → login, đăng ký xong phải đăng nhập; quay về upload. Chọn 2 ảnh, điền title/alt riêng, kiểm tra thứ tự multipart, người đăng và URL WebP. Thử ảnh hỏng đi cùng ảnh tốt, lỗi từng file và lỗi toàn request.
3. Dùng viewport 375/DPR 1–2 và 1440/DPR 1–2, tắt cache DevTools, reload và chụp DOM/Network/currentSrc. So sánh `sizes` với ô thực; ở dưới 600px là 1 cột, 600–1023 là 2, từ 1024 là 3. Ảnh detail eager/high, gallery lazy; fallback gần 960 nhất.
4. Tài khoản khác không có nút xóa; direct HTTP phải 403. Chủ ảnh mở dialog rồi Hủy: không có DELETE; xác nhận: 204 đã dọn, hoặc 202 đã ẩn/chờ dọn. Với 202, A chạy cleanup và đối chiếu HEAD mảnh/DB; request mới tới origin phải 404 sau khi ẩn.
5. Ghi id và URL của ảnh đã upload. Restart Express, reload gallery/detail/media; session DB phải còn hợp lệ trong hạn tuyệt đối 2 giờ. A stop/start hoặc recreate SeaweedFS **giữ volume**, kiểm tra lại cùng URL; không upload/seed lại. Dọn staging đã hết request rồi kiểm tra ảnh vẫn đọc được. C thu HTTP/browser; A đối chiếu SQL/key/hash.
6. Tích hợp ảnh/data thật, ghi kết quả vào [checklist bằng chứng](docs/evidence/README.md); chỉ đánh dấu đạt sau khi có bằng chứng thực tế. Test bảo mật, ngưỡng decoder/body, chunk/rollback và outage do A/B chủ trì.

## Lưu bền vững và sao lưu

Ảnh công bố là các object mảnh trong **persistent volume SeaweedFS**, manifest, user, session và cleanup task ở **PostgreSQL Block 11**. `UPLOAD_TMP_DIR` chỉ chứa file tạm, không phải nguồn ảnh hoặc backup. Không có local storage fallback.

Compose của A khóa SeaweedFS 4.55, dùng volume `block11-storage_seaweed-data`. Dừng nhận upload và cleanup đang chạy, sao lưu PostgreSQL (ví dụ `pg_dump` từ kết nối Block 11) cùng dữ liệu **và metadata** của volume SeaweedFS tại cùng mốc nhất quán; lưu ngoài source và bảo vệ quyền đọc. Ghi version, cấu hình bucket và tham chiếu credential riêng, không commit bí mật. Thử restore vào DB/bucket cô lập, chạy `storage:check`, đọc lại media theo manifest/hash rồi mới coi backup hợp lệ.

Quy trình restart dùng `docker compose stop` / `start`, hoặc recreate giữ named volume. Không xóa volume trong quy trình restart/demo.
