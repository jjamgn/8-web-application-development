# Block 11 — Photo Gallery: contract nhóm và phân công

> **Trạng thái: APPROVED — người dùng đã đồng ý baseline ngày 27/11/2026.**
> **Bản sửa SeaweedFS ngày 27/11/2026:** theo yêu cầu người dùng, SeaweedFS qua S3 API thay thế local filesystem làm kho ảnh chính thức. File local chỉ dùng tạm khi nhận/xử lý ảnh, không phải nguồn phục vụ media hoặc nơi lưu bền vững.
> **Bản sửa đăng nhập và phân mảnh ngày 27/11/2026:** upload yêu cầu đăng nhập, mỗi ảnh có chủ sở hữu; người xem không cần đăng nhập. Người dùng đã chọn chia mảnh khi lưu SeaweedFS; backend ghép mảnh thành WebP khi xem. Các quyết định cũ mâu thuẫn với bản sửa này được thay thế ở các mục dưới.
>
> Tài liệu này ghi các quyết định kỹ thuật, hợp đồng tích hợp, quyền sở hữu file và tiêu chí nghiệm thu cho **3 thành viên A/B/C**. Tên thực tế được nhóm điền khi nhận việc; không làm thay đổi phạm vi đã chốt.
>
> Nguồn yêu cầu: [slide Block 11](<./docs/Upload, xử lý, lưu trữ và.html>), đặc biệt slide 9, 11–16, 18, 22–24, 28–30 và 31–37. Đề bài là chuẩn cuối cùng; các lựa chọn triển khai của nhóm được ghi rõ bên dưới. Thay đổi baseline phải được thống nhất và cập nhật contract trước khi code.

**Bổ sung demo LAN — 27/11/2026, theo yêu cầu người dùng:** frontend có `npm run dev:lan` để listen `0.0.0.0:5173`; API và SeaweedFS giữ loopback. APP_ORIGIN trùng origin LAN, HTTP LAN dùng NODE_ENV development. Firewall chỉ cho Node.js nhận TCP 5173 từ LocalSubnet trên IP/adapter đã chọn. Không thay đổi API, schema, phân công A/B/C hoặc tiêu chí nghiệm thu. Cấu hình, khởi động và đổi IP: [LAN_SETUP.md](docs/LAN_SETUP.md).

## 1. Các quyết định đã chốt

| Mã | Hạng mục | Quyết định |
| --- | --- | --- |
| D01 | Sản phẩm | Photo Gallery độc lập, toàn bộ source và tài liệu trong `block-11/`; hoàn thành yêu cầu cốt lõi và bằng chứng nghiệm thu. |
| D02 | Nền code | Tham chiếu cấu trúc API/web, envelope JSON và kinh nghiệm tích hợp Block 6–7. Tạo bộ khung tối giản; không sao chép toàn bộ Restaurant App, schema hoặc migration nghiệp vụ cũ. Không sửa source block khác. |
| D03 | Backend | Node.js, Express 5, TypeScript, Zod, Prisma **6.12.0**, PostgreSQL. |
| D04 | Frontend | React 19, Vite 7, React Router 7, TypeScript; CSR gọi API JSON. |
| D05 | Package | Dùng npm, commit `package-lock.json` riêng cho API/web. Khóa phiên bản thực tế khi dựng bộ khung; ghi phiên bản Node đã kiểm chứng trong README. Không tự nâng major đã chốt. |
| D06 | Upload và ảnh | `busboy` nhận multipart dạng stream; `sharp` kiểm tra/chuẩn hóa/sinh WebP. |
| D07 | Database | Database riêng cho Block 11; có thể dùng PostgreSQL trên Supabase. Schema và migration riêng; không chạy migration/seed/reset vào DB Restaurant App. |
| D08 | Storage | SeaweedFS object storage qua S3 API; backend dùng `@aws-sdk/client-s3` v3, bucket riêng có xác thực. Không có local storage adapter/fallback cho ảnh công bố. SeaweedFS là dịch vụ, không phải thư viện upload Node.js. |
| D09 | Quyền | Xem gallery/detail/media công khai; upload cần đăng nhập, lưu uploaderId từ session. Chỉ chủ ảnh được xóa. Dùng express-session + PostgreSQL session store, bcryptjs; không JWT/RBAC/MFA. |
| D10 | Phạm vi giao diện | Đăng ký/đăng nhập/đăng xuất, danh sách, upload, chi tiết và xác nhận xóa; phân trang 12 ảnh/trang, mới nhất trước. Không thêm album, tag, tìm kiếm hoặc sửa mô tả sau upload. |
| D11 | Variant | WebP quality 80, giữ tỉ lệ/alpha, không phóng lớn, tối đa ba chiều rộng khác nhau; loại EXIF/GPS. Không giữ bản gốc. |
| D12 | Lỗi | Lỗi cấu trúc/toàn request không công bố ảnh nào; lỗi từng file giữ kết quả các file hợp lệ. Mỗi ảnh có transaction và rollback riêng. |
| D13 | Triển khai | Dev dùng Vite proxy `/api`, `/media`; production Express phục vụ React build, API và media cùng origin. |
| D14 | Ngoài phạm vi | Bonus crop/xoay/lật/khôi phục, lưu bản gốc, version chỉnh sửa, MinIO và triển khai CDN. SeaweedFS đã là thành phần bắt buộc. Muốn bổ sung phải sửa contract trước. |
| D15 | Kiểm chứng | Backend dùng `tsx --test` + Supertest; trình duyệt dùng Playwright. Nghiệm thu dùng DB và SeaweedFS thật; mock chỉ phục vụ kiểm thử có kiểm soát. |
| D16 | Phân mảnh | Mỗi variant WebP được cắt nhị phân thành các object tối đa 1 MiB trên SeaweedFS; DB giữ manifest thứ tự/kích thước/SHA-256. Backend ghép và kiểm tra trước khi trả WebP hoàn chỉnh. Không chia upload từ browser và không lưu thêm object WebP đầy đủ. |
| D17 | Tài khoản | Đăng ký/đăng nhập/đăng xuất/me/CSRF tối thiểu, session DB thời hạn tuyệt đối 2 giờ. Công khai id/tên người đăng ảnh, không công khai email. Không thêm OTP email, reset password hoặc quản trị tài khoản trong bản sửa này. |

**Đối chiếu đề:** slide 21 nêu SeaweedFS là tùy chọn, còn slide 32 dùng local filesystem ở bài cốt lõi. Nhóm chủ động chọn nhánh SeaweedFS theo yêu cầu người dùng; nghiệm thu tính bền vững được chuyển sang object storage. Đây là thay đổi phương án lưu trữ của nhóm, không khẳng định đề bắt buộc SeaweedFS.

## 2. Cấu trúc dự án và cấu hình

