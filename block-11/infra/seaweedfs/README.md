# SeaweedFS cho Block 11 — phần A

SeaweedFS chạy độc lập với Express. Image được khóa `chrislusf/seaweedfs:4.55`, dùng `weed mini`; gateway S3 ở localhost:8333. Chỉ port S3 được publish, không publish Filer/Master/Admin UI. Volume `block11-storage_seaweed-data` giữ dữ liệu qua restart/recreate. Phiên bản và câu lệnh theo [release 4.55](https://github.com/seaweedfs/seaweedfs/releases/tag/4.55) và [quick start](https://github.com/seaweedfs/seaweedfs/wiki/Quick-Start-with-weed-mini); Docker thực tế cần được nghiệm thu trên máy có Docker.

## Khởi động và cấu hình

Chạy tại thư mục này:

```powershell
Copy-Item .env.example .env
# Sửa .env: thay access key/secret mẫu bằng giá trị riêng, không commit.
docker compose up -d
docker compose ps
```

`S3_BUCKET` tạo bucket lúc khởi động; credential được nạp qua AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY của dịch vụ. Luôn cấu hình hai giá trị để không vào chế độ Allow All. File `.env` tại đây không phải `.env` của API; điền cùng credential/bucket trong cấu hình API theo bàn giao A.

API dùng endpoint `http://127.0.0.1:8333`, region `us-east-1`, path-style `true`. Tài khoản dịch vụ cần đọc/ghi/xóa/liệt kê trong bucket Block 11 và đọc cấu hình versioning; không đưa credential vào React. Baseline cần bucket chưa từng bật versioning: script storage check từ chối cả Enabled và Suspended. Dùng bucket mới nếu lịch sử versioning không phù hợp.

Sau khi DB Block 11 đã áp dụng migration, chạy script `api/scripts/role-a-storage-check.ts` theo hướng dẫn bàn giao. Script thật kiểm tra bucket/versioning, PUT/GET/HEAD một object probe, xác nhận truy cập ẩn danh bị chặn rồi xóa probe; key có journal trong DB nếu cần retry. Không coi `compose ps` là bằng chứng S3 hoạt động.

## Restart, bảo trì và sao lưu

```powershell
docker compose stop
docker compose start
# Có thể recreate service khi giữ cùng volume/project:
docker compose up -d --force-recreate
```

Không dùng `down -v`, xóa volume hoặc đổi project name trong bài kiểm tra restart. Nghiệm thu phải upload ảnh nhiều mảnh, ghi key/hash, restart Express và SeaweedFS, GET lại media và so hash. Test cả trường hợp xóa staging API sau khi request kết thúc.

Dừng tất cả API instance trước khi chạy cleanup `--maintenance`. Cleanup quét chỉ prefix `photos/` trong bucket cấu hình; nếu SeaweedFS lỗi, task DB và ảnh DELETING giữ nguyên để chạy lại. Không bật worker cleanup tự động khi publisher còn chạy.

Sao lưu PostgreSQL (Photo/Variant/Chunk/CleanupTask/User/Session) và toàn bộ volume SeaweedFS trong cửa sổ đã dừng ghi; ghi cùng mốc thời gian. Không chỉ sao lưu các bytes object mà bỏ metadata SeaweedFS. Phục hồi vào môi trường cô lập rồi thử GET media/hash trước khi cho ghi tiếp. Bí mật kết nối được lưu riêng khỏi bản source và bản dump chia sẻ.

Triển khai ngoài máy dev: đặt gateway sau mạng riêng/TLS, không expose UI nội bộ; cấu hình endpoint thực tế trong API. SeaweedFS không thay CDN; Express vẫn trả WebP đã ghép cho browser.
