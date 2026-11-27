# Block 11 — Báo cáo kiểm chứng kỹ thuật

Bắt đầu lượt kiểm chứng: **23:55:26 27/11/2026** (Asia/Ho_Chi_Minh).

Mã lượt chạy: `45856107-49ef-4c9f-982c-ed4d8594011e`. Source ứng dụng: commit `4b560f0`. Node `v26.13.0`, Windows, Prisma/PostgreSQL Supabase và SeaweedFS S3 đang chạy thật.

Báo cáo đối chiếu phần kỹ thuật của slide 35–37 và các lựa chọn auth/phân mảnh của nhóm. Dữ liệu HTTP, DB, object và hash bên dưới thuộc **cùng một lượt chạy**. Các fixture đã được dọn sau khi thu bằng chứng; UUID trong báo cáo là dấu vết lịch sử, không phải ảnh đang được giữ trong gallery.

## 1. Kết quả tóm tắt

| Kiểm tra | Kết quả quan sát |
| --- | --- |
| JPEG + PNG trong một request | HTTP 200; 2 thành công, 0 lỗi; uploaderId khớp tài khoản A |
| DB và SeaweedFS | Có Photo/PhotoVariant/PhotoChunk, HEAD đúng bytes; từng mảnh và media ghép khớp SHA-256 |
| EXIF/GPS và alpha | JPEG Orientation 6: 600×1000 → 1000×600; WebP không EXIF; PNG giữ alpha |
| File không hợp lệ | 1 file tốt + 4 file lỗi: 1 được lưu, 4 bị từ chối; 0 Photo của file lỗi; 0 object thừa |
| Lỗi DB sau PUT | Object tồn tại trước commit; PostgreSQL trả P2003; không Photo; object rollback hết |
| Restart Express thật | API thử cổng 3001 dừng/chạy lại: cùng URL 200, hash không đổi, phiên DB còn hợp lệ |
| Phân quyền/xóa | Khách upload/xóa 401; B xóa ảnh A 403; A xóa 204; GET mới 404, DB/object hết |
| Build và test | API/web build đạt; 76/76 backend; 47/47 UI |
| Bảo toàn dữ liệu sẵn có | 15 bản ghi Photo (gồm avatar), 9 User giữ nguyên; không reset/migrate |

**Phân biệt phạm vi:** HTTP/Supabase/SeaweedFS và fault sau PUT là kiểm chứng thật. Bộ backend/UI có DB/kho giả lập hoặc PostgreSQL nhúng cho một số ca; không dùng các test đó để khẳng định toàn bộ fault matrix đã chạy trên hạ tầng thật.

## 2. Fixture và response upload

| Fixture | Bytes | Đặc điểm |
| --- | --- | --- |
| `test-sideways-orientation6-gps.jpg` | 47405 | JPEG có EXIF Orientation 6 và GPS giả |
| `rgba-1600x1200.png` | 7694873 | 1600×1200 RGBA; sinh bằng xorshift32, seed `0x11b10c`; nhỏ hơn 10 MiB |

JPEG SHA-256: `3666a6b06e8b3370c982520ba9c41f53bc8c2a3b84b209035c53f17ec5fccb5e`. PNG SHA-256: `4765522c4b04ed33d166dc9921c86e148caaf82513f26880d37708ad55cacdb3`.

Request thật: `POST http://localhost:5173/api/photos`, multipart/form-data, hai part `photos` và một part `metadata` chứa mảng title/alt. HTTP **200**. Tài khoản A: `5fd183d9-d1fa-43b8-90e0-3bba137af5ed`; B: `b2a4b606-7e80-4077-8be3-49e0627e07bd`. Không ghi cookie, token, password hoặc email đăng nhập.

Response từng file (trích các trường để đối chiếu; danh sách variant ở mục 3):

