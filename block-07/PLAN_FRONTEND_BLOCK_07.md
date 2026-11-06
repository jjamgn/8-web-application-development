# Kế hoạch frontend Block 7 - tái sử dụng Bếp Nhà

Ngày lập: 30/10/2026. Đây là kế hoạch gốc; trạng thái triển khai được ghi tại docs/IMPLEMENTATION.md. Cập nhật theo yêu cầu mới: tập trung vai trò TV2, ẩn bộ chọn kiểu tìm kiếm; frontend tự phối hợp các API search để cải thiện trải nghiệm.

## 1. Căn cứ và phạm vi

- Yêu cầu trực tiếp: tái sử dụng frontend hiện tại; triển khai đủ ba kiểu phân trang, mỗi nơi một kiểu; giữ phân công trong kế hoạch nhóm ba người; bổ sung thêm món ăn có ảnh tải lên hoặc ảnh từ link.
- [Đề Block 7](C:/Users/pc/Downloads/block7.pdf), trang 33-42: ít nhất 1.000 món, giữ CRUD, ba kiểu pagination, filter/sort, bốn mode search tại server, URL và bằng chứng nghiệm thu.
- [Phân công nhóm](C:/Users/pc/Downloads/Block7_Plan_45Phut_Nhom3.md): TV1 API/search; TV2 frontend/pagination; TV3 seed/filter/sort/QA. Các route trong tài liệu đó là đề xuất, cần khớp mã thực tế.
- [Frontend gốc](C:/2026_2027/web/8-web-application-development/block-06/web/): cơ sở để triển khai tiếp.

Tài liệu đính kèm được dùng làm yêu cầu bài tập và căn cứ phân công. Những lựa chọn về vị trí phân trang, tên component, hợp đồng upload và lịch mở rộng dưới đây là đề xuất cho yêu cầu hiện tại. Riêng bổ sung ảnh là phạm vi người dùng yêu cầu thêm, không phải yêu cầu nguyên văn của PDF.

## 2. Hiện trạng đã kiểm tra trong mã

| Phần | Hiện có | Hướng tái sử dụng |
|---|---|---|
| Nền tảng | React 19, TypeScript, Vite, React Router với `HashRouter` | Giữ stack và SPA, không đổi sang framework khác |
| Giao diện | `Layout`, `DishCard`, `PageState`, `styles.css`, ảnh local | Giữ màu sắc, hero, header/footer, card, bảng và responsive |
| Thực đơn | `DishListPage.tsx`, search tên bằng `q` trên URL | Mở rộng query và nối trang bằng Load More |
| Quản trị | `AdminListPage.tsx` dùng chung dishes/chefs/ingredients | Chỉ danh sách dishes đổi sang phân trang số |
| Thêm/sửa món | `AdminFormPage.tsx` và cấu hình field tại `resources.ts` | Bổ sung khu vực ảnh, giữ validation và luồng CRUD |
| Hiển thị ảnh | `Dish.imageUrl`, `Dish.imagePath`, hàm `imageSource` và ảnh fallback | Dùng lại cho card, bảng, trang chi tiết |
| Gọi API | `request<T>()` xử lý envelope, timeout, lỗi; `useLoad` hỗ trợ hủy request | Dùng lại `request`; tạo hook riêng cho danh sách phân trang |

**Các điểm phải xử lý khi tích hợp:**

1. `GET /api/dishes` hiện trả `data: Dish[]`, chưa có `items/total/page/pageSize`.
2. `useLoad(..., 'list')` kiểm tra dữ liệu phải là mảng. Không thể đổi API sang object mà giữ nguyên tất cả nơi gọi cũ.
3. Form hiện chưa có input ảnh. Backend Zod chưa nhận trường ảnh; tạo món luôn gán `imagePath: '/images/beef.png'`. Thêm input ở frontend chưa đủ để lưu ảnh.
4. DB hiện có `imagePath` bắt buộc; `imageUrl` do backend suy ra từ path. Hàm backend hiện chưa phân biệt URL ngoài với Storage path, nên cần mở rộng khi hỗ trợ link ảnh.
5. `AdminFormPage` còn lấy `/chefs` để chọn đầu bếp. Giữ API chefs/ingredients trả mảng trong đợt này để tránh làm hỏng form và CRUD khác.