```text
block-11/
  BLOCK11_CONTRACT.md
  README.md
  contracts/                 # DTO và mã lỗi dùng chung, không chứa code server
  api/
    prisma/                  # schema và migration riêng
    src/
      app.ts
      server.ts
      config/
      routes/photos.ts
      routes/media.ts
      auth/                  # register/login/logout, session, CSRF, guard
      upload/                # parser, staging, giới hạn request/file
      images/                # kiểm tra và sinh variant
      storage/               # SeaweedFS S3 adapter, cleanup
      repositories/
      services/photo-service.ts
    scripts/
    tests/
    .env.example
    package.json
    package-lock.json
  web/
    src/
    tests/
    package.json
    package-lock.json
  docs/
    evidence/
    handoffs/
  infra/seaweedfs/           # Compose, cấu hình mẫu, hướng dẫn vận hành
```

- `DATABASE_URL`: kết nối PostgreSQL của Block 11, chỉ ở server.
- `DIRECT_URL`: kết nối phục vụ migration nếu cấu hình Prisma/nhà cung cấp cần; không thêm biến không được dùng.
- `S3_ENDPOINT`: endpoint gateway SeaweedFS, ví dụ `http://127.0.0.1:8333` khi dev; HTTPS khi đi qua mạng không tin cậy.
- `S3_REGION`: mặc định `us-east-1`; `S3_BUCKET`: bucket riêng, ví dụ `block11-gallery`.
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: credential server-only; `S3_FORCE_PATH_STYLE=true` dùng cho SeaweedFS. Cấu hình `S3Client` endpoint/region/credentials/path-style rõ ràng.
- `UPLOAD_TMP_DIR`: thư mục tạm ngoài source cho upload, sharp và ghép WebP trước khi stream media; dọn sau hoàn tất/lỗi/ngắt kết nối. Xóa file tạm đã hết request không làm mất ảnh đã công bố. Bỏ biến `UPLOAD_ROOT` cũ.
- `SESSION_SECRET`: tối thiểu 32 bytes ngẫu nhiên, chỉ ở server; `APP_ORIGIN`: origin tin cậy để kiểm tra các request ghi (dev `http://localhost:5173` qua proxy, production origin HTTPS). `NODE_ENV` quyết định cookie Secure; `TRUST_PROXY_HOPS` mặc định 0, chỉ cấu hình theo proxy thực tế.
- `PORT`: cổng Express, mặc định 3000. Vite dev mặc định 5173.
- SeaweedFS có volume bền vững riêng cho dữ liệu và metadata của dịch vụ; Express không đọc/ghi trực tiếp volume đó. Không dùng ổ đĩa tạm của container làm kho bền vững.
- Bucket được tạo ở bước setup, bật xác thực và chặn truy cập ẩn danh; không public S3/Filer/Admin endpoint ra browser. Chỉ variant thuộc ảnh PUBLISHED được Express stream qua media route.
- Frontend dùng `/api/...` và `/media/...` tương đối; không hard-code đường dẫn máy thành viên. React deep link phải hoạt động khi reload ở production.
- Chỉ commit cấu hình mẫu, không commit `.env`, credential, file upload, nhật ký cleanup hay database dump chứa dữ liệu thật. README phải ghi rõ vị trí lưu bền vững và cách sao lưu DB cùng kho ảnh.

### 2.1. Triển khai SeaweedFS đã chốt

- A cung cấp Docker Compose tại `infra/seaweedfs/` dùng SeaweedFS `weed mini` (S3 gateway và các thành phần cần thiết), có persistent volume và cấu hình xác thực mẫu. Khóa tag/digest bản SeaweedFS đã kiểm chứng; không dùng `latest` làm cấu hình nộp.
- README ghi cách khởi động/dừng, tạo bucket, cấu hình credential, kiểm tra sẵn sàng và restart/recreate container giữ volume. Không dùng lệnh xóa volume trong quy trình restart.
- Backend sử dụng `PutObjectCommand`, `GetObjectCommand`, `HeadObjectCommand`, `DeleteObjectCommand`, `ListObjectsV2Command` và `HeadBucketCommand` từ `@aws-sdk/client-s3`; liệt kê phải xử lý phân trang. Dùng PutObject đơn cho từng mảnh với ContentLength biết trước. Đây là chia object ở tầng ứng dụng, khác multipart/form-data và S3 Multipart Upload; SeaweedFS tự chia chunk nội bộ không thay cho manifest của ứng dụng.
- Chốt bucket không bật versioning cho baseline để DeleteObject không chỉ tạo delete marker. Quy trình setup phải kiểm tra chính sách thực tế.
- Có timeout và retry hữu hạn; không tự chuyển sang lưu local khi SeaweedFS không sẵn sàng. Kiểm tra bucket/credential và PUT/GET/DELETE thực tế trước khi demo.

## 3. Multipart và quy tắc nhận request

### 3.0. Xác thực và nhận diện người upload

- Người dùng tự đăng ký bằng `name`, `email`, `password`, `confirmPassword`; name trim 1–120 ký tự, email trim/lowercase và unique, mật khẩu 8 ký tự trở lên và tối đa 72 bytes UTF-8, xác nhận phải khớp. Băm bằng bcryptjs cost 12 như block trước; không lưu/log plaintext.
- Dùng `express-session`, session lưu PostgreSQL qua Prisma store riêng trong `api/src/auth/`; có thể tham chiếu logic Block 8/9 nhưng không sao chép schema nghiệp vụ hoặc MFA. Session cookie `block11.sid`: HttpOnly, SameSite=Lax, Path=/, không Domain, Secure khi production HTTPS. `resave:false`, `saveUninitialized:false`, không MemoryStore trong nghiệm thu.
- Login regenerate session ID và CSRF token, lưu userId, hạn tuyệt đối 2 giờ; không rolling. Logout hủy DB session và xóa cookie. Reload `/me` đọc lại DB, không giữ credential trong localStorage/sessionStorage. Không trả passwordHash hoặc email trong DTO ảnh.
- Store kiểm tra expiry ở mỗi lần đọc, không gia hạn absolute expiry khi touch; request cũ không được tạo lại session đã bị logout. Auth JSON body tối đa 16 KiB, validate bằng Zod; session middleware không tạo cookie cho request media/gallery chỉ đọc.
- CSRF synchronizer token ngẫu nhiên lưu session, lấy qua `GET /api/auth/csrf`; mọi POST/DELETE yêu cầu `X-CSRF-Token` và Origin đúng APP_ORIGIN. Token login được xoay, frontend nhận token mới; response auth/CSRF là `Cache-Control: no-store`.
- Upload: requireSession → kiểm tra Origin/CSRF → busboy. Khách/session hết hạn trả 401 trước ghi staging/PUT; CSRF sai trả 403. Sau nhận multipart, kiểm tra lại session còn hạn/chưa logout trước khi bắt đầu công bố. File nào đã commit vẫn thuộc userId đã xác thực, không bị đổi chủ khi phiên hết hạn sau đó.
- `uploaderId` luôn lấy server-side từ session, truyền vào service công bố; không nhận từ metadata/header/query client. UserId giả trong payload bị từ chối theo quy tắc metadata.
- DELETE cũng cần session/CSRF và server so Photo.uploaderId ngay lúc đổi trạng thái; ảnh người khác trả 403, không sửa DB/object. UI ẩn nút chỉ hỗ trợ trải nghiệm, không thay guard.
- Login giới hạn 10 lần sai/IP/15 phút, register 10 request/IP/giờ; trả 429 kèm Retry-After khi vượt. Có thể dùng express-rate-limit, ghi rõ limiter trong tiến trình không thay DB session. Thông báo login sai chung `INVALID_CREDENTIALS`.