```json
{
  "succeeded": 2,
  "failed": 0,
  "results": [
    {
      "index": 0,
      "ok": true,
      "photo": {
        "id": "0f0fa184-a480-4344-8c57-72f9345b043e",
        "title": "VERIFY JPEG EXIF 45856107-49ef-4c9f-982c-ed4d8594011e",
        "width": 1000,
        "height": 600,
        "uploader": {
          "id": "5fd183d9-d1fa-43b8-90e0-3bba137af5ed",
          "name": "TECH_VERIFY_A",
          "avatarUrl": null
        }
      }
    },
    {
      "index": 1,
      "ok": true,
      "photo": {
        "id": "d0617cdb-8eaf-4a1c-846d-9c5da85935cf",
        "title": "VERIFY PNG ALPHA 45856107-49ef-4c9f-982c-ed4d8594011e",
        "width": 1600,
        "height": 1200,
        "uploader": {
          "id": "5fd183d9-d1fa-43b8-90e0-3bba137af5ed",
          "name": "TECH_VERIFY_A",
          "avatarUrl": null
        }
      }
    }
  ]
}
```

## 3. Đối chiếu DB, bucket và phân mảnh

Snapshot đọc trực tiếp bằng Prisma từ DB thật trước khi dọn:

| Photo.id | uploaderId | Nguồn sau chuẩn hóa | status |
| --- | --- | --- | --- |
| `0f0fa184-a480-4344-8c57-72f9345b043e` | `5fd183d9-d1fa-43b8-90e0-3bba137af5ed` | 1000×600 | PUBLISHED |
| `d0617cdb-8eaf-4a1c-846d-9c5da85935cf` | `5fd183d9-d1fa-43b8-90e0-3bba137af5ed` | 1600×1200 | PUBLISHED |

| Photo | Variant thực | MIME | Bytes | Số mảnh |
| --- | --- | --- | --- | --- |
| JPEG | 320×192 | `image/webp` | 3214 | 1 |
| JPEG | 960×576 | `image/webp` | 9348 | 1 |
| JPEG | 1000×600 | `image/webp` | 9848 | 1 |
| PNG | 320×240 | `image/webp` | 79120 | 1 |
| PNG | 960×720 | `image/webp` | 1028766 | 1 |
| PNG | 1600×1200 | `image/webp` | 3258290 | 4 |

Công thức variant được quan sát: JPEG nguồn chuẩn hóa rộng 1000 có 320/960/1000; PNG rộng 1600 có 320/960/1600. Không variant nào vượt chiều rộng nguồn.

Variant PNG lớn nhất có **3258290 bytes và 4 mảnh**. Các key dưới đây đã được HEAD/GET thật, HEAD khớp bytes, SHA-256 từng mảnh khớp DB:

| Part | Offset | Bytes / HEAD | Storage key | SHA-256 mảnh |
| --- | --- | --- | --- | --- |
| 1 | 0 | 1048576 | `photos/d0617cdb-8eaf-4a1c-846d-9c5da85935cf/1600/000001.part` | `78fd172643ddc3741b60e244ddd8f4f8c0f04895884fca4962a05aaeb05044b6` |
| 2 | 1048576 | 1048576 | `photos/d0617cdb-8eaf-4a1c-846d-9c5da85935cf/1600/000002.part` | `495801693ec652da671d9ef6271611b6b2ef2519a23ed1132ea23ac57de9120e` |
| 3 | 2097152 | 1048576 | `photos/d0617cdb-8eaf-4a1c-846d-9c5da85935cf/1600/000003.part` | `adb41b6f4097b7e286c169c657d0df6fc234e242bc3f793468811eee4a5eafa0` |
| 4 | 3145728 | 112562 | `photos/d0617cdb-8eaf-4a1c-846d-9c5da85935cf/1600/000004.part` | `bb00fb541be60327b1090d76faa7f9592e0978b81a788b0b25c65143262e4e5b` |

StoragePrefix trong PhotoVariant: `photos/d0617cdb-8eaf-4a1c-846d-9c5da85935cf/1600/`. ChunkSize: 1048576. Key là tên object trong bucket, không phải đường dẫn tuyệt đối của ổ đĩa. Cả sáu variant đã được kiểm tra, không chỉ variant minh họa.

| Photo / width | Bytes ghép = DB | SHA-256 GET media = manifest |
| --- | --- | --- |
| JPEG / 320 | 3214 | `7b26d42c5124a82b178224e22909dc74261fb29645e91ad81337796322fa8be5` |
| JPEG / 960 | 9348 | `d7074df7326ad2fabb93847137427b61f8cc1140a8b89307b13a8776f177e9d4` |
| JPEG / 1000 | 9848 | `04beb113fc7145010e1c347ac3a4ebf3582df86589525684edbddc4345b12ea0` |
| PNG / 320 | 79120 | `9451b12fc214e0df851e84672eaf29296291a64e7f80e421f13941b0c12ff717` |
| PNG / 960 | 1028766 | `3e7a82d7828a75a7282a987fdfff036d1d1e9f048511e92f6f301b11c0dcec81` |
| PNG / 1600 | 3258290 | `8f34b788bdcb37fef1abb9810175542d00bad46da07ad344c2d643e978b0f16e` |