Các nhận định trên dựa trên mã nguồn, chưa phải kết quả chạy ứng dụng hoặc kiểm tra DB tại ngày lập kế hoạch.

## 3. Bố trí ba kiểu phân trang: mỗi nơi một kiểu

| Vị trí | URL giao diện | Kiểu duy nhất | Lý do |
|---|---|---|---|
| Quản lý món ăn | `/#/admin/dishes` | **Page Numbers** | Dễ tìm lại trang để xem/sửa/xóa, biết tổng số món |
| Thực đơn hiện tại | `/#/dishes` | **Load More** | Khách chủ động xem thêm và vẫn tiếp cận được footer |
| Khám phá món ăn | `/#/explore` (thêm mới) | **Infinite Scroll** | Duyệt liên tục bằng card hiện có; có thể tìm/lọc như thực đơn |

- Ba nơi cùng dùng `GET /api/dishes`, cùng kiểu dữ liệu và hàm serialize query; không làm ba nguồn dữ liệu riêng.
- Thêm liên kết “Khám phá món” ở điều hướng khách. Trang mới dùng lại `DishCard`, thanh tìm/lọc và lưới món, không sao chép toàn bộ trang thực đơn/hero.
- Không thêm bộ chuyển ba kiểu pagination vào cùng một danh sách.
- Mặc định `pageSize=12`; admin có thể dùng `20` nếu đã chốt trong contract. Giữ kích thước cố định trong buổi 45 phút để giảm trạng thái cần xử lý.
- Chọn **server-side pagination + AJAX** cho cả ba nơi: browser nhận từng phần dữ liệu, server tìm/lọc/sort trước khi cắt trang. Không tải 1.000 món rồi `.slice()` ở frontend.

### 3.1. Page Numbers - quản trị

- Dùng bảng và thao tác Xem/Sửa/Xóa hiện có; bổ sung tổng kết quả, Trang trước/Sau, số trang và dấu `…` khi nhiều trang.
- `pageCount = Math.ceil(total / pageSize)`; khi `total=0`, hiện trạng thái rỗng và ẩn bộ phân trang.
- Đổi trang thay danh sách, không nối. Giữ nguyên search/filter/sort trên URL.
- Khi xóa hết món cuối trang: nếu trang hiện tại vượt trang cuối mới, chuyển về trang hợp lệ và fetch lại một lần.
- Khi quay về sau sửa/xóa, giữ query quản trị bằng liên kết `returnTo` nội bộ được kiểm tra hoặc router state; không luôn trở về trang 1 và mất bộ lọc.

### 3.2. Load More - thực đơn

- Trang đầu tải 12 món, nút “Tải thêm món” nối trang kế tiếp vào cuối.
- Hiện “Đã xem X / Y món”; khóa nút khi đang tải, hết dữ liệu thì ẩn nút và báo đã xem hết.
- Lỗi tải tiếp giữ nguyên món đã xem, hiện “Thử tải lại”; retry đúng trang lỗi, chỉ tăng trang sau response thành công.

### 3.3. Infinite Scroll - khám phá

- Dùng `IntersectionObserver` quan sát sentinel cuối danh sách; bắt đầu tải khi còn khoảng 300px tới sentinel.
- Chỉ gọi khi có trang tiếp theo và không có request đang chạy; cleanup observer khi unmount hoặc đổi bộ điều kiện.
- Không tự retry vô hạn khi lỗi; hiện nút thử lại. Có nút tải tiếp dự phòng khi observer không hoạt động hoặc người dùng cần thao tác bàn phím.
- Hiện số món đã tải, loading ở cuối, thông báo hết kết quả; không tự chuyển focus khi thêm món.
- URL mở lại tải từ trang đầu; không hứa khôi phục vị trí cuộn hay số trang đã tích lũy trong phạm vi này.

## 4. Tìm kiếm, filter/sort và URL

TV2 tích hợp vùng điều khiển; TV3 sở hữu component filter/sort dùng chung. Giao diện gồm:

- Ô từ khóa và nút tìm kiếm, giữ giới hạn 160 ký tự hiện tại. Gõ chưa gửi request; submit mới áp dụng.
- Không hiển thị bộ chọn kiểu tìm. Frontend ưu tiên Fuzzy khi có từ khóa; nếu total=0 thì thử tìm tên (Basic/Advanced tùy bộ lọc) rồi Full-text. Không có từ khóa thì lấy danh sách/lọc thông thường; giữ cách tìm đã ra kết quả trong các trang tải thêm của cùng query.
- Danh mục theo đúng dữ liệu hiện có: `Khai vị`, `Món chính`, `Món chay`, `Tráng miệng`; không tự gửi `main` từ ví dụ của tài liệu.
- Giá từ/đến; trạng thái ba giá trị: Tất cả / Đang phục vụ / Tạm hết. Giá `0` và `available=false` phải được giữ khi serialize.
- Sort tên A-Z/Z-A, giá tăng/giảm trong Basic/Advanced. Full-text/Fuzzy có từ khóa dùng thứ tự độ phù hợp do server trả về theo yêu cầu trang 38; khóa sort tên/giá và hiển thị “Độ phù hợp”.
- Nút Áp dụng và Xóa điều kiện. Validate giá nguyên không âm, giá tối thiểu không lớn hơn giá tối đa trước khi gửi; hiển thị lỗi cạnh trường.

**Quy ước cần TV1 thống nhất:** filter được áp dụng cùng search trên toàn tập kết quả; Advanced dùng AND các điều kiện. Full-text/Fuzzy có từ khóa xếp hạng điểm giảm dần, `id` để phân định khi bằng điểm. Với từ khóa rỗng, trả danh sách có filter theo thứ tự mặc định ổn định và bật lại sort thông thường; backend cần thực hiện cùng quy tắc này.

Ví dụ URL với `HashRouter` hiện tại:

```text
/#/admin/dishes?mode=advanced&q=canh&category=M%C3%B3n+chay&minPrice=0&available=false&sort=price_asc&page=2&pageSize=12
/#/dishes?mode=basic&q=canh&sort=name_asc
/#/explore?mode=fuzzy&q=phoo
```

- Dùng `useSearchParams`, không lấy query bằng `window.location.search` vì query của SPA nằm sau hash.
- URL là nguồn trạng thái đã áp dụng; giá trị đang nhập trong form có thể là draft riêng. Back/Forward phải cập nhật lại cả điều khiển và request.
- Admin: URL giữ `page`, `pageSize`, search/filter/sort; copy link và reload phải khôi phục đúng.
- Thực đơn/Khám phá: URL giữ điều kiện và kích thước trang, không ghi `page` tích lũy. Reload, Back/Forward hoặc mở lại link bắt đầu từ trang 1 theo chính sách công bố.
- Thay `q/mode/category/minPrice/maxPrice/available/sort/pageSize` phải reset về trang 1, xóa món tích lũy và hủy request cũ ngay.
- Xóa điều kiện phục hồi query mặc định và danh sách trang đầu, không chỉ xóa nội dung input.
- Query không hợp lệ (`page=abc`, số âm, enum lạ) cần chuẩn hóa hoặc báo lỗi rõ ràng, không gửi `NaN` xuống API.

## 5. Hợp đồng frontend - backend cần chốt trước khi code

### 5.1. Danh sách món

```http
GET /api/dishes?mode=advanced&q=canh&minPrice=0&available=false&sort=price_asc&page=1&pageSize=12
```

```json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 12
  },
  "error": null
}
```

- `items` là `Dish[]` đúng các trường camelCase frontend đang dùng; `total` tính sau search/filter, trước pagination.
- `page/pageSize` là số nguyên dương; giới hạn `pageSize` do TV1 công bố, đề xuất tối đa 100.
- `sort`: thống nhất `name_asc`, `name_desc`, `price_asc`, `price_desc`; thêm `relevance` cho Full-text/Fuzzy có từ khóa. Default đề xuất `name_asc`, có `id` làm khóa phụ ổn định.
- `request<Paginated<Dish>>()` đã bóc `data`, hook không đọc thêm một lần `.data` nữa.
- Chỉ thay contract danh sách dishes. GET chi tiết, POST/PATCH, chefs và ingredients giữ kiểu trả về hiện có.
- TV1 chịu trách nhiệm Basic, AND Advanced, full-text cấu hình `simple`, fuzzy `pg_trgm` ngưỡng 0.3 và SQL/seed; frontend chỉ gửi tham số và hiển thị kết quả thật.
- FE cập nhật xử lý error envelope cả khi status HTTP không thành công: `request()` hiện ném lỗi HTTP chung trước khi đọc JSON, có thể làm mất `error.fields`. Giữ fallback cho response lỗi không phải JSON.

