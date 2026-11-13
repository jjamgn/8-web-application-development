# Nhật ký làm việc — Role A, Bài 1, Block 09

Nhật ký này ghi quá trình làm việc, quyết định và thay đổi thực tế theo thứ tự. Kế hoạch chi tiết nằm trong [plan.md](./plan.md); tài liệu yêu cầu là [BAI1_CONTRACT.md](./BAI1_CONTRACT.md). Các mục mới được bổ sung phía dưới, giữ lại diễn biến trước đó.

## 13/11/2026 — Khảo sát và lập kế hoạch ban đầu

- Người dùng yêu cầu lập kế hoạch 40 phút cho Role A, có lý do và giải thích luồng thực hiện; xác nhận “bản abstract” là `BAI1_CONTRACT.md`.
- Đã đọc contract, khảo sát schema/API Block 7 và auth đang chạy trong `block-08/src/auth/**`, đối chiếu cách mount router trong `block-08/src/app.ts`.
- Ghi nhận tại thời điểm khảo sát: chưa có working copy `BAI1/api` hoặc `BAI1/web` trong Block 09.
- Đã lập kế hoạch gồm 8 giai đoạn, phân công A–B–C, luồng đăng ký/OTP, forgot/reset, refresh/rotation/revoke, DTO đề xuất và tiêu chí kiểm thử.
- Đã nêu các điểm cần thống nhất trước khi code phụ thuộc: chữ ký service A–B, nơi lưu passwordVersion của refresh, trách nhiệm helper CAPTCHA/login và baseline DB/migration. Các đề xuất chưa được áp dụng vào contract hoặc code.
- Thay đổi ban đầu: tạo `history.md` chứa cả kế hoạch và mẫu ghi kết quả.
- Kiểm tra đã chạy: đọc lại file UTF-8; kiểm tra 8 giai đoạn liên tục, tổng đúng 40 phút.
- Chưa triển khai source, tạo working copy, chạy migration, build hoặc kiểm thử chức năng.

## 13/11/2026 — Tách kế hoạch và nhật ký theo yêu cầu

- Người dùng làm rõ: kế hoạch đặt trong `plan.md`; `history.md` ghi quá trình làm việc và các thay đổi.
- Đã tạo `plan.md` từ nội dung kế hoạch trước đó, giữ lịch 40 phút, lý do, luồng xử lý, phạm vi, đề xuất và tiêu chí nghiệm thu.
- Đã sửa tiêu đề và các tham chiếu trong kế hoạch để phân biệt vai trò hai file; thay bảng trạng thái/mẫu nhật ký cuối kế hoạch bằng hướng dẫn cập nhật `history.md` trong quá trình làm việc.
- Đã tổ chức lại `history.md` thành các mục diễn biến thực tế, gồm cả lần lập kế hoạch ban đầu và lần điều chỉnh này.
- Lý do thay đổi: tách việc dự kiến khỏi việc đã thực hiện và giữ dấu vết khi kế hoạch hoặc cách triển khai thay đổi.
- Phạm vi lần điều chỉnh: `plan.md` và `history.md`; chưa triển khai code Role A.
- Kiểm tra sau điều chỉnh: các file tham chiếu tồn tại; plan.md giữ đủ 8 giai đoạn liên tục, tổng 40 phút; history.md đã tách khỏi bảng kế hoạch và không còn tham chiếu cũ sai vai trò.

## 13/11/2026, 10:01 (Asia/Saigon) — Bắt đầu triển khai, chuẩn bị nền

- Người dùng yêu cầu bắt đầu làm theo kế hoạch Role A.
- Đã tạo snapshot Block 7 tại `BAI1/api` và `BAI1/web`, giữ source, assets, lockfile và migration history; loại node_modules, cache/build, var/tmp và file .env thật.
- Nguồn Block 7/8 chỉ được đọc, không chỉnh sửa. Không sao chép credential Block 8.
- Đang chờ xác nhận phần giao tiếp/schema A–B và quyền cập nhật package/test script đã hỏi; trong lúc chờ tiếp tục phần độc lập.
- Máy có PostgreSQL 17 CLI; sẽ chuẩn bị DB thử nghiệm cô lập trong workspace nếu chạy được, không dùng DB dùng chung.

## 13/11/2026 — Chốt giao tiếp và phạm vi theo xác nhận của người dùng