Mỗi dòng đã assert: hash từng mảnh đúng → nối theo partNumber → tổng bytes đúng → hash toàn WebP đúng → GET qua HTTP có cùng hash. Listing bucket trước/sau upload không có key thừa ngoài manifest của các ảnh thành công.

### SQL đối chiếu tương đương

Các kết quả trên được lấy trực tiếp bằng Prisma; dưới đây là SQL tương đương để tái kiểm tra trên một lượt chạy mới. Fixture của lượt này đã xóa nên truy vấn hiện tại trả 0 dòng là đúng.

```sql
SELECT id, "uploaderId", title, width, height, status
FROM "Photo" WHERE id IN ('0f0fa184-a480-4344-8c57-72f9345b043e'::uuid, 'd0617cdb-8eaf-4a1c-846d-9c5da85935cf'::uuid);

SELECT "photoId", width, height, mime, bytes, sha256, "chunkCount", "storagePrefix"
FROM "PhotoVariant" WHERE "photoId" IN ('0f0fa184-a480-4344-8c57-72f9345b043e'::uuid, 'd0617cdb-8eaf-4a1c-846d-9c5da85935cf'::uuid)
ORDER BY "photoId", width;

SELECT v."photoId", v.width, c."partNumber", c."offset", c.bytes, c.sha256, c."storageKey"
FROM "PhotoChunk" c JOIN "PhotoVariant" v ON v.id = c."variantId"
WHERE v."photoId" IN ('0f0fa184-a480-4344-8c57-72f9345b043e'::uuid, 'd0617cdb-8eaf-4a1c-846d-9c5da85935cf'::uuid) ORDER BY v."photoId", v.width, c."partNumber";
```

## 4. EXIF/GPS, alpha và HTTP media

Thông tin file JPEG đầu vào đọc bằng [inspect-image.mjs](../../api/scripts/inspect-image.mjs); GPS dưới đây là dữ liệu lớp học giả lập:

```json
{
  "file": "test-sideways-orientation6-gps.jpg",
  "format": "jpeg",
  "storedPixels": "600x1000",
  "exifOrientation": 6,
  "displayAfterExif": "1000x600",
  "hasExif": true,
  "gps": {
    "latitudeDMS": [
      1,
      2,
      3
    ],
    "latitudeRef": "N",
    "longitudeDMS": [
      4,
      5,
      6
    ],
    "longitudeRef": "E",
    "altitudeMeters": 12
  }
}
```

| Đầu ra | Kích thước | Còn EXIF | Có alpha |
| --- | --- | --- | --- |
| JPEG → WebP | 320×192 | Không | Không |
| JPEG → WebP | 960×576 | Không | Không |
| JPEG → WebP | 1000×600 | Không | Không |
| PNG → WebP | 320×240 | Không | Có |
| PNG → WebP | 960×720 | Không | Có |
| PNG → WebP | 1600×1200 | Không | Có |

File đầu ra không có EXIF, nên không còn GPS được nhúng trong EXIF của fixture. Tất cả variant PNG có kênh alpha; tất cả đầu ra decode thành WebP và đúng kích thước DB.

GET media công khai trả các header thực sau (đã quan sát trên cả sáu variant):

```json
{
  "status": 200,
  "Content-Type": "image/webp",
  "Cache-Control": "public, max-age=31536000, immutable",
  "Content-Length": "3214"
}
```

## 5. File bị từ chối và giữ file tốt

Một request multipart thật có đúng 5 file. Response HTTP **200**, succeeded **1**, failed **4**:

| Index | File | Bytes | Kết quả riêng |
| --- | --- | --- | --- |
| 0 | `good.jpg` | 47405 | Đã công bố: `377aa577-f5a5-44d6-b3b0-0317debe1837` |
| 1 | `fake.jpg` | 20 | `UNSUPPORTED_IMAGE_TYPE` |
| 2 | `truncated.jpg` | 23702 | `INVALID_IMAGE` |
| 3 | `over-10MiB.jpg` | 10485761 | `FILE_TOO_LARGE` |
| 4 | `over-40MP.jpg` | 235488 | `PIXEL_LIMIT_EXCEEDED` |