### 5.2. Hook và tính đúng của danh sách

Tạo `useDishPagination` trên `request()`, hỗ trợ hai hành vi replace/append để ba trang dùng chung:

1. Tạo query key từ toàn bộ điều kiện đã áp dụng, không chỉ `q`.
2. Mỗi query key có `AbortController` và mã thế hệ request; response cũ không được cập nhật state của query mới.
3. Chặn gọi tiếp bằng khóa đồng bộ/ref, không chỉ dựa vào state đang render. Một trang chỉ được thêm một lần.
4. Nối theo thứ tự server, deduplicate bằng `dish.id`; deduplicate là lớp bảo vệ, không thay thế yêu cầu server sort ổn định.
5. `hasMore` dựa vào metadata: `page * pageSize < total`; ngừng nếu server trả trang rỗng và yêu cầu kiểm tra metadata, tránh observer gọi lặp vô hạn.
6. Tách loading ban đầu với loading tiếp; lỗi tải tiếp không xóa danh sách cũ. Retry giữ nguyên số trang cần gọi.
7. Dữ liệu thay đổi đồng thời có thể làm OFFSET dịch chuyển; nghiệm thu trên tập seed ổn định. Không cam kết snapshot nhất quán khi người khác thêm/xóa trong lúc cuộn; reload làm mới tập kết quả.

## 6. Bổ sung thêm/sửa món có hai nguồn ảnh

### 6.1. Trải nghiệm giao diện

Tại `/#/admin/dishes/new` và màn sửa, thêm component `DishImageInput` dành riêng cho dishes, không thêm field bắt buộc vào form generic của chefs/ingredients.

| Nguồn ảnh | Thao tác | Cách lưu |
|---|---|---|
| Tải ảnh từ máy | Chọn một file JPEG/PNG/WebP, tối đa 5 MB; xem trước, đổi hoặc bỏ lựa chọn | Upload file lên server/Storage, lưu path bền vững |
| Nhúng bằng link ảnh | Dán URL HTTPS trỏ trực tiếp tới ảnh; xem trước bằng `<img>` | Lưu URL, trình duyệt hiển thị ảnh từ nguồn đó |

Quy ước “nhúng link” ở đây là **link ảnh trực tiếp**, không phải mã HTML/iframe hoặc link trang bài viết/album. Không cần URL có đuôi `.jpg`; URL CDN có query vẫn hợp lệ nếu tải được ảnh.

- Ảnh là tùy chọn khi tạo, bỏ trống dùng fallback hiện có để giữ luồng CRUD cũ.
- Preview có thông báo đang tải, ảnh lỗi/link không xem được; không dùng ảnh fallback để làm người dùng tưởng link nhập đã hợp lệ.
- File preview dùng object URL, giải phóng bằng `URL.revokeObjectURL` khi đổi ảnh/unmount. Không lưu blob URL hoặc base64 vào bản ghi/localStorage.
- URL chỉ chấp nhận HTTPS cho ảnh mới; không cho `javascript:`, `data:`, `blob:` hoặc HTML. Ảnh seed local cũ vẫn hiển thị như hiện tại.
- Preview ảnh qua `<img>` thông thường; không thêm `crossOrigin` nếu không đọc canvas. Host chặn nhúng có thể làm preview lỗi, cần báo để đổi nguồn.
- Đổi chế độ chỉ gửi nguồn đang chọn. File/URL của chế độ bỏ đi không tự xuất hiện trong payload.
- Khi sửa: không chạm ảnh thì PATCH không có `imagePath`; đổi ảnh gửi path/URL mới; “Dùng ảnh mặc định” gửi đường dẫn fallback. Không tự xóa file ảnh cũ có thể dùng chung.
- Khi lưu: khóa submit để tránh tạo hai món, hiện “Đang tải ảnh…” rồi “Đang lưu món…”. Lỗi giữ toàn bộ thông tin đã nhập và cho thử lại.
- Nếu upload thành công nhưng tạo món thất bại, giữ path đã upload để retry tạo món mà không upload lại cùng file; đổi file mới mới hủy path đang chờ. TV1 xử lý dọn file tạm không còn tham chiếu theo cơ chế upload của backend.
- Thành công mới điều hướng về danh sách; card, bảng và chi tiết phải dùng được ảnh sau reload.

