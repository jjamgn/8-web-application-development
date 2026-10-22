# Group 8 – Web Application Development

Repository lưu trữ các bài tập thực hành môn **Web Application Development** của nhóm 8.

## 1. Repository Structure

Mỗi Block là một bài tập độc lập, được tổ chức trong thư mục riêng.

```text
8-web-application-development/
├── README.md
├── block-01/
├── block-02/
├── block-03/
├── block-04/
├── block-05/
├── block-06/
├── block-07/
├── block-08/
├── block-09/
└── block-10/
```

- `README.md`: Hướng dẫn chung về repository và workflow làm việc nhóm.
- `block-XX/`: Source code, tài liệu và các file liên quan đến bài tập Block tương ứng.

## 2. Team Collaboration

Nhóm sử dụng Git và GitHub để quản lý source code, phối hợp thực hiện bài tập và tích hợp các phần code do từng thành viên phát triển.

### Working Rules

1. Mỗi Block được thực hiện trong thư mục tương ứng.
2. Branch `main` chứa code đã được kiểm tra và thống nhất của nhóm.
3. Thành viên tạo branch riêng khi phát triển task mới, không làm việc trực tiếp trên `main`.
4. Các thành viên có thể phát triển song song trên các branch khác nhau, miễn là task và phạm vi chỉnh sửa đã được thống nhất.
5. Trước khi tích hợp, code cần được kiểm tra, review và chạy thử.
6. Sau khi Pull Request được merge thành công, branch đã hoàn thành có thể được xóa.

## 3. Git Workflow

### Step 1. Clone Repository

```bash
git clone https://github.com/jjamgn/8-web-application-development.git
cd 8-web-application-development
```

### Step 2. Update Main Branch

Trước khi bắt đầu một task mới, cập nhật code từ repository chung:

```bash
git switch main
git pull origin main
```

### Step 3. Create a Feature Branch

Tạo branch theo Block và task được giao:

```bash
git switch -c feature/block-XX-task-name
```

Ví dụ:

```bash
git switch -c feature/block-06-form
```

### Step 4. Develop and Commit

Thực hiện code, kiểm tra kết quả và commit các thay đổi:

```bash
git add .
git commit -m "Implement Block 06 form"
```

### Step 5. Push Branch

Đưa branch lên GitHub:

```bash
git push -u origin feature/block-06-form
```

## Step 6. Create a Pull Request

Pull Request (PR) là yêu cầu đưa code từ branch đang phát triển vào branch `main` để các thành viên khác kiểm tra trước khi tích hợp.

### Cách 1: Thực hiện trên GitHub Website

1. Push branch lên GitHub theo Step 5.
2. Mở repository trên GitHub.
3. Chọn **Pull requests** → **New pull request**.
4. Chọn:
   - **Base:** `main` (branch nhận code).
   - **Compare:** `feature/block-06-form` (branch chứa code cần đưa vào).
5. Nhấn **Create pull request**.
6. Điền tiêu đề và mô tả những thay đổi, ví dụ:
   - Title: `Implement Block 06 form`
   - Description: Nêu chức năng đã thực hiện, các file đã thay đổi và cách kiểm tra.
7. Nhấn **Create pull request** để gửi PR cho nhóm review.

### Cách 2: Tạo Pull Request bằng GitHub CLI

Nếu đã cài đặt và đăng nhập GitHub CLI (`gh`), có thể tạo PR bằng lệnh:

```bash
gh pr create --base main --head feature/block-06-form --title "Implement Block 06 form" --body "Implement and test the Block 06 form."
```

GitHub CLI có thể được cài đặt tại: https://cli.github.com/

## Step 7. Review, Merge and Delete Branch

### 7.1 Review Code

Một thành viên khác kiểm tra Pull Request trước khi merge.

Các nội dung cần review:

- Code có đáp ứng yêu cầu bài tập không?
- Code có hoạt động và chạy thử thành công không?
- Có vô tình sửa hoặc xóa code của thành viên khác không?
- Có file không cần thiết, thông tin bí mật hoặc lỗi cấu hình nào bị đưa lên repository không?

Nếu cần chỉnh sửa, reviewer có thể để lại comment hoặc yêu cầu thay đổi (Request changes). Thành viên phụ trách task sửa code trên chính branch đó, commit và push lại. Pull Request sẽ tự cập nhật.

Nếu reviewer đồng ý, họ có thể approve Pull Request.

### 7.2 Merge Pull Request trên GitHub Website

Sau khi code được review và kiểm tra:

1. Mở Pull Request.
2. Kiểm tra trạng thái review và các điều kiện merge.
3. Nhấn **Merge pull request**.
4. Nhấn **Confirm merge**.

Code từ branch feature sẽ được tích hợp vào `main`.

### 7.3 Merge Pull Request bằng GitHub CLI

Nếu nhóm sử dụng GitHub CLI, có thể xem các PR:

```bash
gh pr list
```

Xem chi tiết một PR:

```bash
gh pr view 1
```

Trong đó `1` là số Pull Request trên GitHub.

Reviewer có thể approve PR:

```bash
gh pr review 1 --approve
```

Nếu cần yêu cầu chỉnh sửa:

```bash
gh pr review 1 --request-changes --body "Please fix the validation logic."
```

Sau khi review và kiểm tra xong, merge PR:

```bash
gh pr merge 1 --merge
```

Lệnh trên sử dụng merge commit. Nếu nhóm thống nhất dùng Squash merge, thay `--merge` bằng `--squash`.

Lưu ý: Các lệnh review yêu cầu người thực hiện có quyền review phù hợp. Repository cũng có thể thiết lập quy tắc bảo vệ branch `main` để yêu cầu approval trước khi merge.

### 7.4 Delete Feature Branch

Sau khi Pull Request đã merge thành công và branch không còn cần sử dụng, xóa branch để tránh giữ quá nhiều branch cũ.

**Trên GitHub Website:**

Nhấn **Delete branch** ở trang Pull Request đã merge.

**Bằng GitHub CLI:**

Có thể merge và xóa branch trên GitHub cùng lúc:

```bash
gh pr merge 1 --merge --delete-branch
```

**Bằng Git:**

Xóa branch trên GitHub:

```bash
git push origin --delete feature/block-06-form
```

Xóa branch trên máy cá nhân:

```bash
git switch main
git pull origin main
git branch -d feature/block-06-form
```

Chỉ xóa branch sau khi code đã được merge thành công. Không xóa branch đang chứa code chưa được tích hợp.

## 8. Coding Agent Workflow

Coding agent được sử dụng để hỗ trợ phát triển, giải thích, kiểm tra và cải thiện code.

Khi làm việc với coding agent, nhóm thống nhất:

- Xác định task và phạm vi file cần thay đổi trước khi prompt.
- Cung cấp yêu cầu bài tập, các quyết định kỹ thuật đã thống nhất và tiêu chí hoàn thành.
- Không để agent tự ý thay đổi kiến trúc hoặc code của thành viên khác.
- Code được tích hợp vào repository chung sau khi review và kiểm thử.

## 9. Block Assignment

| Block | Description | Status |
|---|---|---|
| Block 01 | To be updated | Not started |
| Block 02 | To be updated | Not started |
| Block 03 | To be updated | Not started |
| Block 04 | To be updated | Not started |
| Block 05 | To be updated | Not started |
| Block 06 | To be updated | Not started |
| Block 07 | To be updated | Not started |
| Block 08 | To be updated | Not started |
| Block 09 | To be updated | Not started |
| Block 10 | To be updated | Not started |

Thông tin yêu cầu, phân công và trạng thái từng bài tập sẽ được cập nhật trong thư mục Block tương ứng.