### 3.1. Payload cố định

`POST /api/photos` nhận `multipart/form-data` với:

| Trường | Quy ước |
| --- | --- |
| `photos` | 1–5 file, lặp cùng tên trường; thứ tự xuất hiện của file xác định `index` từ 0. |
| `metadata` | Đúng một text part chứa JSON array `{ title, alt }[]`; số phần tử bằng số file, phần tử thứ i mô tả file index i. Không phụ thuộc text part nằm trước hay sau file. |

- `title`: chuỗi bắt buộc, trim, 1–120 ký tự Unicode; `alt`: chuỗi bắt buộc, trim, 1–300 ký tự Unicode. Dùng cùng cách đếm Unicode code point ở hai phía, backend quyết định cuối cùng.
- Không nhận thêm tên trường, text part trùng, file part sai tên hoặc key metadata ngoài `title`, `alt`.
- Metadata sai JSON/cấu trúc, số lượng không khớp, title/alt không hợp lệ: lỗi toàn request.
- Frontend dùng `FormData` và không tự đặt `Content-Type`/boundary.
- Không dùng tên file client làm storage key; tên file không quyết định loại nội dung.

### 3.2. Giới hạn chính xác

| Giới hạn | Giá trị | Phạm vi lỗi |
| --- | --- | --- |
| Số file | 1–5 | Request |
| Mỗi file | Tối đa 10.485.760 bytes (10 MiB) | File |
| Toàn multipart body | Tối đa 57.671.680 bytes (55 MiB), tính cả text/boundary | Request, HTTP 413 |
| Metadata text | Tối đa 16.384 bytes (16 KiB) | Request |
| Số pixel | Tối đa 40.000.000, width × height | File |
| Định dạng | JPEG, PNG tĩnh | File; từ chối ảnh nhiều frame |

Các ngưỡng là **bao gồm giá trị bằng ngưỡng**; phải có test ngay tại ngưỡng và vượt ngưỡng. Không dựa duy nhất vào `Content-Length`: đếm bytes body thực nhận, kể cả truyền chunked. Có thể từ chối sớm nếu header đã vượt ngưỡng.

### 3.3. Hai giai đoạn bắt buộc

1. Nhận vào staging, kiểm tra tổng bytes, số file, tên trường, metadata, boundary và request hoàn chỉnh. Chờ hoàn tất các thao tác ghi staging trước khi chuyển bước.
2. Chỉ khi giai đoạn 1 thành công mới xử lý ảnh và công bố lần lượt theo index.

- File vượt 10 MiB: ngừng ghi file đó, đánh dấu lỗi, tiêu thụ/bỏ phần stream còn lại để nhận file tiếp theo; vẫn đếm vào tổng bytes. Không giải mã file bị cắt.
- Số file vượt 5, metadata sai, multipart lỗi hoặc tổng bytes vượt: không công bố ảnh nào, dọn staging của request. Request bị ngắt lúc nhận cũng không công bố ảnh.
- Không giữ toàn bộ multipart body trong memory. Không để cấu hình mặc định của thư viện biến lỗi riêng của file thành lỗi toàn request.
- Sau khi request đã hợp lệ, xử lý tuần tự từng ảnh; lỗi ảnh sau không hoàn tác ảnh trước đã thành công. Response trả một kết quả cho mỗi index.

## 4. Kiểm tra ảnh và sinh variant

Thứ tự xử lý một file:

1. Kiểm tra chữ ký JPEG/PNG; không tin extension hoặc MIME từ browser.
2. Đọc metadata kích thước và kiểm tra giới hạn pixel trước khi giải mã toàn bộ; cấu hình giới hạn decoder cùng ngưỡng.
3. Giải mã nghiêm ngặt; ảnh hỏng/thiếu bytes phải bị từ chối, kể cả chữ ký hợp lệ. Chỉ đọc metadata thành công chưa đủ để kết luận file hợp lệ.
4. Chuẩn hóa pixels theo EXIF orientation, gồm trường hợp cần lật.
5. Sinh WebP quality **80**, giữ tỉ lệ và alpha; không giữ EXIF/GPS trong đầu ra.
6. Đọc width/height/bytes thực tế của variant; chuyển sang service công bố. Xóa file upload tạm sau khi hoàn tất hoặc thất bại.

Với `W` là chiều rộng sau chuẩn hóa, các chiều rộng đầu ra là:

```text
unique(min(W, 320), min(W, 960), min(W, 1600))
```

| W | Variant |
| --- | --- |
| 200 | 200 |
| 800 | 320, 800 |
| 1200 | 320, 960, 1200 |
| 2400 | 320, 960, 1600 |

Không tạo biến thể trùng chiều rộng, không phóng lớn. Photo width/height là kích thước nguồn **sau chuẩn hóa**, còn PhotoVariant là kích thước file đầu ra thực tế. Không giữ bản gốc để phục hồi/chỉnh sửa trong baseline này.

## 5. Schema và hợp đồng lưu trữ

| Model | Trường và ràng buộc |
| --- | --- |
| `User` | `id` UUID, `name` varchar(120), `email` unique đã chuẩn hóa, `passwordHash`, `createdAt`. Không cung cấp xóa tài khoản trong baseline. |
| `Session` | `sid` khóa chính, `userId` FK nullable (phiên CSRF trước login), `data` JSON, `expiresAt`; index theo expiry/user. Store kiểm tra expiry tuyệt đối và destroy khi logout. |
| `Photo` | `id` UUID, `uploaderId` FK User NOT NULL (onDelete Restrict), `title` varchar(120), `alt` varchar(300), `width` Int, `height` Int, `status` enum `PUBLISHED`/`DELETING`, `createdAt`, `updatedAt`. Index status/createdAt/id và uploaderId. |
| `PhotoVariant` | `id` UUID, `photoId` FK, `width` Int, `height` Int, `mime` (`image/webp`), `bytes` Int của WebP đầy đủ, `sha256` hex 64 ký tự, `chunkSize` Int = 1.048.576, `chunkCount` Int, `storagePrefix` unique. Unique `(photoId, width)`; FK cascade khi xóa Photo sau khi dọn đủ mảnh. Không còn storageKey trỏ một WebP đầy đủ. |
| `PhotoChunk` | `id` UUID, `variantId` FK cascade, `partNumber` Int bắt đầu 1, `offset` Int bắt đầu 0, `bytes` Int, `sha256` hex 64 ký tự, `storageKey` unique. Unique `(variantId, partNumber)`; manifest thứ tự nằm trong DB. |
| `StorageCleanupTask` | `id` UUID, `storageKey` unique, `status` (`PENDING`, `DONE`), `attempts` Int mặc định 0, `lastErrorCode` nullable, `createdAt`, `updatedAt`. Nhật ký dọn object bền vững trong PostgreSQL, không phụ thuộc ổ đĩa Express hoặc SeaweedFS đang hoạt động. |