### 6.2. Contract ảnh đề xuất để phù hợp schema hiện có

**Lựa chọn cho đợt này:** tiếp tục lưu một trường `imagePath`, chứa Storage path hoặc URL HTTPS ngoài; `imageUrl` chỉ là trường đọc do backend chuẩn hóa. Chưa cần thêm cột DB nếu nhóm chấp nhận quy ước này.

```http
POST /api/uploads/dishes
Content-Type: multipart/form-data
# field: file
```

```json
{
  "ok": true,
  "data": {
    "imagePath": "uploads/unique-id.webp",
    "imageUrl": "https://storage-host.example/dish-images/uploads/unique-id.webp"
  },
  "error": null
}
```

Sau upload, frontend gửi `POST /api/dishes` dạng JSON với các field cũ và `imagePath` nhận từ server. Với link ngoài, `imagePath` là URL HTTPS đã kiểm tra. Giữ field hiện có `chefId` và `available`, không đổi tên theo schema DB.

TV1 cần bàn giao các thay đổi phụ thuộc:

1. Endpoint upload nhận multipart, kiểm tra kích thước và nội dung file ở server, tạo tên riêng, lưu Storage và trả path bền vững. FE gửi `FormData` không tự đặt header `Content-Type` để browser tạo boundary.
2. Zod create/patch cho phép `imagePath` hợp lệ; create chỉ dùng ảnh mặc định khi client không gửi ảnh. Path Storage phải thuộc phạm vi upload được phép, không nhận tùy ý đường dẫn hệ thống.
3. Hàm backend `imageUrl(path)` nhận biết URL HTTPS để trả nguyên URL; path Storage đổi thành URL bucket, `/images/...` giữ tương thích.
4. Server không cần tải nội dung URL ngoài về để nhập vào Storage trong phạm vi này; chỉ validate URL và lưu tham chiếu.
5. Trả lỗi theo trường (`imagePath`/`file`) và lỗi upload rõ ràng. Thống nhất public URL cho ảnh món trong bài tập; không ghi signed URL sẽ hết hạn vào DB.

FE chỉ cần URL API công khai; khóa quản trị Storage nằm phía backend. Chức năng ảnh chỉ nghiệm thu hoàn chỉnh khi upload/link được lưu qua API thật và còn hiển thị sau reload.

## 7. Phân công và phạm vi file

Giữ vai trò ba người; phần ảnh được bổ sung vào TV2 và có phụ thuộc cụ thể ở TV1.

| Thành viên | Trách nhiệm | File/phần sở hữu |
|---|---|---|
| TV1 - Backend/Search API | Pagination/count; bốn mode search; validate/filter/sort server; upload và lưu ảnh | `api/...`; công bố query/response/error contract, SQL minh chứng |
| TV2 - Frontend/Pagination | Tái sử dụng giao diện; ba vị trí pagination; search/URL; tích hợp filter; form thêm/sửa ảnh; tổng hợp FE | Các page/router/layout; `hooks/useDishPagination.ts`; `lib/dishes.ts`; `lib/api.ts`; kiểu phân trang; component pagination và ảnh |
| TV3 - Data/Filter/Sort/QA | Seed >=1.000 món; thanh filter/sort; kiểm thử và bằng chứng | `components/DishFilters.tsx`, `styles/dish-filters.css`, seed script, checklist/evidence |

- `DishFilters` nhận `value`, `onApply(next)`, `onReset`; không tự fetch và không tự sửa URL. Search mode/ranking truyền vào bằng props để khóa sort khi cần.
- TV2 cung cấp type query và vị trí gắn component ngay đầu buổi; TV3 import type từ file chung, không đồng thời sửa hook/page/router.
- TV2 sở hữu `styles.css`; TV3 đặt CSS filter trong file riêng do component import để tránh đụng file.
- Khi triển khai, tạo `block-07/web` từ frontend Block 6: giữ `src`, `public`, cấu hình, package manifest/lockfile và các test liên quan; cài dependency từ lockfile. Không sao chép `node_modules`, build output hay secret. Chưa thực hiện thao tác này trong lượt lập kế hoạch.

