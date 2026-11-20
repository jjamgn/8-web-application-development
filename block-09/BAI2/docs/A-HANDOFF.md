# Bài 2 — bàn giao người A

## Nguồn và phạm vi

Snapshot GitHub `main`: `7b61a0fa152fb679be60d9a3b4ae30126725ca9c`.
Block 8 local khác snapshot này; người dùng đã chọn dùng đúng GitHub main.
Nhánh làm việc: `codex/block09-a-data-access`. Không sửa Block 8 hoặc BAI1.

A bổ sung schema, migration, policy, route quản trị, validation, test và script demo.
MFA/login service và các EJS/CSS của B/C giữ từ snapshot nguồn. Các nút hiện tại
chưa ẩn theo policy; C phải hoàn thiện UI. Editor hiện đăng nhập về account theo
login nguồn; B cập nhật redirect editor và MFA khi tích hợp.

## Interface cho B/C

`src/auth/access.ts` export `requireFullSession`, `canRead`, `canCreate`,
`canEdit`, `canDelete`. Các policy nhận user DB; kind là `dishes|chefs|ingredients`.
`canEdit(user, kind, dish)` cần `dish.chefId` và `dish.status` với editor.
`res.locals.currentUser` gồm id, name, email, emailVerifiedAt, status, role,
chefId, passwordVersion; không có secret. `res.locals.admin` vẫn chỉ dành admin.
C có thể dùng `access.canCreate(kind)`, `access.canEdit(kind,item)`,
`access.canDelete(kind)` trong EJS. Admin form cần field `status=draft|published`.
Editor field chefId/status bị server ghi đè bằng chef DB và draft.

Pending fields của B: `mfaPendingUserId`, `mfaPendingPasswordVersion`,
`mfaPendingExpiresAt`; không có `userId` trong pending session. Contract mục 7
ghi “bốn field pending” nhưng mục 5 thực tế liệt kê ba field trên; A dùng đúng mục 5.
Guard bảo vệ cả `/admin` và `/auth/account`; pending hợp lệ redirect 303
`/auth/mfa`; hết hạn hoặc passwordVersion khác DB redirect `/auth/login`.
B vẫn phải triển khai các route MFA và quản lý pending/setup TTL trong session store.

Mutation đọc lại user trong transaction và khóa `User FOR UPDATE`; sửa món khóa
thêm `Dish FOR UPDATE` rồi đọc lại chef/status. Việc sửa recipe cùng transaction.
Ảnh chỉ upload sau session/CSRF/policy; race bị từ chối dọn ảnh vừa upload.
Không có mutation trên GET. Không nhận role từ body/query/session snapshot.

## Ma trận request/response

| Request | Viewer | Editor | Admin |
| --- | --- | --- | --- |
| GET `/admin/:kind` | 200 | 200 | 200 |
| GET `/admin/dishes/:id` (kể cả draft) | 200 | 200 | 200 |
| GET `/admin/dishes/new`, POST `/admin/dishes` | 403 | 200 / 303 (draft của mình) | 200 / 303 |
| GET edit, PATCH draft của mình | 403 | 200 / 303 | 200 / 303 |
| GET edit, PATCH draft chef khác hoặc published | 403 | 403 | 200 / 303 |
| GET delete, DELETE món | 403 | 403 | 200 / 303 |
| Tạo/sửa/xóa chef/ingredient | 403 | 403 | 200 form / 303 mutation |
| ID không tồn tại (session đầy đủ, CSRF hợp lệ) | 404 | 404 | 404 |
| CSRF sai | 403 | 403 | 403 |

Guest vào admin: 303 login. Public chỉ query published, giữ search/filter/available/
pagination; cả `/dishes/:id` và `/dish/:id` trả 404 cho draft. Input sai: 400.

## Migration và khôi phục