- Kích thước và bytes phải dương. Mỗi Photo công bố có 1–3 variant đầy đủ.
- DB không lưu binary ảnh hoặc đường dẫn tuyệt đối. Key mảnh theo dạng `photos/<photoId>/<width>/000001.part`, `000002.part`, ...; storagePrefix là `photos/<photoId>/<width>/`. Server sinh tất cả key; manifest không lấy từ browser.
- S3 adapter chỉ thao tác trong bucket cấu hình và đúng prefix/key mảnh của Block 11; từ chối traversal, URL/bucket tùy ý hoặc filename client. Temp path phải nằm trong UPLOAD_TMP_DIR.
- Response frontend chứa URL `/media/photos/<photoId>/<width>.webp`; không trả đường dẫn staging/root.
- Tạo migration riêng; kiểm thử trên DB cô lập trước khi áp dụng vào DB demo Block 11. Không dùng `db push` thay lịch sử migration chính thức.

### 5.1. Quy tắc chia mảnh và ghép lại

- Hoàn thành WebP trước rồi cắt byte liên tiếp, không cắt pixels/tile và không encode riêng từng mảnh. Mỗi mảnh là `application/octet-stream`, không phải ảnh WebP độc lập; không đặt đuôi `.webp` cho mảnh.
- Kích thước mảnh cố định **1 MiB = 1.048.576 bytes**; mảnh cuối nhỏ hơn hoặc bằng 1 MiB, không tạo mảnh rỗng. `chunkCount = ceil(variant.bytes / chunkSize)`. Ảnh nhỏ có một mảnh; ảnh lớn có nhiều mảnh, không ép chia ảnh nhỏ để tăng số request.
- `partNumber` liên tục 1..N; `offset = (partNumber - 1) * chunkSize`; tổng bytes mảnh bằng bytes variant. Lưu SHA-256 từng mảnh và SHA-256 WebP đầy đủ bằng node:crypto; không dùng S3 ETag thay SHA-256.
- Ví dụ variant 960 px có 2.500.000 bytes: `000001.part` 1.048.576 bytes, `000002.part` 1.048.576 bytes, `000003.part` 402.848 bytes. Browser vẫn gọi `/media/photos/<id>/960.webp`.
- Không lưu thêm WebP đầy đủ bền vững trong bucket hoặc Express. Sau PUT đủ mảnh, công bố Photo + Variant + Chunk manifest trong một transaction. PUT thiếu một mảnh thì cả ảnh không được công bố.
- Khi xem, backend lấy manifest theo partNumber, GET từng mảnh, kiểm tra bytes/hash, ghép vào file request-scoped tạm, kiểm tra tổng bytes/hash rồi mới gửi header thành công và stream WebP hoàn chỉnh. Không nạp toàn bộ variant vào RAM. Dọn file ghép sau gửi/lỗi/client ngắt; nó không là cache bền vững.
- Nếu thiếu/sai thứ tự/hash/kích thước mảnh: 502 `MEDIA_INTEGRITY_ERROR`, no-store; không trả ảnh một phần với cache dài hạn. SeaweedFS timeout vẫn là 503. Kiểm tra trước khi gửi header để không biến lỗi mảnh sau thành HTTP 200 đã cache.
- Baseline không hỗ trợ Range từng phần; có thể bỏ qua Range và trả 200 WebP đầy đủ, không quảng cáo Accept-Ranges. Browser không tự ghép, không nhận danh sách key mảnh.
- Phân mảnh tăng số PUT/GET và metadata; không tự giảm bandwidth. Tối ưu dữ liệu xem vẫn dựa WebP, variant, lazy loading và browser cache.

## 6. Công bố, rollback và cleanup

### 6.1. Công bố một ảnh

```text
Kiểm tra + sinh đủ variant tạm + tính manifest/hash mảnh
→ tạo photoId/key và ghi StorageCleanupTask PENDING cho mọi key mảnh dự kiến
→ PUT đủ mảnh vào bucket SeaweedFS
→ transaction tạo Photo (uploaderId), các PhotoVariant, PhotoChunk và đánh dấu task DONE
→ commit
→ trả thành công
```

- Media route chỉ cho truy cập variant được DB ghi nhận của ảnh PUBLISHED; object đã PUT nhưng chưa commit không được công bố, bucket không cho browser truy cập trực tiếp.
- Ghi task thành công trước PUT; DB không sẵn sàng thì không bắt đầu upload object. Nếu PUT thành công nhưng response bị mất, task vẫn giữ key để dọn khi kết quả không xác định.
- Lỗi sinh/PUT một variant: dọn toàn bộ object của ảnh đó, không tạo Photo/PhotoVariant. Task hoàn thành chỉ khi đã xác nhận dọn xong.
- DB thất bại sau PUT: xác minh trạng thái commit qua DB trước khi dọn; nếu không xác định được thì giữ task để retry, không xóa object có thể đã thuộc ảnh PUBLISHED. Transaction DB không tự hoàn tác object storage.
- Dọn không thành công: giữ StorageCleanupTask PENDING, tăng attempts và lưu mã lỗi đã lọc; không ghi credential/stack nhạy cảm. Cleanup kiểm tra tham chiếu PhotoChunk/Photo trước mỗi lần xóa. Việc task DONE khi công bố phải nằm cùng transaction tạo Photo/Variant/Chunk.
- A cung cấp `npm run storage:cleanup`. Lệnh thất bại rõ nếu không ghi được nhật ký hoặc không thể hoàn tất dọn; không báo đã sạch khi còn lỗi.
- Client mất kết nối sau commit không có nghĩa ảnh đã rollback. Frontend không tự retry upload, phải cho người dùng kiểm tra gallery trước khi gửi lại.

### 6.2. Xóa ảnh

1. Kiểm tra chủ sở hữu trong cùng thao tác DB đổi `DELETING`; list/detail/media mới không còn trả ảnh.
2. Gọi DeleteObject cho tất cả key mảnh của mọi variant; object không tồn tại được xem là đã dọn. Không coi timeout/quyền bị từ chối là đã xóa.
3. Chỉ sau khi dọn đủ mảnh mới xóa Photo và metadata variant/chunk.
4. Nếu dọn lỗi, giữ bản ghi DELETING và key để cleanup thử lại; DELETE trả 202.

