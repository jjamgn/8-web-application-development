# Block 06 — bằng chứng backend

Ngày kiểm tra: 23/10/2026. Phạm vi chỉ backend `api/`. Không sửa Block5, frontend, README chung hoặc tài liệu kiểm thử/trình bày của thành viên khác.

## Kết quả đã chạy

| Kiểm tra | Kết quả thực tế | Môi trường/bằng chứng |
|---|---|---|
| Cài thư viện riêng | Đạt, 129 package, có package-lock riêng | `npm install`, không chép node_modules Block5 |
| Tạo Prisma Client | Đạt, v6.12.0 | `npm run db:generate` |
| Kiểm tra TypeScript | Đạt, exit 0 | `npm run build` |
| HTTP contract | 12 nhóm test qua, 0 thất bại | `npm test`, `api/tests/api.test.ts`, Prisma stub |
| Đủ 15 endpoint | Đạt trong kiểm thử tự động | CRUD cả dishes/chefs/ingredients; đọc lại sau ghi và xóa |
| Tìm tên, mảng rỗng | Đạt với stub | `q` trim, không phân biệt hoa thường, giới hạn 160 ký tự, data rỗng là `[]` |
| Giá 0 và boolean false | Đạt với stub | POST/PATCH giữ 0/false; từ chối âm, số lẻ, null, chuỗi, giá thiếu |
| Partial PATCH/whitelist | Đạt với stub | Chỉ gửi name không đổi chef/ảnh/công thức; specialty không xóa bio; chặn nested write |
| ID và lỗi nghiệp vụ | Đạt với stub | ID sai/không có → HTTP 200 NOT_FOUND; input/trùng tên/FK → HTTP 200 VALIDATION_FAILED |
| Lỗi kỹ thuật | Đạt với stub | Endpoint sai 404, JSON hỏng 400, lỗi database có kiểm soát 500; JSON không lộ lỗi DB |
| CORS | Đạt với HTTP test | Origin localhost:5173, OPTIONS 204, PATCH/DELETE, Content-Type; response lỗi vẫn có header, origin khác không được cấp header |
| Backend không dùng SSR | Đạt với HTTP test | Không redirect/HTML, GET không ghi, URL SSR cũ trả 404 JSON |
| Dữ liệu tái sử dụng | Đạt đối chiếu hash | Schema, migration ban đầu, seed, data và 8 ảnh giống nguyên bản Block5 |
| Độc lập với source Block5 | Đạt kiểm tra source | Không import/path runtime tới Block5; API có package/config/schema/seed/ảnh riêng |

Output cuối của `npm test`:

```text
tests 12
pass 12
fail 0
cancelled 0
skipped 0
```

Các test stub phát triển từ tình huống và cách stub của Block5 `mutations.test.ts`; gọi HTTP qua Supertest, không có endpoint gây lỗi trong bản ứng dụng.

## Đọc từ Supabase thật

Đã dùng tạm cấu hình hiện có của Block5 trong tiến trình kiểm chứng chỉ đọc. Không sao chép `.env`, không lưu/in khóa, không thêm phụ thuộc Block5 vào mã bàn giao. Không chạy migration, seed hoặc mutation lên database này.

Kiểm tra Prisma count thật: **6 món, 3 đầu bếp, 10 nguyên liệu**. Số món thực tế khác 8 món trong seed mẫu; báo cáo này dùng kết quả đọc thật, không giả định seed đã được chạy đầy đủ.

Sáu endpoint đọc của app API mới đều trả JSON thật từ database:

| Request | Status | Kết quả |
|---|---|---|
| GET `/api/dishes` | 200 | `ok:true`, data gồm 6 món; CORS `http://localhost:5173` |
| GET `/api/dishes/2` | 200 | `ok:true`, price number, available boolean, có imageUrl |
| GET `/api/chefs` | 200 | `ok:true`, data gồm 3 đầu bếp; CORS đúng origin |
| GET `/api/chefs/1` | 200 | `ok:true`, trả đúng ID |
| GET `/api/ingredients` | 200 | `ok:true`, data gồm 10 nguyên liệu; CORS đúng origin |
| GET `/api/ingredients/1` | 200 | `ok:true`, trả đúng ID |

## Chưa kiểm tra / cần thực hiện trên DB phát triển

- **Chưa nghiệm thu mutation và dữ liệu tồn tại sau khởi động lại với PostgreSQL thật.** Kết quả CRUD tự động ở trên dùng stub; không thay thế bằng chứng ghi DB thật.
- **Chưa áp dụng migration Block6 lên Supabase.** Migration cũ có CHECK giá `>=1000`; bản mới bổ sung `202610230001_allow_zero_price` đổi sang `>=0`. Cần `npm run db:migrate` trước khi nghiệm thu món giá 0. Migration ban đầu giữ nguyên để tương thích lịch sử Block5.
- Chưa chạy seed/upload Storage trên DB mới, chưa kiểm chứng ảnh Storage qua trình duyệt.
- Chưa kiểm tra SPA/browser/14 URL hash: thuộc phạm vi FE và hỗ trợ, không có code frontend được tạo.

## Bàn giao

1. Làm theo `api/README.md`, tạo `.env` riêng từ `.env.example`, điền cấu hình phát triển. Không có file `.env` bí mật trong bản bàn giao.
2. Với database phát triển đã có Block5: áp dụng migration mới rồi chạy API. Với DB mới: migration, cấu hình Storage và seed bằng các file đã chép vào API.
3. Dùng `api/requests.http` để kiểm chứng 15 endpoint trên DB phát triển. Thay ID bằng ID response POST, kiểm tra GET sau ghi và sau khởi động lại; dọn đúng record thử nghiệm đã tạo.
4. Contract JSON, field, status, CORS và cách xử lý ảnh được ghi trong `api/README.md`. FE gọi `http://localhost:3000/api` trực tiếp; tự phục vụ ảnh local trong thư mục public theo phân công.

Không ghi nhận CRUD DB thật, migration/seed hoặc tích hợp FE là hoàn thành khi chưa có kết quả tương ứng.