Migration bổ sung: `prisma/migrations/202611200001_bai2_access_mfa/migration.sql`.
Thêm User chef/MFA, Dish.status mặc định published, RecoveryCode và ràng buộc
role/chef/status. Không đổi Dish.chefId, tài khoản, ảnh hoặc món cũ.
Nếu DB có role khác viewer/admin hoặc editor chưa gắn chef, CHECK sẽ làm migration
rollback; cần xử lý có chủ đích, không tự đổi quyền tài khoản thật.

Chạy `npx tsx scripts/verify-access-db.ts` để tạo schema ngẫu nhiên cô lập, dựng DDL
Block 8 từ fixture sinh bằng Prisma tại SHA nguồn, áp dụng đúng SQL migration,
kiểm tra dữ liệu cũ, constraints và bốn race bằng PostgreSQL thật. Cuối script chỉ
drop schema ngẫu nhiên do script tạo. Không replay migration Block 8 trên schema
test vì một số migration cũ hardcode search_path public.

`npx tsx scripts/verify-access-db.ts --deploy` chỉ deploy thật sau khi kiểm tra cô lập
thành công. Dùng `prisma migrate deploy`, không `db push`. Trước deploy ghi counts
và digest dữ liệu cũ vào `migration-before.json`; sau deploy so sánh toàn bộ user,
món và đường dẫn ảnh cũ, ghi `migration-verification.json`. Không ghi nội dung
user/passwordHash/session/connection string vào báo cáo.

Trước triển khai, đường khôi phục được xác định: migration có BEGIN/COMMIT nên lỗi
trong SQL tự rollback toàn bộ. Nếu Prisma ghi failed migration, xác minh DB đã
rollback rồi dùng `prisma migrate resolve --rolled-back 202611200001_bai2_access_mfa`
trước deploy lại. Sau deploy thành công, ưu tiên migration sửa tiếp; không tự drop
cột/bảng vì sẽ mất MFA mới. Muốn rollback sau khi đã sử dụng cần backup DB đầy đủ,
dừng ứng dụng, lưu dữ liệu MFA mới, rồi migration ngược có kiểm soát hoặc restore
backup/PITR của nhà cung cấp. Báo cáo digest không thay thế backup/PITR.

## Dữ liệu demo và kiểm tra

`npm run demo:access` chỉ tạo 4 user, 2 chef, 3 món có tiền tố B9B2-DEMO-;
không đổi dữ liệu thật. Chạy lại giữ nguyên dữ liệu, báo lỗi nếu prefix xung đột.
Danh sách ID/email/role/chef/status lưu `docs/demo-access.json`. Password ngẫu nhiên
chỉ lưu `.env.demo` đã gitignore; không đưa file này vào minh chứng. Có thể đặt
`DEMO_ACCESS_PASSWORD` qua môi trường server khi chạy script. Không seed/reset DB thật.

`npm run build`, `npm test`, `npm run test:access` dùng fixture cô lập; cần loopback
HTTP cho Supertest. Test DB riêng ở script trên không chạy tự động trên DB demo.
Playwright toàn luồng MFA/UI do C thực hiện sau tích hợp B/C.

## Kết quả ngày 20/11/2026

- `npm run build`: đạt.
- `npm test`: 117/117 đạt, gồm 8 test policy/HTTP mới.
- Migration đã deploy bằng Prisma sau kiểm tra cô lập. Trước/sau đều 14 user,
  999 món, digest dữ liệu cũ và ảnh giống nhau; xem `migration-verification.json`.
- Sau đó đã thêm đúng 4 tài khoản demo, 2 chef, 3 món mới theo tiền tố;
  xem `demo-access.json`.
- 26 kiểm tra HTTP trên DB demo đạt; xem `demo-http-verification.json`.
  Các test ghi thành công/xóa và race chỉ chạy ở fixture/schema cô lập.
- Raw lock SQL dùng tên bảng kèm schema cấu hình để không phụ thuộc search_path
  của connection pool. Schema cô lập được dọn sau kiểm thử.