DELETE lặp trên DELETING thử dọn lại; trên ID không còn tồn tại trả 404. Không xóa Photo trước rồi làm mất danh sách key khi SeaweedFS/network lỗi.

### 6.3. Phục hồi sau sự cố

- Cleanup xử lý Photo DELETING, StorageCleanupTask PENDING, file tạm cũ và object không còn được DB tham chiếu.
- Với file tạm/object mồ côi do sự cố, chỉ dọn khi quá **24 giờ** và không thuộc request đang hoạt động. Quét object qua ListObjectsV2 có phân trang trong bucket/prefix của Block 11, dùng LastModified, chạy bảo trì khi đã dừng nhận upload. Không quét/xóa bucket khác.
- Retry task PENDING cũng chạy khi không còn publisher đang hoạt động (chế độ bảo trì sau dừng upload), tránh dọn nhầm object đang PUT/chờ commit. Nếu triển khai worker online sau này phải bổ sung lease/lock và duyệt thay đổi trước.
- Với retry xóa/rollback có key xác định, kiểm tra DB trước khi xóa; không xóa variant của Photo PUBLISHED.
- Dừng đột ngột giữa PUT và commit phải phục hồi được qua task đã ghi trước PUT và kiểm kê object mồ côi; không giả định chỉ cần `finally` là đủ. File staging local cũ được dọn riêng, không dùng để phục hồi ảnh đã công bố.

## 7. API, DTO và HTTP status

### 7.1. Envelope và DTO

```ts
type ApiError = { code: string; message: string };
type VariantDto = {
  width: number; height: number; mime: 'image/webp';
  bytes: number; url: string;
};
type PhotoDto = {
  id: string; title: string; alt: string;
  uploader: { id: string; name: string };
  width: number; height: number; createdAt: string;
  variants: VariantDto[];
};
type UploadResult =
  | { index: number; ok: true; photo: PhotoDto }
  | { index: number; ok: false; error: ApiError };
```

Ngày giờ là ISO 8601 UTC; variants sắp chiều rộng tăng dần; upload results sắp index tăng dần. Không trả status DELETING như một PhotoDto công khai. Không đưa đường dẫn tuyệt đối, lỗi DB thô hoặc stack vào response.

```json
{
  "ok": true,
  "data": {
    "results": [
      { "index": 0, "ok": false, "error": { "code": "INVALID_IMAGE", "message": "Ảnh không hợp lệ." } }
    ],
    "succeeded": 0,
    "failed": 1
  }
}
```

Envelope `ok:true` của upload nghĩa request đã được xử lý và có kết quả từng file; không có nghĩa tất cả file thành công. Lỗi toàn request dùng `{ ok:false, error:{code,message} }`.

### 7.2. Endpoint

| Method/path | Kết quả |
| --- | --- |
| `GET /api/auth/csrf` | Public; tạo phiên pre-login nếu cần; 200 data `{csrfToken}`. No-store. |
| `POST /api/auth/register` | Origin + CSRF, JSON `{name,email,password,confirmPassword}`; 201 data `{user:{id,name}}`, không tự login. 400 validation, 409 `EMAIL_ALREADY_EXISTS`. |
| `POST /api/auth/login` | Origin + CSRF, JSON `{email,password}`; 200 data `{user:{id,name},csrfToken}` sau regenerate session/token; 401 `INVALID_CREDENTIALS` nếu sai. |
| `GET /api/auth/me` | 200 data `{user:{id,name}}` nếu session hợp lệ; 401 nếu khách/hết hạn. No-store. Không chặn việc xem ảnh khi me trả 401. |
| `POST /api/auth/logout` | Session + Origin + CSRF; destroy phiên DB, clear cookie, 204. |
| `POST /api/photos` | Session + Origin + CSRF trước parser; multipart mục 3. HTTP 200 khi xử lý xong kể cả mọi file bị từ chối. Data `{results,succeeded,failed}`. Server gán uploaderId. |
| `GET /api/photos?page=1` | HTTP 200, data `{items, page, pageSize:12, total, totalPages}`; chỉ PUBLISHED, `createdAt DESC, id DESC`. Page nguyên dương, mặc định 1; trang vượt cuối trả items rỗng. Không nhận pageSize tùy ý. |
| `GET /api/photos/:id` | HTTP 200, data là PhotoDto; sai UUID/không có/DELETING trả 404. |
| `DELETE /api/photos/:id` | Session + Origin + CSRF + đúng chủ ảnh; 204 khi dọn xong; 202 với `{ok:true,data:{id,status:"DELETING"}}` khi chờ dọn; không đúng chủ 403; sai UUID/không có 404. |
| `GET /media/photos/:photoId/:filename` | Public; filename `<width>.webp` khớp variant PUBLISHED; ghép mảnh theo manifest, kiểm tra rồi trả WebP hoàn chỉnh. Không expose key mảnh, directory listing hay tmp/cleanup. |

`totalPages = ceil(total / 12)`, bằng 0 khi không có ảnh; `page` vẫn bắt đầu từ 1. Query page sai trả 400. Endpoint `/api` không tồn tại phải trả JSON 404, không rơi vào React SPA fallback.

### 7.3. Mã lỗi

| Phạm vi | HTTP/code |
| --- | --- |
| Multipart thiếu/hỏng boundary, trường sai/trùng, metadata sai | 400 `INVALID_MULTIPART` hoặc `INVALID_METADATA` |
| Số file ngoài 1–5 | 400 `INVALID_FILE_COUNT` |
| Tổng body >55 MiB | 413 `REQUEST_TOO_LARGE` |
| Request không phải multipart | 415 `UNSUPPORTED_CONTENT_TYPE` |
| Query sai | 400 `INVALID_QUERY` |
| Ảnh/endpoint không tìm thấy | 404 `NOT_FOUND` |
| Lỗi hệ thống toàn request | 500 `INTERNAL_ERROR` |
| Thiếu/session hết hạn ở endpoint bảo vệ | 401 `AUTH_REQUIRED` |
| Login sai | 401 `INVALID_CREDENTIALS` |
| Origin/CSRF sai | 403 `CSRF_INVALID` |
| Xóa ảnh người khác | 403 `FORBIDDEN` |
| Rate limit register/login | 429 `RATE_LIMITED`, có Retry-After |
| Media mảnh thiếu/sai hash/manifest | 502 `MEDIA_INTEGRITY_ERROR`, no-store |
| Media: SeaweedFS timeout/không sẵn sàng | 503 `STORAGE_UNAVAILABLE`, no-store; không trả 404 giả. Mảnh bị thiếu là lỗi integrity 502; Photo/variant không tồn tại mới trả 404. |
| File >10 MiB | Kết quả file: `FILE_TOO_LARGE` |
| Không phải JPEG/PNG tĩnh | Kết quả file: `UNSUPPORTED_IMAGE_TYPE` |
| Pixel vượt giới hạn | Kết quả file: `PIXEL_LIMIT_EXCEEDED` |
| Ảnh hỏng/thiếu bytes | Kết quả file: `INVALID_IMAGE` |
| Lỗi sinh variant | Kết quả file: `IMAGE_PROCESSING_FAILED` |
| Lỗi storage/DB khi công bố | Kết quả file: `PHOTO_SAVE_FAILED` |

