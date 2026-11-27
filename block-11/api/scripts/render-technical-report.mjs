// Generate a self-contained Markdown report from the sanitized live collector and local test logs.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const work = '.runtime/technical-verification/';
const r = JSON.parse(await readFile(work + 'results.json', 'utf8'));
const backend = (await readFile(work + 'backend-tests.log', 'utf8')).replace(/\x1b\[[0-9;]*m/g, '');
const ui = (await readFile(work + 'ui-tests.log', 'utf8')).replace(/\x1b\[[0-9;]*m/g, '');
assert.match(backend, /pass\s+76/); assert.match(backend, /fail\s+0/); assert.match(ui, /47 passed/);
assert.ok(r.cleanup?.originalPhotoManifestUnchanged && r.cleanup?.originalUsersUnchanged && r.cleanup?.ownFixtureObjectsRemoved);
assert.ok(r.phases.restart?.apiActuallyRestarted && r.phases.restart?.sameMediaHash);
const version = execFileSync('git', ['-C', '../../.block11-review', 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const code = value => '`' + value + '`';
const fence = (value, language = 'json') => '\n```' + language + '\n' + (typeof value === 'string' ? value : JSON.stringify(value, null, 2)) + '\n```\n';
const table = (head, rows) => '\n| ' + head.join(' | ') + ' |\n| ' + head.map(() => '---').join(' | ') + ' |\n' + rows.map(row => '| ' + row.join(' | ') + ' |').join('\n') + '\n';
const [jpeg, png] = r.phases.database;
const f = r.phases.databaseFailure;
const sections = [];
sections.push('# Block 11 — Báo cáo kiểm chứng kỹ thuật\n');
sections.push('Bắt đầu lượt kiểm chứng: **' + new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(r.time)) + '** (Asia/Ho_Chi_Minh).');
sections.push('Mã lượt chạy: ' + code(r.runId) + '. Source ứng dụng: commit ' + code(version) + '. Node ' + code(process.version) + ', Windows, Prisma/PostgreSQL Supabase và SeaweedFS S3 đang chạy thật.');
sections.push('Báo cáo đối chiếu phần kỹ thuật của slide 35–37 và các lựa chọn auth/phân mảnh của nhóm. Dữ liệu HTTP, DB, object và hash bên dưới thuộc **cùng một lượt chạy**. Các fixture đã được dọn sau khi thu bằng chứng; UUID trong báo cáo là dấu vết lịch sử, không phải ảnh đang được giữ trong gallery.');
sections.push('## 1. Kết quả tóm tắt\n');
sections.push(table(['Kiểm tra', 'Kết quả quan sát'], [
  ['JPEG + PNG trong một request', 'HTTP 200; 2 thành công, 0 lỗi; uploaderId khớp tài khoản A'],
  ['DB và SeaweedFS', 'Có Photo/PhotoVariant/PhotoChunk, HEAD đúng bytes; từng mảnh và media ghép khớp SHA-256'],
  ['EXIF/GPS và alpha', 'JPEG Orientation 6: 600×1000 → 1000×600; WebP không EXIF; PNG giữ alpha'],
  ['File không hợp lệ', '1 file tốt + 4 file lỗi: 1 được lưu, 4 bị từ chối; 0 Photo của file lỗi; 0 object thừa'],
  ['Lỗi DB sau PUT', 'Object tồn tại trước commit; PostgreSQL trả P2003; không Photo; object rollback hết'],
  ['Restart Express thật', 'API thử cổng 3001 dừng/chạy lại: cùng URL 200, hash không đổi, phiên DB còn hợp lệ'],
  ['Phân quyền/xóa', 'Khách upload/xóa 401; B xóa ảnh A 403; A xóa 204; GET mới 404, DB/object hết'],
  ['Build và test', 'API/web build đạt; 76/76 backend; 47/47 UI'],
  ['Bảo toàn dữ liệu sẵn có', r.cleanup.originalPhotos + ' bản ghi Photo (gồm avatar), ' + r.cleanup.originalUsers + ' User giữ nguyên; không reset/migrate'],
]));
sections.push('**Phân biệt phạm vi:** HTTP/Supabase/SeaweedFS và fault sau PUT là kiểm chứng thật. Bộ backend/UI có DB/kho giả lập hoặc PostgreSQL nhúng cho một số ca; không dùng các test đó để khẳng định toàn bộ fault matrix đã chạy trên hạ tầng thật.');
sections.push('## 2. Fixture và response upload\n');
sections.push(table(['Fixture', 'Bytes', 'Đặc điểm'], [[code(r.fixtures.jpeg.name), r.fixtures.jpeg.bytes, 'JPEG có EXIF Orientation 6 và GPS giả'], [code(r.fixtures.png.name), r.fixtures.png.bytes, '1600×1200 RGBA; sinh bằng xorshift32, seed ' + code(r.fixtures.png.seed) + '; nhỏ hơn 10 MiB']]));
sections.push('JPEG SHA-256: ' + code(r.fixtures.jpeg.sha256) + '. PNG SHA-256: ' + code(r.fixtures.png.sha256) + '.');
sections.push('Request thật: ' + code('POST ' + r.origin + '/api/photos') + ', multipart/form-data, hai part ' + code('photos') + ' và một part ' + code('metadata') + ' chứa mảng title/alt. HTTP **200**. Tài khoản A: ' + code(r.phases.upload.userA) + '; B: ' + code(r.phases.upload.userB) + '. Không ghi cookie, token, password hoặc email đăng nhập.');
sections.push('Response từng file (trích các trường để đối chiếu; danh sách variant ở mục 3):');
sections.push(fence({ succeeded: r.phases.upload.response.succeeded, failed: r.phases.upload.response.failed, results: r.phases.upload.response.results.map(item => ({ index: item.index, ok: item.ok, photo: { id: item.photo.id, title: item.photo.title, width: item.photo.width, height: item.photo.height, uploader: item.photo.uploader } })) }));
sections.push('## 3. Đối chiếu DB, bucket và phân mảnh\n');
sections.push('Snapshot đọc trực tiếp bằng Prisma từ DB thật trước khi dọn:');
sections.push(table(['Photo.id', 'uploaderId', 'Nguồn sau chuẩn hóa', 'status'], r.phases.database.map(p => [code(p.id), code(p.uploaderId), p.width + '×' + p.height, p.status])));
sections.push(table(['Photo', 'Variant thực', 'MIME', 'Bytes', 'Số mảnh'], r.phases.database.flatMap(p => p.variants.map(v => [p.id === jpeg.id ? 'JPEG' : 'PNG', v.width + '×' + v.height, code(v.mime), v.bytes, v.chunkCount]))));
sections.push('Công thức variant được quan sát: JPEG nguồn chuẩn hóa rộng 1000 có 320/960/1000; PNG rộng 1600 có 320/960/1600. Không variant nào vượt chiều rộng nguồn.');
const largest = png.variants.at(-1);
sections.push('Variant PNG lớn nhất có **' + largest.bytes + ' bytes và ' + largest.chunkCount + ' mảnh**. Các key dưới đây đã được HEAD/GET thật, HEAD khớp bytes, SHA-256 từng mảnh khớp DB:');
sections.push(table(['Part', 'Offset', 'Bytes / HEAD', 'Storage key', 'SHA-256 mảnh'], largest.chunks.map(c => [c.partNumber, c.offset, c.bytes, code(c.storageKey), code(c.sha256)])));
sections.push('StoragePrefix trong PhotoVariant: ' + code(largest.storagePrefix) + '. ChunkSize: ' + largest.chunkSize + '. Key là tên object trong bucket, không phải đường dẫn tuyệt đối của ổ đĩa. Cả sáu variant đã được kiểm tra, không chỉ variant minh họa.');
sections.push(table(['Photo / width', 'Bytes ghép = DB', 'SHA-256 GET media = manifest'], r.phases.integrity.map(v => [(v.photoId === jpeg.id ? 'JPEG' : 'PNG') + ' / ' + v.width, v.bytes, code(v.actualSha256)])));
sections.push('Mỗi dòng đã assert: hash từng mảnh đúng → nối theo partNumber → tổng bytes đúng → hash toàn WebP đúng → GET qua HTTP có cùng hash. Listing bucket trước/sau upload không có key thừa ngoài manifest của các ảnh thành công.');
sections.push('### SQL đối chiếu tương đương\n');
sections.push('Các kết quả trên được lấy trực tiếp bằng Prisma; dưới đây là SQL tương đương để tái kiểm tra trên một lượt chạy mới. Fixture của lượt này đã xóa nên truy vấn hiện tại trả 0 dòng là đúng.');
const ids = r.phases.database.map(p => "'" + p.id + "'::uuid").join(', ');
sections.push(fence('SELECT id, "uploaderId", title, width, height, status\nFROM "Photo" WHERE id IN (' + ids + ');\n\nSELECT "photoId", width, height, mime, bytes, sha256, "chunkCount", "storagePrefix"\nFROM "PhotoVariant" WHERE "photoId" IN (' + ids + ')\nORDER BY "photoId", width;\n\nSELECT v."photoId", v.width, c."partNumber", c."offset", c.bytes, c.sha256, c."storageKey"\nFROM "PhotoChunk" c JOIN "PhotoVariant" v ON v.id = c."variantId"\nWHERE v."photoId" IN (' + ids + ') ORDER BY v."photoId", v.width, c."partNumber";', 'sql'));
sections.push('## 4. EXIF/GPS, alpha và HTTP media\n');
sections.push('Thông tin file JPEG đầu vào đọc bằng [inspect-image.mjs](../../api/scripts/inspect-image.mjs); GPS dưới đây là dữ liệu lớp học giả lập:');
sections.push(fence(r.fixtures.sourceExif));
sections.push(table(['Đầu ra', 'Kích thước', 'Còn EXIF', 'Có alpha'], r.phases.integrity.map(v => [(v.photoId === jpeg.id ? 'JPEG → WebP' : 'PNG → WebP'), v.width + '×' + v.height, v.hasExif ? 'Có' : 'Không', v.hasAlpha ? 'Có' : 'Không'])));
sections.push('File đầu ra không có EXIF, nên không còn GPS được nhúng trong EXIF của fixture. Tất cả variant PNG có kênh alpha; tất cả đầu ra decode thành WebP và đúng kích thước DB.');
sections.push('GET media công khai trả các header thực sau (đã quan sát trên cả sáu variant):');
sections.push(fence({ status: 200, 'Content-Type': r.phases.integrity[0].headers.contentType, 'Cache-Control': r.phases.integrity[0].headers.cacheControl, 'Content-Length': r.phases.integrity[0].headers.contentLength }, 'json'));
sections.push('## 5. File bị từ chối và giữ file tốt\n');
sections.push('Một request multipart thật có đúng 5 file. Response HTTP **200**, succeeded **1**, failed **4**:');
sections.push(table(['Index', 'File', 'Bytes', 'Kết quả riêng'], r.phases.rejected.fixtures.map((item, i) => [i, code(item.name), item.bytes, r.phases.rejected.response.results[i].ok ? 'Đã công bố: ' + code(r.phases.rejected.response.results[i].photo.id) : code(r.phases.rejected.response.results[i].error.code)])));
sections.push('Ảnh vượt bytes là JPEG hoàn chỉnh được thêm COM segment để đạt **10.485.761 bytes**. Ảnh vượt pixel có **8001×5000 = 40.005.000 pixel**. File truncated được cắt nửa bytes từ JPEG hợp lệ. Dùng HTTP trực tiếp vì UI có thể chặn file quá lớn trước khi gửi.');
sections.push('Sau request: **' + r.phases.rejected.rejectedRows + ' Photo** mang tiêu đề các file lỗi; có đúng **' + r.phases.rejected.publishedPhotoCountForA + ' Photo thành công** của A (2 lượt đầu + 1 file tốt lượt trộn). Key mới trong bucket khớp đúng manifest các ảnh thành công, **0 key thừa**.');
sections.push('Các ca đúng/vượt ngưỡng, tổng body 55 MiB/chunked, multipart sai và pixel trước decode được bao phủ thêm bởi 76 backend tests. Đó là kiểm thử có kiểm soát; không ghi rằng mọi ca ranh giới đã lặp trên cloud trong lượt này.');
sections.push('## 6. Lỗi DB thật sau khi ghi object\n');
sections.push('Không gây lỗi lên DB hoặc tài khoản người dùng thật. Collector tạo một PhotoService riêng dùng **PrismaRepository và SeaweedFS thật**, chỉ thay uploaderId của fixture ở bước commit thành UUID không tồn tại để PostgreSQL từ chối FK. Production API không bị thay code hay tắt DB. Đây là service-level fault injection, không phải request HTTP upload production bị làm hỏng.');
sections.push(fence({ photoId: f.photoId, allObjectsExistedBeforeCommit: f.allObjectsExistedBeforeCommit, databaseError: f.databaseError, serviceError: f.serviceError, photoRowsAfter: f.photoRowAfter, objectCountAfterRollback: f.remainingObjects, journalStatuses: f.journalStatuses }));
sections.push('Trình tự được xác nhận: PUT xong → HEAD thấy mọi key → commit thật trả **P2003** → transaction không tạo Photo → service trả PHOTO_SAVE_FAILED → DELETE các key thật → HEAD tất cả không còn → journal DONE.');
sections.push('Các key riêng của ca lỗi đã được dọn:');
sections.push(fence(f.keys));
sections.push('Không dùng lỗi giả để thay việc kiểm tra object: HEAD trước commit và sau rollback đều gọi SeaweedFS thật. Chưa kiểm chứng cloud outage/commit-unknown/cleanup-retry sau ngắt mạng trong lượt này.');
sections.push('## 7. Restart Express, dữ liệu và session\n');
sections.push('API chính đang chạy không khớp PID được ghi trước đó nên collector **không dừng tiến trình đó**. Để kiểm chứng an toàn, dùng hai tiến trình mới chạy đúng compiled server tại **127.0.0.1:3001**, cùng env/DB/bucket/session secret; dừng tiến trình thử thứ nhất rồi mở tiến trình thử thứ hai. Không upload/seed lại giữa hai lần. Tiến trình thử được dọn sau kiểm tra.');
sections.push(fence(r.phases.restart));
sections.push('Trước/sau restart: cùng photoId, cùng URL media, HTTP 200, SHA-256 không đổi; cookie hiện có đọc đúng session/user trong PostgreSQL. **Không restart SeaweedFS trong lượt này**; chưa kết luận đầy đủ phần restart/recreate SeaweedFS của E10.');
sections.push('## 8. Phân quyền và xóa\n');
sections.push(fence(r.phases.permissions));
sections.push('Uploader lấy từ phiên A, không từ metadata. Response tác giả chỉ có id/name/avatarUrl; không có email/passwordHash. A và B là hai tài khoản fixture khác nhau.');
sections.push(table(['Photo.id', 'A DELETE', 'GET detail mới', 'GET media mới', 'HEAD object còn'], r.phases.deleted.map(p => [code(p.photoId), p.deleteStatus, p.newDetailStatus, p.newMediaStatus, p.remainingObjects])));
sections.push('Các GET ở đây là request mới tới origin, không dựa vào ảnh còn trong browser cache. Sau xóa, truy vấn DB trực tiếp xác nhận:');
sections.push(fence(r.phases.postDeletionDB));
sections.push('Journal DONE được giữ như nhật ký; không đồng nghĩa còn Photo/Variant/Chunk hoặc object ảnh. Các ca Hủy xóa trong UI và cleanup chờ retry có kiểm thử tự động; lượt live này chứng minh nhánh xóa 204, chưa tạo outage để chứng minh 202.');
sections.push('## 9. Build/test và bảo toàn dữ liệu\n');
sections.push(fence('api/: npm run build → exit 0\nweb/: npm run build → exit 0\napi/: npm test → tests 76, pass 76, fail 0, skipped 0\nweb/: PLAYWRIGHT_PORT=5174 npm run test:e2e → 47 passed', 'text'));
sections.push('UI tests chạy Chrome, intercept API/media bằng fixtures; không thay thế Network của browser kết nối DB/kho thật. Các báo cáo lịch sử [upload/profile](compact-upload-profile/README.md) và [tác giả/download](author-download/README.md) có bằng chứng browser live bổ sung.');
sections.push(fence({ originalPhotoRecordsIncludingAvatars: r.cleanup.originalPhotos, afterPhotoRecordsIncludingAvatars: r.cleanup.afterPhotos, originalPhotoManifestUnchanged: r.cleanup.originalPhotoManifestUnchanged, originalUserRecords: r.cleanup.originalUsers, afterUserRecords: r.cleanup.afterUsers, originalUsersUnchanged: r.cleanup.originalUsersUnchanged, ownFixtureAccountsRemoved: r.cleanup.ownFixtureAccountsRemoved, ownFixtureObjectsRemoved: r.cleanup.ownFixtureObjectsRemoved, remainingNewObjectKeys: r.cleanup.remainingNewObjectKeys }));
sections.push('## 10. Tái hiện và phần còn cần trong video\n');
sections.push('Mở API/web/SeaweedFS theo [LAN_SETUP.md](../LAN_SETUP.md), dùng đúng DB/bucket Block 11. Collector có guard project, chỉ sửa fixture của chính lượt chạy. Cổng 3001 phải trống. Chạy tại thư mục API:');
sections.push(fence('$env:BLOCK11_TECH_VERIFY = \'1\'\n$env:BLOCK11_VERIFY_RESTART_API = \'1\'\nnode --import tsx scripts/technical-verification.mjs', 'powershell'));
sections.push('Source thu bằng chứng: [technical-verification.mjs](../../api/scripts/technical-verification.mjs). JSON và logs vận hành nằm local trong api/.runtime/technical-verification (ignored), không đưa credential vào báo cáo. Kết quả hiện tại đã được trích đầy đủ ở trên, không cần nộp thêm các log local để đọc báo cáo.');
sections.push('Cấu hình mẫu không chứa credential thật: [API .env.example](../../api/.env.example), [SeaweedFS .env.example](../../infra/seaweedfs/.env.example). Source/lockfile/migration và [README](../../README.md) là phần nộp kèm.');
sections.push('**Video cần bổ sung:** chụp Network multipart/response và GET media từ DevTools; DOM/currentSrc ở desktop/mobile, upload/EXIF, public/auth và Hủy/Xác nhận xóa. HTTP output trong báo cáo này không được gọi là ảnh chụp Network. Không tự ký đạt toàn bộ E01–E20; các giới hạn chưa kiểm chứng đã ghi ở mục 6–8.');
await writeFile('../docs/evidence/02-kiem-chung-ky-thuat.md', sections.join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n');
console.log('Created docs/evidence/02-kiem-chung-ky-thuat.md from verified live results.');