Ảnh vượt bytes là JPEG hoàn chỉnh được thêm COM segment để đạt **10.485.761 bytes**. Ảnh vượt pixel có **8001×5000 = 40.005.000 pixel**. File truncated được cắt nửa bytes từ JPEG hợp lệ. Dùng HTTP trực tiếp vì UI có thể chặn file quá lớn trước khi gửi.

Sau request: **0 Photo** mang tiêu đề các file lỗi; có đúng **3 Photo thành công** của A (2 lượt đầu + 1 file tốt lượt trộn). Key mới trong bucket khớp đúng manifest các ảnh thành công, **0 key thừa**.

Các ca đúng/vượt ngưỡng, tổng body 55 MiB/chunked, multipart sai và pixel trước decode được bao phủ thêm bởi 76 backend tests. Đó là kiểm thử có kiểm soát; không ghi rằng mọi ca ranh giới đã lặp trên cloud trong lượt này.

## 6. Lỗi DB thật sau khi ghi object

Không gây lỗi lên DB hoặc tài khoản người dùng thật. Collector tạo một PhotoService riêng dùng **PrismaRepository và SeaweedFS thật**, chỉ thay uploaderId của fixture ở bước commit thành UUID không tồn tại để PostgreSQL từ chối FK. Production API không bị thay code hay tắt DB. Đây là service-level fault injection, không phải request HTTP upload production bị làm hỏng.

```json
{
  "photoId": "482aa101-5036-4032-b10c-793380cdecdc",
  "allObjectsExistedBeforeCommit": true,
  "databaseError": "P2003",
  "serviceError": "PHOTO_SAVE_FAILED",
  "photoRowsAfter": 0,
  "objectCountAfterRollback": 0,
  "journalStatuses": [
    "DONE",
    "DONE",
    "DONE"
  ]
}
```

Trình tự được xác nhận: PUT xong → HEAD thấy mọi key → commit thật trả **P2003** → transaction không tạo Photo → service trả PHOTO_SAVE_FAILED → DELETE các key thật → HEAD tất cả không còn → journal DONE.

Các key riêng của ca lỗi đã được dọn:

```json
[
  "photos/482aa101-5036-4032-b10c-793380cdecdc/320/000001.part",
  "photos/482aa101-5036-4032-b10c-793380cdecdc/960/000001.part",
  "photos/482aa101-5036-4032-b10c-793380cdecdc/1000/000001.part"
]
```

Không dùng lỗi giả để thay việc kiểm tra object: HEAD trước commit và sau rollback đều gọi SeaweedFS thật. Chưa kiểm chứng cloud outage/commit-unknown/cleanup-retry sau ngắt mạng trong lượt này.

## 7. Restart Express, dữ liệu và session

API chính đang chạy không khớp PID được ghi trước đó nên collector **không dừng tiến trình đó**. Để kiểm chứng an toàn, dùng hai tiến trình mới chạy đúng compiled server tại **127.0.0.1:3001**, cùng env/DB/bucket/session secret; dừng tiến trình thử thứ nhất rồi mở tiến trình thử thứ hai. Không upload/seed lại giữa hai lần. Tiến trình thử được dọn sau kiểm tra.

```json
{
  "apiActuallyRestarted": true,
  "method": "Two fresh compiled API processes at port 3001, same configuration/DB/bucket; main API left running",
  "samePhotoId": "0f0fa184-a480-4344-8c57-72f9345b043e",
  "beforeDetailStatus": 200,
  "detailStatus": 200,
  "sameMediaUrl": "http://127.0.0.1:3001/media/photos/0f0fa184-a480-4344-8c57-72f9345b043e/320.webp",
  "beforeMediaStatus": 200,
  "mediaStatus": 200,
  "sameMediaHash": true,
  "sameSessionUser": true,
  "seaweedRestarted": false
}
```

Trước/sau restart: cùng photoId, cùng URL media, HTTP 200, SHA-256 không đổi; cookie hiện có đọc đúng session/user trong PostgreSQL. **Không restart SeaweedFS trong lượt này**; chưa kết luận đầy đủ phần restart/recreate SeaweedFS của E10.