Không mang quy tắc HTTP 200 cho mọi lỗi nghiệp vụ của bài cũ sang các lỗi toàn request đã quy định ở đây. Không dùng 207 cho upload.

## 8. Media, cache và giao diện

- Luồng đọc công khai: browser → Express `/media/...` → DB Photo/Variant/Chunk manifest → GET các mảnh từ SeaweedFS → ghép/kiểm tra tại file tạm → stream WebP hoàn chỉnh. Không tải toàn bộ ảnh vào memory, không redirect URL bucket/presigned URL, không cache file bền vững. Hủy tác vụ upstream và dọn staging khi client ngắt.
- Luồng ghi: browser → session/Origin/CSRF guard → busboy → staging tạm → sharp → chia mảnh/hash → S3 PUT các mảnh → DB commit kèm uploaderId. Browser không giữ S3 credential, không upload thẳng bucket.
- Express vẫn chịu bandwidth gửi ảnh cho browser; SeaweedFS bổ sung chặng đọc object về Express, không tự tạo CDN hay giảm bandwidth truyền. WebP, srcset/sizes, lazy loading và HTTP cache tiếp tục là cơ chế giảm dữ liệu tải.
- Media thành công trả `Content-Type: image/webp` và `Cache-Control: public, max-age=31536000, immutable`. Response lỗi không được cache như ảnh thành công.
- URL variant bất biến; không ghi đè bằng nội dung khác. Xóa tại origin không thu hồi bản browser/cache đã tải; nghiệm thu việc chặn mới tại origin bằng request không dùng cache.
- Route React: `/photos`, `/photos/upload`, `/photos/:id`, `/register`, `/login`; `/` điều hướng về `/photos`. Xem ảnh không yêu cầu me/login thành công.
- Khách vào upload chuyển `/login?returnTo=/photos/upload`; chỉ cho returnTo nội bộ allowlist, không redirect URL tùy ý. Có đăng ký, login, logout và hiển thị user hiện tại; login/logout gọi API với CSRF, credentials same-origin qua Vite proxy. UI hiện uploader.name trên danh sách/chi tiết, không hiện email; chỉ chủ ảnh thấy nút xóa.
- Gallery: 1 cột dưới 600px, 2 cột từ 600 đến dưới 1024px, 3 cột từ 1024px; sizes phải phản ánh chiều rộng ô thực tế, kể cả padding/gap/max-width.
- Gallery có `srcset`, `sizes`, `width`, `height`, `loading="lazy"`, `alt`; srcset dùng width thực của variant. Chọn `src` dự phòng là variant gần mức 960 nhất, không mặc định luôn dùng lớn nhất.
- Trang chi tiết dùng srcset/sizes riêng theo vùng hiển thị; ảnh chính tải ưu tiên thay vì lazy. Width/height đúng tỉ lệ, CSS co giãn không kéo méo.
- Form preview và title/alt riêng cho từng file; cảnh báo giới hạn ở client nhưng backend vẫn kiểm tra đầy đủ. Giữ thứ tự preview/index, khóa submit khi đang gửi, không tự retry ảnh thành công.
- UI phân biệt đang gửi, thành công từng file, lỗi từng file và lỗi toàn request; thông báo xóa 202 là đã ẩn/chờ dọn, không báo đã dọn xong.
- Có xác nhận xóa; hủy không phát DELETE. Xử lý loading, gallery rỗng, lỗi tải và 404; label/input và thao tác bàn phím rõ ràng.

## 9. Phân công và quyền sở hữu file

| Người | Phạm vi chính và file sở hữu | Bàn giao |
| --- | --- | --- |
| **A — Database, storage và media** | `api/prisma/**`, `api/src/storage/**`, `api/src/repositories/**`, `api/src/services/photo-service.ts`, `api/src/routes/media.ts`, `infra/seaweedfs/**`, script cleanup và test tương ứng. | Schema User/Session/Photo/Variant/Chunk/CleanupTask và migration; repository user/session cho B; SeaweedFS Compose/S3 adapter; chia mảnh/hash/manifest/ghép media; công bố có uploaderId, xóa đúng chủ; rollback/retry và test storage. |
| **B — Multipart, xử lý ảnh và tích hợp API** | `api/src/auth/**`, `api/src/upload/**`, `api/src/images/**`, `api/src/routes/photos.ts`, `api/src/app.ts`, `api/src/server.ts`, `api/src/config/**`, package/lockfile/tsconfig backend, `.env.example`, `contracts/**`, test tương ứng. | Bộ khung API; register/login/logout/me/CSRF, bcrypt/session store và guard; staging/giới hạn; signature/decoder/orientation/WebP; truyền identity vào service A; status/envelope/env backend và test auth/upload. |
| **C — React và kiểm chứng trình duyệt** | `web/**`, Playwright, `README.md`, `docs/evidence/**`, hướng dẫn chạy/demo. | Form auth/session/CSRF và chuyển về upload sau login; gallery công khai, tên người đăng, xóa theo chủ; upload/preview, responsive images; bằng chứng auth/Network/DOM và tổng hợp nghiệm thu. |

- Tên thực tế: **A: __________; B: __________; C: __________**.
- Mỗi người sở hữu kiểm thử và bằng chứng phần mình; C tổng hợp, không chịu toàn bộ test thay A/B.
- A không sửa app.ts/package backend; yêu cầu B mount media router hoặc thêm script/dependency qua điểm ghép. C không tự đổi API/schema.
- B là người tích hợp `contracts/**`, app.ts và package backend. Thay interface phải thống nhất với A/C và cập nhật contract trước; không tự sửa contract để hợp thức hóa code khác baseline.
- Tài liệu bàn giao của mỗi người đặt tại `docs/handoffs/A.md`, `B.md`, `C.md`; người đó ghi phạm vi, cách chạy, kết quả test, điểm chưa hoàn thành và cấu hình cần thiết, không ghi bí mật.

## 10. Interface tích hợp A/B/C

DTO công khai ở mục 7 đặt trong `contracts/`; phần server nội bộ bên dưới do A/B triển khai đúng hình dạng. Các module dùng chung không được import code Prisma/filesystem/S3 client vào frontend.