Cấu trúc dự kiến trong `block-07/web/src`:

```text
types.ts                         # giữ entity; thêm Paginated<T>, DishQuery
lib/api.ts                       # giữ request; đọc lỗi HTTP có envelope
lib/dishes.ts                    # parse/serialize query, fetchDishPage, uploadDishImage
hooks/useDishPagination.ts       # replace/append, cancel, retry, dedup
components/PageNumbers.tsx
components/LoadMoreButton.tsx
components/InfiniteDishList.tsx  # observer + sentinel + trạng thái cuối
components/DishFilters.tsx       # TV3
components/DishImageInput.tsx
styles/dish-filters.css          # TV3
pages/DishListPage.tsx           # chỉnh trang hiện có: Load More
pages/ExplorePage.tsx            # trang mỏng mới: Infinite Scroll
pages/AdminListPage.tsx          # dishes phân trang số; resource khác giữ nguyên
pages/AdminFormPage.tsx          # thêm/sửa ảnh, giữ CRUD
app/router.tsx                  # thêm /explore
components/Layout.tsx           # thêm link Khám phá món
```

## 8. Thứ tự triển khai và thời lượng

### 8.1. Lõi bài tập trong 45 phút theo kế hoạch nhóm

| Mốc | TV2 frontend | Phụ thuộc/bàn giao |
|---|---|---|
| 00-05 phút | Xác nhận UI cũ; chốt query type, ba nơi pagination, response và chính sách URL | TV1 chốt API; TV3 nhận props/type filter |
| 05-15 phút | Hook/query serializer; nối Page Numbers cho admin dishes | TV1 cung cấp API pagination, Basic/Advanced; TV3 seed và làm thanh lọc |
| 15-20 phút | Hoàn thành URL/reload và states admin | Mốc kiểm tra: có luồng phân trang thật, không chỉ fixture |
| 20-30 phút | Nối Load More thực đơn; Infinite Scroll trang khám phá; gắn filter/search mode | TV1 bàn giao Full-text/Fuzzy; TV3 bàn giao component filter |
| 30-40 phút | Tích hợp toàn bộ điều kiện, kiểm tra race/retry/reset, hồi quy CRUD | Cả nhóm sửa lỗi và lấy Network/query |
| 40-45 phút | Demo ba vị trí, URL/reload, lỗi trước/sau | TV3 gom bằng chứng, TV1 giải thích SQL |

Đây vẫn là lịch gấp và cần môi trường chạy sẵn. Không tính phần ảnh upload/link vào 25 phút code của TV2 rồi coi đó là cam kết khả thi.

### 8.2. Phần bổ sung ảnh: dự trù thêm 45-60 phút sau lõi

- 10-15 phút: TV2 làm chọn nguồn, preview, validation; TV1 làm upload và mở rộng lưu/serialize `imagePath` song song.
- 15-20 phút: nối upload -> tạo món, link -> tạo món, sửa/thay/giữ ảnh, xử lý retry.
- 20-25 phút: kiểm thử API thật, reload, hồi quy CRUD và chụp bằng chứng.

Nếu bắt buộc tổng cộng chỉ 45 phút, cần chuẩn bị sẵn API ảnh và component ảnh trước buổi. Ba kiểu phân trang và bốn mode search vẫn là yêu cầu bắt buộc của bài, không chuyển thành tùy chọn để nhường thời gian cho ảnh.

## 9. Checklist nghiệm thu frontend

