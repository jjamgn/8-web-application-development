# Kết quả kiểm chứng phần A — 27/11/2026

> **SNAPSHOT LỊCH SỬ:** báo cáo/bàn giao này giữ kết quả tại thời điểm lập. Trạng thái tích hợp và môi trường thật mới nhất xem [báo cáo chạy thật](../review-20261127/REVIEW.md) và [ma trận hiện hành](../README.md). Các câu “chưa chạy/chưa có môi trường thật” bên dưới không phải kết luận hiện tại.

**Kết quả tự động: 29/29 test đạt, 0 fail, 0 skip.** Prisma validate/generate 6.12.0 và TypeScript strict noEmit đạt. Lệnh tái hiện từ root repository:

```powershell
./block-11/api/scripts/role-a-verify.ps1
```

Môi trường kiểm chứng: Windows, Node 26.13.0, npm 11.20.0. Dependency thực tế khóa tại `api/tests/role-a-toolchain/package-lock.json`. Node hiện in cảnh báo deprecation module.register của tsx; không gây lỗi kiểm thử.

## Phạm vi đã kiểm tra

| Nhóm | Số test | Kết quả và giới hạn |
| --- | --- | --- |
| Migration SQL | 1 | Chạy migration đầy đủ trên PostgreSQL nhúng PGlite, thử unique email, FK owner, cascade variant/chunk, CHECK dimensions/offset/hash/count, rollback transaction. Không dùng Prisma engine kết nối server. |
| User/session repository | 2 | Email normalization, chọn field public; create/saveExisting/destroy và absolute expiry/no resurrection, dùng DB stub. |
| S3 adapter | 5 | ContentType/Length, giới hạn body, key, LIST nhiều trang/repeated-token, lỗi thiếu mảnh/timeout, versioning, config; SDK send được stub. |
| Chunk/service/media | 21 | Ranh giới 1 byte/1 MiB/1 MiB+1/2 MiB; WebP hợp lệ >1 MiB sinh bằng sharp; ghép byte/hash đúng và decode được; cleanup temp, ownership, rollback, journal, unknown commit, deferred delete, orphan sweep; Express/Supertest headers/cache/502/503/Range. Repository và object store là fake có fault injection. |

Trong nhóm media, request HTTP loopback thật chạy Express router A. Fixture WebP lớn là RGB ngẫu nhiên 1600×1600, các variant q80 rộng 320/960/1600; không dùng ảnh có dữ liệu người dùng. Test abort gọi AbortSignal đã hủy để kiểm tra dọn assembly; chưa thay cho ngắt socket giữa một lượt download live.

## Những kiểm chứng chưa thực hiện

- Docker Compose/SeaweedFS 4.55 thực tế, bucket private và S3 PUT/GET/HEAD/DELETE thực tế.
- Prisma repository với PostgreSQL server/DB Block 11 thật; chưa migrate deploy vào DB nhóm.
- Restart/recreate SeaweedFS và Express giữ ảnh; ngắt mạng thật, cleanup retry thực tế.
- Auth HTTP/session guard của B, upload parser/sharp validation của B, giao diện/Network responsive của C.

Máy kiểm chứng chưa có lệnh Docker/PostgreSQL CLI, chưa có endpoint/credential DB và SeaweedFS riêng cho Block 11. Không dùng DB/Storage của các block cũ. Vì vậy không đánh dấu toàn bộ E01–E20 đạt chỉ từ 29 test này.

Đã cung cấp script opt-in `api/scripts/role-a-storage-check.ts`, `api/tests/role-a/live-smoke.ts` và `api/scripts/role-a-cleanup.ts`; xem [bàn giao A](../../handoffs/A.md) để cấu hình/chạy và bổ sung bằng chứng live. Các script không tự seed/reset/migrate database.