```ts
type StagedVariant = {
  tempPath: string;
  width: number;
  height: number;
  mime: 'image/webp';
  bytes: number;
};
type PreparedPhoto = {
  title: string;
  alt: string;
  width: number;   // nguồn sau chuẩn hóa
  height: number;
  variants: StagedVariant[];
};

// B: kiểm tra và sinh file variant tạm; không ghi DB hoặc tự công bố.
prepareImage(input: {
  tempPath: string; title: string; alt: string;
}): Promise<PreparedPhoto>;

// A: nhận ownership variant tạm, chia/PUT mảnh, manifest + uploaderId, rollback.
publishPhoto(input: PreparedPhoto, actor: { userId: string }): Promise<PhotoDto>;
listPhotos(input: { page: number }): Promise<{
  items: PhotoDto[]; page: number; pageSize: 12;
  total: number; totalPages: number;
}>;
getPhoto(id: string): Promise<PhotoDto>;
deletePhoto(id: string, actor: { userId: string }): Promise<'DELETED' | 'DELETING'>;
cleanupStorage(): Promise<{
  deleted: number; pending: number; failed: number;
}>;
```

- Đây là chữ ký hợp đồng, không phải TypeScript executable nguyên khối. A/B chốt vị trí type nội bộ ở bước dựng nền; B giữ đồng bộ với contract.
- B sở hữu file upload tạm và dọn nó trong mọi nhánh. B dọn variant đã sinh nếu `prepareImage` thất bại. Sau khi gọi `publishPhoto`, A chịu trách nhiệm dọn variant tạm và object SeaweedFS khi cần.
- A sinh UUID/key mảnh và thực hiện chia/ghép/hash; B giao WebP đầy đủ tạm và identity lấy từ session. B không tạo key mảnh hoặc tự dùng Prisma trong route. publishPhoto/deletePhoto không nhận uploaderId từ payload client.
- A cung cấp user/session repository trong src/repositories; B gọi qua interface để register/login và implement session store trong src/auth, không sửa schema của A. DTO auth/CSRF và actor phải thống nhất trước khi chia nhánh.
- Service phát lỗi có code ổn định; route B chuyển thành status/envelope đúng mục 7, không parse chuỗi message để suy luận lỗi.
- Media router A đọc DB/kho qua module của A; B chỉ mount `/media`. DTO luôn có URL tương đối và variants sắp width tăng dần.
- C dùng DTO/error code đã chốt; backend fake/stub chỉ được dùng phát triển hoặc test riêng, không thay nghiệm thu thật.

## 11. Thứ tự phối hợp

1. **Dựng nền:** B tạo bộ khung API, config và DTO; C tạo bộ khung web/proxy; A xác nhận interface/schema. Ghi commit nền chung vào README trước khi tách nhánh triển khai.
2. **Làm độc lập:** A dựng SeaweedFS có volume/credential và xây DB/S3 adapter/service; B xây auth/session/CSRF và staging/decoder/variants; C làm auth và gallery UI theo DTO. Mỗi người làm nhánh `codex/block11-a`, `codex/block11-b`, `codex/block11-c` hoặc tên nhánh nhóm thống nhất.
3. **Ghép backend:** migration/repository A → auth/session/guard B → service chia mảnh A + parser/image B → routes/app B + ghép media A. Thử upload hỗn hợp và rollback trước khi ghép UI.
4. **Ghép frontend:** C nối API thật, kiểm tra proxy/media, kết quả từng file, responsive và xóa.
5. **Nghiệm thu:** chạy test, build, DB/SeaweedFS thật, restart backend và SeaweedFS, kiểm tra cleanup; thu đủ bằng chứng rồi cập nhật README/checklist.

Không commit `.env`, không seed/reset DB dùng chung để sửa lỗi tích hợp. Không chỉnh block cũ. Auth tối thiểu và chia mảnh là phạm vi bắt buộc của bản sửa; không tự thêm OTP/MFA/bonus ngoài phạm vi.

## 12. Checklist nghiệm thu và bằng chứng

Lưu bằng chứng tại `docs/evidence/` theo mã; có thể dùng ảnh/video, HTTP log đã lọc, kết quả SQL, báo cáo kiểm tra metadata hoặc danh sách key. Các hàng chỉ đánh dấu đạt sau khi kiểm tra; contract được duyệt không đồng nghĩa sản phẩm đã đạt.