| Ca kiểm tra | Kết quả cần đạt |
|---|---|
| Admin trang 2/3, chọn trước/sau | Thay đúng danh sách, tổng/trang đúng; Network chỉ lấy page tương ứng |
| Copy URL admin, reload, Back/Forward | Giữ trang, search, mode, filter và sort; điều khiển khớp URL |
| Load More nhiều lần, bấm nhanh | Nối đúng thứ tự, không request trùng/trùng ID; dừng khi hết |
| Cuộn liên tiếp, sentinel vẫn nằm trong viewport | Không tải cùng trang hai lần; cleanup khi đổi route/query |
| Lỗi tải trang kế tiếp, thử lại | Giữ món cũ; retry trang lỗi, không nhảy qua một trang |
| Đổi filter khi request cũ chưa xong | Reset về đầu; response cũ không được nối vào kết quả mới |
| Filter category, giá 0, trạng thái tạm hết | Gửi đúng giá trị, áp dụng trên toàn tập kết quả ở server |
| Tên/giá tăng giảm | Thứ tự liên tục giữa các trang, giữ nguyên khi tải tiếp |
| Basic/Advanced/Full-text/Fuzzy | Mode gửi đúng; Basic/Advanced cùng q và cùng điều kiện cho kết quả tương ứng; full-text gồm mô tả; fuzzy có tên gần giống |
| Từ khóa chứa `%`, `_`, dấu tiếng Việt; không có kết quả | Không lỗi encoding; server xử lý ký tự; UI rỗng đúng, không còn món query trước |
| Full-text/Fuzzy có từ khóa | Thứ tự độ phù hợp do server, không sort lại client |
| Tạo món không ảnh; tạo món bằng file; tạo món bằng link | API lưu thành công; ảnh đúng ở bảng/card/chi tiết sau reload |
| File >5 MB/sai loại; link sai/không tải được; upload lỗi | Báo rõ, giữ draft, không báo lưu thành công khi ảnh chưa được lưu |
| Đổi File -> Link và Link -> File; sửa chỉ tên; dùng ảnh mặc định | Chỉ nguồn đang chọn được gửi; PATCH không chạm ảnh thì giữ ảnh cũ |
| Upload xong nhưng POST món lỗi; bấm lưu nhanh hai lần | Retry không upload lại file chưa đổi; không tạo hai món |
| Sửa/xóa món cuối trang admin | Giữ query quay về; tự về trang hợp lệ nếu trang cuối hết dữ liệu |
| Chefs/ingredients, dropdown đầu bếp, chi tiết và xóa có xác nhận | CRUD hiện có tiếp tục hoạt động với contract cũ |
| Mobile và bàn phím | Không tràn thanh lọc/nút trang; label/focus/lỗi rõ, trạng thái tải có `aria-live` |

Kiểm tra mã: `cd web` rồi `.\pnpm.cmd build`. Cập nhật các test smoke/integration hiện có vì chúng đang kỳ vọng danh sách dishes trả mảng và món vừa tạo luôn xuất hiện trên trang đầu. Khi test tạo món, tìm bằng tên/ID hoặc query xác định thay vì giả định vị trí.

Fixture chỉ để phát triển UI. Nghiệm thu cuối cần frontend -> API -> Supabase thật; seed >=1.000 món và SQL do TV1/TV3 xác nhận, không suy ra từ con số hiển thị trên UI.

## 10. Bộ bằng chứng và điều kiện hoàn thành

Lưu tại `block-07/docs/evidence/` khi triển khai:

- Ảnh ba màn: admin số trang, thực đơn Tải thêm, khám phá cuộn vô hạn.
- URL admin ở trang >1 sau search/filter; reload vẫn đúng; Network thể hiện từng request có `page/pageSize` và response `total`.
- Kết quả filter/sort và bốn mode search, kèm SQL do TV1 cung cấp; ảnh count/seed do TV3 cung cấp.
- Tạo món bằng file/link, ảnh sau reload và một ca validation ảnh.
- Ít nhất một lỗi thực tế có: bước tái hiện -> kết quả sai -> nguyên nhân -> thay đổi -> bằng chứng sau sửa. Ca nên thử: đổi category trong khi trang tiếp theo đang pending. Chỉ ghi là lỗi đã sửa nếu đã tái hiện được, không dựng minh chứng giả.

Hoàn thành khi cả ba vị trí phân trang chạy trên cùng dữ liệu thật, search/filter/sort giữ đúng phạm vi và URL, CRUD cũ hoạt động, hai nguồn ảnh lưu bền vững và các bằng chứng trên đã được thu thập. File này ghi kế hoạch; kết quả đã chạy và các giới hạn thực tế nằm trong docs/IMPLEMENTATION.md.
