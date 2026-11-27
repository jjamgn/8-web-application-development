# Block 11 — Photo Gallery

- [Contract đã chốt và phân công A/B/C](./BLOCK11_CONTRACT.md) — cập nhật SeaweedFS theo yêu cầu người dùng ngày 27/11/2026.
- [Đề bài và bài giảng](<./docs/Upload, xử lý, lưu trữ và.html>) — phần bài tập tại slide 31–37.

Hướng triển khai: React + Express API, PostgreSQL/Prisma và SeaweedFS object storage qua S3 API, dùng `@aws-sdk/client-s3` v3. File local chỉ làm vùng tạm cho upload/xử lý ảnh; SeaweedFS giữ ảnh bền vững. Hiện đã cập nhật contract; chưa triển khai ứng dụng hoặc dịch vụ SeaweedFS.

Bản sửa ngày 27/11/2026: upload yêu cầu đăng nhập bằng session, mỗi ảnh lưu người đăng; xem ảnh công khai, xóa chỉ dành cho chủ ảnh. Mỗi variant WebP chia thành các mảnh nhị phân tối đa 1 MiB trên SeaweedFS; backend ghép/kiểm tra SHA-256 rồi trả ảnh hoàn chỉnh. File ghép local chỉ là tạm trong request, không là kho ảnh hoặc cache bền vững. Xem contract để biết schema, API, phân công và checklist E01–E20.