| Mã | Tình huống và kết quả bắt buộc | Chủ trì | Bằng chứng |
| --- | --- | --- | --- |
| E01 | JPEG + PNG hợp lệ: đúng Photo/Variant, mỗi file có index và kết quả. | B + A | Multipart Network, response, SQL và danh sách key. |
| E02 | Trộn ảnh tốt, text đổi đuôi, ảnh thiếu bytes: chỉ ảnh tốt được công bố; không còn object/metadata của file bị từ chối sau dọn. | B | Fixtures, response, kiểm kê DB/kho. |
| E03 | File đúng 10 MiB được qua kiểm tra bytes; file >10 MiB bị từ chối riêng; file tốt đi kèm vẫn được lưu. Fixture bằng ngưỡng phải là ảnh hợp lệ. | B | Test sát ngưỡng, response và storage. |
| E04 | Body đúng 55 MiB không bị từ chối chỉ vì bytes; >55 MiB trả 413, không công bố ảnh; thử cả chunked/không Content-Length. Fixture ranh giới kiểm tra riêng với các điều kiện hợp lệ khác. | B | Test streaming và truy vấn trước/sau. |
| E05 | Không có file, file thứ sáu, metadata sai/trùng, multipart hỏng ở cuối: lỗi toàn request, không ảnh nào được công bố. | B | HTTP trực tiếp, DB và staging sau dọn. |
| E06 | Ảnh >40 triệu pixel bị từ chối trước decode toàn bộ; đúng ngưỡng không bị từ chối chỉ vì pixel. | B | Test decoder/fixture và response. |
| E07 | Ảnh EXIF orientation xoay/lật đúng; không còn EXIF/GPS; GPS fixture là giả lập. | B | So sánh ảnh, báo cáo metadata file đầu ra. |
| E08 | Ảnh nhỏ/vừa/lớn có variant đúng công thức, alpha giữ, không phóng lớn; WebP ghép lại khớp bytes/kích thước/hash và DB manifest. | B + A | GET/HEAD mảnh, GET media ghép và SQL. |
| E09 | Lỗi sinh/PUT variant, timeout SeaweedFS hoặc DB lỗi sau PUT: không Photo công bố dở; dọn object hoặc StorageCleanupTask retry hoàn tất, không xóa ảnh đã commit khi kết quả commit không rõ. | A + B | Fault injection, log đã lọc, key trước/sau cleanup. |
| E10 | Restart Express và restart/recreate SeaweedFS giữ volume: danh sách, chi tiết và URL media vẫn hoạt động, không cần upload/seed lại. Xóa staging đã hết request không làm mất ảnh công bố. | A + C | Trước/sau restart và kiểm tra HTTP/DB/kho thật. |
| E11 | Network/currentSrc cho thấy variant phù hợp; DOM có srcset/sizes/width/height/loading/alt; kiểm tra viewport/DPR và cache có kiểm soát. | C | Screenshot DOM/Network mobile và desktop. |
| E12 | GET media đúng MIME/cache; không đọc được tmp, key giả, traversal hoặc file chưa được công bố. | A | HTTP header, GET object qua S3, truy cập ẩn danh bucket bị chặn và kiểm thử media trực tiếp; storage outage trả 503 không cache. |
| E13 | Xóa: hủy không đổi; xác nhận 204 dọn đủ DB/object; SeaweedFS/network lỗi trả 202, ảnh bị ẩn; retry dọn xong, HEAD object xác nhận không còn. Request mới tới origin trả 404 sau ẩn. | A + C | DELETE/GET, SQL, danh sách key và cleanup report. |
| E14 | Phân trang 12, empty state, 404, reload deep link, lỗi upload và submit nhiều lần hoạt động đúng. | C | Playwright và ảnh/video demo. |
| E15 | Cleanup xử lý file tạm cũ, task PENDING và object mồ côi (ListObjectsV2 phân trang), rollback sau sự cố; không xóa ảnh PUBLISHED hoặc upload đang hoạt động. | A | Test thời gian/chế độ bảo trì và kiểm kê trước/sau. |
| E16 | API/web build đạt, backend test và Playwright đạt; cấu hình mẫu đủ dùng, không có credential thật. | A + B + C | Báo cáo lệnh và README tái hiện. |
| E17 | Khách xem list/detail/media không login; upload không session/hết hạn trả 401 trước staging/PUT. Register/login/logout/me, CSRF và session DB hoạt động qua restart. | B + C | HTTP, cookie đã che giá trị, SQL session, browser. |
| E18 | Upload lưu đúng uploaderId từ session; giả uploaderId không đổi chủ; tên người đăng hiện công khai, email/hash không lộ. Khách xóa 401, người khác 403; chủ ảnh xóa được. | A + B + C | Hai tài khoản, direct HTTP, DB/object trước/sau và UI. |
| E19 | Fixture WebP hợp lệ >1 MiB có nhiều mảnh. Unit test chunker với dữ liệu đúng 1 MiB có một mảnh, 1 MiB+1 có hai, không mảnh rỗng. Thứ tự/offset/bytes/hash đúng; ghép media bằng từng byte với WebP trước chia. | A | SQL manifest, danh sách/HEAD mảnh, SHA-256 và decode file ghép. |
| E20 | Thiếu/hỏng/đổi thứ tự manifest bị phát hiện 502 no-store; PUT lỗi giữa mảnh rollback đủ; xóa mọi mảnh; mất kết nối media dọn file ghép. Không có object WebP đầy đủ bền vững. | A + B | Fault injection và kiểm kê DB/SeaweedFS/tmp. |

### Các lệnh tối thiểu phải cung cấp

| Nơi chạy | Lệnh |
| --- | --- |
| `api/` | `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run dev`, `npm run build`, `npm test`, `npm run storage:check`, `npm run storage:cleanup` |
| `infra/seaweedfs/` | `docker compose up -d`, `docker compose stop`, `docker compose start` (giữ volume; README ghi chính xác file/env cần dùng) |
| `web/` | `npm ci`, `npm run dev`, `npm run build`, `npm run test:e2e` |

README phải phân biệt test fixture/mock với live integration, hướng dẫn production phục vụ React build và vị trí chạy browser test. Chưa chạy kiểm tra nào phải ghi rõ chưa chạy; không báo pass chỉ dựa trên build.

## 13. Điều kiện hoàn tất và thay đổi contract

- Hoàn tất khi E01–E20 có bằng chứng đạt, source chạy theo README trên môi trường đã cấu hình, không còn lỗi chặn yêu cầu cốt lõi.
- Cấu hình mẫu, migration, lockfile, hướng dẫn restart/cleanup và bàn giao A/B/C là một phần sản phẩm nộp.
- Không đưa chức năng ngoài phạm vi vào điều kiện hoàn thành baseline.
- Muốn đổi stack, schema, multipart, DTO, endpoint/status, giới hạn, quy tắc variant, ownership hoặc thêm bonus: ghi lý do, ảnh hưởng A/B/C và quyết định được nhóm duyệt vào nhật ký dưới đây trước khi triển khai.

| Ngày | Trạng thái | Nội dung |
| --- | --- | --- |
| 27/11/2026 | APPROVED (baseline ban đầu) | Người dùng đồng ý baseline; xuất contract cho 3 thành viên. Quyết định local filesystem ban đầu đã được thay bằng bản sửa SeaweedFS bên dưới. |
| 27/11/2026 | APPROVED (bản sửa auth + phân mảnh) | Theo yêu cầu người dùng, upload cần login và nhận diện uploader; xem công khai. Người dùng chọn chia variant thành mảnh khi lưu SeaweedFS. Cụ thể hóa session, owner-only delete, manifest/hash, ghép media, phân công và E17–E20. |
| 27/11/2026 | APPROVED (bản sửa SeaweedFS) | Theo yêu cầu người dùng, dùng SeaweedFS qua S3 API thay kho ảnh local; thêm S3 client/env, hạ tầng và volume, DB cleanup task, media streaming, nghiệm thu restart/outage/object cleanup; cập nhật trách nhiệm A/B/C. |

## 14. Tham chiếu

- [Slide Block 11](<./docs/Upload, xử lý, lưu trữ và.html>).
- [Contract Bài 1 Block 9](../block-09/BAI1_CONTRACT.md): tham chiếu cách phân quyền sở hữu file, interface và phân công.
- [Contract Bài 2 Block 9](../block-09/BAI2_CONTRACT.md): tham chiếu cấu trúc quyết định/nghiệm thu; không kế thừa nghiệp vụ SSR/MFA.
- [Tích hợp Block 6](../block-06/docs/FE_BE_INTEGRATION.md): kinh nghiệm kiểm chứng browser → API → DB thật và restart.
- [sharp constructor](https://sharp.pixelplumbing.com/api-constructor/), [image operations](https://sharp.pixelplumbing.com/api-operation/), [output](https://sharp.pixelplumbing.com/api-output/).
- [busboy](https://github.com/mscdex/busboy): multipart streaming, giới hạn và xử lý file stream.
- [SeaweedFS Quick Start](https://github.com/seaweedfs/seaweedfs/wiki/Quick-Start-with-weed-mini): S3 gateway, xác thực và volume bền vững; khóa phiên bản vì mặc định có thể thay đổi.
- [AWS SDK for JavaScript v3 — S3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/): thư viện client cho endpoint S3-compatible của SeaweedFS.
- [express-session](https://expressjs.com/en/resources/middleware/session/): session store, cookie và regenerate/destroy; tham chiếu cơ chế session DB của Block 8/9, không kế thừa MFA.