## 8. Phân quyền và xóa

```json
{
  "publicDetail": 200,
  "guestUpload": 401,
  "guestDelete": 401,
  "otherUserDelete": 403,
  "uploaderIdMatchesSession": true,
  "exposedUploaderFields": [
    "avatarUrl",
    "id",
    "name"
  ]
}
```

Uploader lấy từ phiên A, không từ metadata. Response tác giả chỉ có id/name/avatarUrl; không có email/passwordHash. A và B là hai tài khoản fixture khác nhau.

| Photo.id | A DELETE | GET detail mới | GET media mới | HEAD object còn |
| --- | --- | --- | --- | --- |
| `0f0fa184-a480-4344-8c57-72f9345b043e` | 204 | 404 | 404 | 0 |
| `d0617cdb-8eaf-4a1c-846d-9c5da85935cf` | 204 | 404 | 404 | 0 |
| `377aa577-f5a5-44d6-b3b0-0317debe1837` | 204 | 404 | 404 | 0 |

Các GET ở đây là request mới tới origin, không dựa vào ảnh còn trong browser cache. Sau xóa, truy vấn DB trực tiếp xác nhận:

```json
{
  "photoRows": 0,
  "variantRows": 0,
  "chunkRows": 0,
  "journal": [
    {
      "status": "DONE",
      "count": 15
    }
  ],
  "note": "DONE cleanup journal retained; published fixture data and objects removed."
}
```

Journal DONE được giữ như nhật ký; không đồng nghĩa còn Photo/Variant/Chunk hoặc object ảnh. Các ca Hủy xóa trong UI và cleanup chờ retry có kiểm thử tự động; lượt live này chứng minh nhánh xóa 204, chưa tạo outage để chứng minh 202.

## 9. Build/test và bảo toàn dữ liệu

```text
api/: npm run build → exit 0
web/: npm run build → exit 0
api/: npm test → tests 76, pass 76, fail 0, skipped 0
web/: PLAYWRIGHT_PORT=5174 npm run test:e2e → 47 passed
```

UI tests chạy Chrome, intercept API/media bằng fixtures; không thay thế Network của browser kết nối DB/kho thật. Các báo cáo lịch sử [upload/profile](compact-upload-profile/README.md) và [tác giả/download](author-download/README.md) có bằng chứng browser live bổ sung.

```json
{
  "originalPhotoRecordsIncludingAvatars": 15,
  "afterPhotoRecordsIncludingAvatars": 15,
  "originalPhotoManifestUnchanged": true,
  "originalUserRecords": 9,
  "afterUserRecords": 9,
  "originalUsersUnchanged": true,
  "ownFixtureAccountsRemoved": true,
  "ownFixtureObjectsRemoved": true,
  "remainingNewObjectKeys": []
}
```

## 10. Tái hiện và phần còn cần trong video

Mở API/web/SeaweedFS theo [LAN_SETUP.md](../LAN_SETUP.md), dùng đúng DB/bucket Block 11. Collector có guard project, chỉ sửa fixture của chính lượt chạy. Cổng 3001 phải trống. Chạy tại thư mục API:

```powershell
$env:BLOCK11_TECH_VERIFY = '1'
$env:BLOCK11_VERIFY_RESTART_API = '1'
node --import tsx scripts/technical-verification.mjs
```

Source thu bằng chứng: [technical-verification.mjs](../../api/scripts/technical-verification.mjs). JSON và logs vận hành nằm local trong api/.runtime/technical-verification (ignored), không đưa credential vào báo cáo. Kết quả hiện tại đã được trích đầy đủ ở trên, không cần nộp thêm các log local để đọc báo cáo.

Cấu hình mẫu không chứa credential thật: [API .env.example](../../api/.env.example), [SeaweedFS .env.example](../../infra/seaweedfs/.env.example). Source/lockfile/migration và [README](../../README.md) là phần nộp kèm.

**Video cần bổ sung:** chụp Network multipart/response và GET media từ DevTools; DOM/currentSrc ở desktop/mobile, upload/EXIF, public/auth và Hủy/Xác nhận xóa. HTTP output trong báo cáo này không được gọi là ảnh chụp Network. Không tự ký đạt toàn bộ E01–E20; các giới hạn chưa kiểm chứng đã ghi ở mục 6–8.
