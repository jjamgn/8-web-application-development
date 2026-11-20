# Bàn giao thành viên B — MFA và session

> Cập nhật sau tích hợp: schema/migration/policy của A đã được ghép từ GitHub `main` tại commit `0b5f3f7042857b32ecd4ccbb2d318cb4e6614339`. `npm run db:generate`, `npm run build` và `npm test` (127/127) đã qua. Các ghi chú “chờ A” bên dưới mô tả trạng thái bàn giao ban đầu.

Phạm vi này dựa trên `block-09/BAI2_CONTRACT.md`, mục 3, 5–7. Source Bài 2 được sao chép từ `block-08` hiện tại; không sao chép `.env`, `node_modules`, cache hoặc minh chứng tạm. Chưa áp dụng migration và chưa chạm DB thật.

SHA nguồn GitHub chưa ghi vào README Bài 2 vì phiên làm việc này không truy cập được remote để xác minh commit mới nhất. Trước khi ba thành viên tạo nhánh, người tích hợp cần đối chiếu bản Block 8 trên `main` và bổ sung SHA đúng theo mục 1 của contract.

## Đã triển khai

- `src/auth/login.ts`: mật khẩu đúng của user đã bật MFA chỉ tạo session pending 5 phút, không có `session.userId`; SID được đổi sau bước mật khẩu và sau bước MFA. Pending được kiểm tra lại theo trạng thái account, email đã xác minh và `passwordVersion`.
- `src/auth/mfa.ts`: OTPAuth TOTP 6 số/30 giây, cửa sổ ±1 bước; mốc `mfaLastUsedStep` chống replay; mã dự phòng 128 bit, HMAC và dùng một lần; khóa sau 5 lần sai/15 phút; AES-256-GCM cho secret. Các thao tác tiêu thụ mã/cập nhật counter chạy trong Prisma transaction Serializable.
- `src/auth/mfa-routes.ts` và `src/auth/routes.ts`: xác minh đăng nhập, bật, thay, tắt MFA và cấp lại mã dự phòng. Bật/đổi/tắt MFA hoặc cấp lại mã đều thu hồi các full session khác của user, giữ phiên hiện tại. Toàn bộ POST quản lý tài khoản đi qua middleware CSRF/demo hiện có. QR và mã dự phòng dùng `Cache-Control: no-store` từ auth router.
- `.env.example`, `scripts/check-config.mjs`, `package.json`, `package-lock.json`: thêm và kiểm tra `MFA_ENCRYPTION_KEY`, `otpauth`, `qrcode`, type QR; test MFA mới.

## Điểm ghép thành viên A

Thành viên B không sửa schema, migration, `src/app.ts`, `src/auth/access.ts` theo ranh giới đã chốt. Để code B build/chạy đầy đủ, A cần:

1. Thêm đúng các field vào `User`: `mfaEnabled Boolean @default(false)`, `mfaSecretEncrypted String?`, `mfaLastUsedStep BigInt?`; và model `RecoveryCode` có `userId`, `codeHash` unique, `usedAt?`, `createdAt`, FK về `User` (cùng `id`), relation `User.recoveryCodes`. Chạy Prisma migration trước khi chạy app non-demo và `prisma generate`.
2. `loadCurrentUser` tiếp tục chỉ coi `session.userId` là full session. Trong session pending chỉ có `mfaPendingUserId`, `mfaPendingPasswordVersion`, `mfaPendingExpiresAt`; `/admin/*` với pending còn hạn phải 303 tới `/auth/mfa`, hết hạn tới `/auth/login`. Re-read user từ DB theo mỗi request. Không nâng pending thành quyền quản trị.
3. Sau xác minh MFA, user `editor` hoặc `admin` được redirect `/admin/dishes`; guard A cần cho editor vào đúng phạm vi quyền. A giữ mọi policy RBAC/ABAC ở `/admin`.
4. Luồng đổi/đặt lại mật khẩu giữ các cột MFA nguyên trạng. Việc tăng `passwordVersion` làm pending session cũ vô hiệu. Session DB có `userId = null` cho pending; `PrismaSessionStore` đã lưu expiry 5 phút qua `absoluteExpiresAt` nên không cần sửa store.

## Interface đã ghép với thành viên C

C đã tạo các EJS view sau. Route chỉ gửi các locals liệt kê dưới đây; form có hidden `_csrf` lấy từ `res.locals.csrf` như các form Block 8.

| View | Locals riêng | Form cần gửi |
| --- | --- | --- |
| `views/auth/mfa.ejs` | `error`, `method` | `POST /auth/mfa`: `method=totp|recovery`, `code`. |
| `views/auth/mfa-settings.ejs` | `error`, `mfaEnabled` | Khi chưa bật: `POST /auth/account/mfa/setup`. Khi đã bật: `POST /auth/account/mfa/recovery/regenerate`, `/replace`, `/disable`; ba form này gửi `currentPassword`, `method=totp|recovery`, `code`. |
| `views/auth/mfa-setup.ejs` | `error`, `mode=enable|replace`, `manualSecret`, `qrDataUrl`, `confirmPath` | `POST` tới `confirmPath` với `code` TOTP của secret mới. QR và mã nhập tay chỉ hiện trên trang này. |
| `views/auth/mfa-recovery-codes.ejs` | `codes: string[]` | Hiển thị/tải xuống thủ công đúng một lần; tải lại trang không trả lại codes. Không ghi mã vào log hoặc analytics. |

Các URL GET: `/auth/mfa`, `/auth/account/mfa`, `/auth/account/mfa/setup`, `/auth/account/mfa/replace`, `/auth/account/mfa/recovery-codes`. Thành công POST redirect 303; mã sai 400; khóa tạm 429 với `Retry-After`; thiếu full session 303 login; CSRF sai 403. C thêm link bảo mật hai bước trong profile.

## Cấu hình và kiểm tra

- `MFA_ENCRYPTION_KEY` là 32 byte base64 ngẫu nhiên, khác `SESSION_SECRET` và `AUTH_TOKEN_SECRET`, giữ ổn định giữa các lần khởi động. Tạo bằng lệnh ghi trong `.env.example`. Không commit giá trị thực.
- `npx tsx --test tests/mfa.test.ts`, test pending session trong `tests/login.test.ts` và test reset mật khẩu giữ MFA trong `tests/auth.test.ts` đã chạy bằng mock, không dùng DB thật. Sau khi ghép giao diện C, `npm test` chạy đủ 119 test với local loopback được phép, tất cả pass.
- `npm run build` với Prisma client sinh từ schema **tạm chỉ để type-check**, gồm các field/model mục 3 của contract, đã pass. Schema chính thức chưa có phần A nên build trực tiếp trên schema gốc sẽ báo thiếu `mfaEnabled`, `mfaLastUsedStep`, `mfaSecretEncrypted`, `recoveryCode`; đây là điểm chờ A, không phải lý do để B sửa schema.
- Chưa kiểm thử end-to-end bật/đổi/tắt MFA trên DB thật vì migration/guard A và tài khoản demo chưa có; EJS view C đã ghép. Sau khi tích hợp A, chạy migration trên DB cô lập trước, rồi DB thật theo contract; thử toàn bộ route bằng browser và chạy `npm run build`, `npm test` lần cuối.