- Người dùng đồng ý DTO mục 6 plan.md, snapshot passwordVersion trên RefreshToken và cho A cập nhật dependency/test script để build–test.
- Đã ghi bổ sung vào BAI1_CONTRACT.md trước khi làm phần schema/service phụ thuộc. B vẫn phụ trách route/JWT/cookie/CORS.
- File triển khai: schema/migration mới; src/validation/auth.ts; src/services/auth/**; tests auth và package/lockfile cần thiết. Giữ nguyên route/resource và nguồn Block 7/8.
- Đã tách validation, helper token/HMAC/transaction và mailer từ nguồn auth đang chạy Block 8; bỏ fallback SESSION_SECRET, mã mời, đổi reset URL sang WEB_ORIGIN/reset.

## 13/11/2026, 10:09–10:14 (Asia/Saigon) — Schema, service và kiểm thử đầu tiên

- Đã tạo `202611130001_csr_auth` bằng Prisma migrate diff từ schema Block 7, bổ sung model auth/RefreshToken/passwordVersion; giữ schema và 7 migration nghiệp vụ cũ. Migration mới bật RLS cho bảng auth theo hướng Block 8.
- Cài dependency thành công sau khi chuyển sang lệnh được phép truy cập mạng; cache offline thiếu gói. Prisma engine được tái sử dụng từ bản 6.12.0 có sẵn để tránh tải lại, chỉ đặt trong node_modules của working copy.
- `prisma validate`, generate Prisma Client và TypeScript build đã pass.
- Đã áp 7 migration Block 7 trên PostgreSQL cô lập `.local/pgdata`, cổng 55439, user role_a/DB role_a_test; thêm dữ liệu giả món/chef/ingredient trước khi áp migration auth. Migration auth áp thành công; kiểm tra giữ dữ liệu/quan hệ/searchVector/history đã pass. Không truy cập DB chung hoặc SMTP thật.
- Đã tạo service đăng ký/OTP/resend, forgot/reset, family/rotate/reuse/revoke và helper xác thực/bộ đếm login; adapter CAPTCHA mặc định từ chối, B cần tiêm Turnstile thật.
- Bổ sung `refreshFamilyForCsrf`: chỉ lấy family để B kiểm tra CSRF trước rotate; token đã dùng vẫn phải tới rotate để phát hiện reuse. `inspectRefresh` chỉ cho phiên còn hợp lệ và phục vụ /csrf; không được dùng nó để chặn sớm nhánh reuse.
- Unit auth: 8/8 pass. PostgreSQL integration: 24/24 pass, gồm double activate/reset/refresh, reset cạnh tranh rotate, logout cạnh tranh rotate, quota/OTP/passwordVersion/TTL.
- Test API cũ lúc đầu bị sandbox chặn HTTP loopback; chạy lại với quyền kết nối localhost đã được phép. Khi đó 24/25 test tổng hợp pass, còn lỗi stub PATCH kế thừa Block 7.
- Đối chiếu hash xác nhận test/resource service giống hệt source Block 7 trước sửa. Nguyên nhân: stub update ghi đè trường bằng undefined, trong khi Prisma bỏ qua undefined. Đã sửa riêng stub trong tests/api.test.ts để giữ đúng hành vi Prisma; không sửa handler/service resource. Đang kiểm tra lại.
- Đã điều chỉnh validation để token reset thiếu/sai kiểu vẫn đi vào kết quả invalid thay vì bị biến thành lỗi validation chung; B map INVALID_RESET_TOKEN.

## 13/11/2026, 10:15–10:19 (Asia/Saigon) — Hoàn chỉnh kiểm chứng và bàn giao

- Sửa stub API hoàn chỉnh: loại undefined trước cả ghi state và ghi nhận DB-call args; lần chạy lại `npm test` đạt 25/25, không skip. TypeScript build pass.
- Bổ sung test PostgreSQL cho resend/forgot/login-attempt đồng thời, SMTP lỗi muộn và minh họa lỗi transaction do coding agent tạo trong môi trường cô lập. Kết quả mới: 29/29 pass, không skip.
- Minh họa lỗi: chỉ trong test, update revoke rồi throw làm rollback; test chứng minh family còn sống, sau đó gọi service đúng trả result sau commit và chứng minh family bị revoke. Không đưa code lỗi vào service thực tế.
- Prisma migrate status: up to date, đủ 8 migration. migrate diff DB→schema trả khác biệt hai index Dish gốc (price/id và searchVector GIN), được đối chiếu có trong migration Block 7; không báo khác biệt auth. Giữ index tìm kiếm, không dùng db push để xóa.
- Đã đối chiếu hash: toàn bộ 7 migration + migration_lock.toml từ Block 7 giữ nguyên; schema nghiệp vụ gốc là nguyên vẹn phần đầu schema mới. Không sao chép .env thật; chỉ có .env.example trong source snapshot.
- Đã tạo BAI1/ROLE_A_HANDOFF.md: danh sách module chuyển từ Block 8, chữ ký service/DTO thực tế, mapping lỗi, yêu cầu env, quy trình tích hợp B, kết quả kiểm thử và phần còn thiếu.
- Cập nhật plan.md để phản ánh quyết định đã xác nhận/trạng thái triển khai, giữ lịch dự kiến 40 phút; README.md liên kết contract/plan/history/bàn giao. Bổ sung điểm tích hợp CSRF/reuse vào contract.
- Chưa tích hợp route auth/JWT/cookie/Origin/CSRF/CORS, bảo vệ resource hoặc UI; thuộc phần B/C. SMTP và Turnstile thật chưa chạy. API đang giữ hành vi snapshot Block 7 đến khi B tích hợp.

## 13/11/2026, 10:19 (Asia/Saigon) — Chốt bản bàn giao Role A

- Kiểm tra cuối: 10 file source API kế thừa Block 7 khớp hash, không sửa resource/app/router cũ. Lockfile giữ nguyên các package đã có, chỉ thêm bcryptjs 3.0.3, nodemailer 10.3.1 và @types/nodemailer 8.0.2 theo source Block 8.
- Kế hoạch vẫn có đủ 8 giai đoạn tổng 40 phút; các link tài liệu nội bộ đã kiểm tra tồn tại.
- Đã dừng PostgreSQL thử nghiệm sau kiểm chứng; dữ liệu thử nghiệm ở .local được gitignore. Không để server thử nghiệm tiếp tục chạy.
- Tầng dữ liệu/service Role A đã sẵn sàng cho B tích hợp. Bằng chứng cuối: Prisma validate/generate pass, build pass, npm test 25/25, test:auth:db 29/29 không skip. Những phần B/C và dịch vụ thật chưa thực hiện được liệt kê trong ROLE_A_HANDOFF.md.

## 13/11/2026 — Commit Thuyet và hợp nhất main

- Người dùng yêu cầu commit lên Thuyet và merge main. Kiểm tra thấy code Role A đã được commit/push sẵn trong `1d0604a` (Thuyet), working tree sạch; không tạo commit code trùng.
- Fetch origin phát hiện `origin/main` có commit B `44f41d6`, hai nhánh lệch nhau một commit. Merge origin/main vào Thuyet để giải quyết trước khi cập nhật main.
- Có 68 xung đột add/add do hai bên tạo BAI1 độc lập. Giữ baseline/schema/migration/search/web đầy đủ của A; ghép app/JWT/route/middleware/env B; giữ endpoint specialties của baseline. Không sửa nguồn Block 7/8.
- Hợp nhất package: giữ bcryptjs/Nodemailer/type của A, thêm jose 6.2.17 của B. Đồng bộ DTO login/OTP, alias token helper và fixture API có token viewer; CORS test theo headers auth mới.
- Bản merge qua TypeScript build và 49/49 test tổng hợp (API/search/catalog + unit A + boundary auth B), không skip. Không chạy lại PostgreSQL vì schema/service DB không đổi về nghiệp vụ; 29 test PostgreSQL trước merge vẫn là bằng chứng riêng của A.
- Cập nhật verifier snapshot cho auth schema/docs, cache và CRLF; đồng bộ hai file reference README/schema về source Block 8 hiện có. Manifest xác nhận không còn sai lệch ngoài phạm vi được ghi nhận.
- Ghi rõ trong tài liệu A/B: factory service A và port B chưa được nối qua adapter production; app vẫn fail closed 503 cho service chưa nối. Không tự nhận việc merge đã hoàn thành tích hợp auth end-to-end.

### Kết quả publish Git

- Đã tạo merge commit `e574167` trên Thuyet sau khi giải quyết xung đột và kiểm chứng 49/49 test, build, verifier snapshot.
- Đã push origin/Thuyet từ `1d0604a` lên `e574167`.
- Đã cập nhật main local theo origin/main, fast-forward main tới Thuyet và push origin/main từ `44f41d6` lên `e574167` thành công; không force push và không viết lại commit cũ.
- Bản ghi kết quả này được commit bổ sung trên Thuyet và đồng bộ tiếp sang main. Adapter production A–B vẫn là việc tích hợp tiếp theo đã nêu trong tài liệu bàn giao.
