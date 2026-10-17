# Video Admin Management System

Static website (HTML + CSS + Vanilla JS) dùng Supabase (Auth, PostgreSQL, Storage).

## Chạy local
Do dùng ES Modules, cần chạy qua HTTP server tĩnh, ví dụ:

    npx serve .
    # hoặc
    python -m http.server 5500

### Sau mỗi lần sửa JS/CSS
Chạy `powershell -ExecutionPolicy Bypass -File tools\set-asset-version.ps1` để gắn phiên bản mới (`?v=...`)
cho mọi file JS/CSS. Nếu không, trình duyệt có thể dùng file cũ trong bộ nhớ đệm (vd: trang Thành viên
vẫn hiện giao diện cũ, không có nút Kích hoạt).

## Cấu hình
`js/supabase.js` chứa Project URL và publishable (anon) key. Không dùng service_role key.

### Supabase Auth → URL Configuration
Thêm URL chạy local (ví dụ `http://localhost:5500/**`) vào **Redirect URLs**
để link xác nhận email và link đặt lại mật khẩu quay về đúng trang.

## Database
Các file SQL nằm ở `../database/` (ngoài thư mục web để không bị public khi deploy).
Chạy lần lượt trong Supabase SQL Editor (hoặc `python database/run_sql.py <file>` từ thư mục gốc,
với biến môi trường `SUPABASE_DB_PASSWORD`):

1. `database/01_database.sql` — tables, indexes, RLS
2. `database/02_auth.sql` — trigger tạo profile, helper `is_admin()`, policies profiles
3. `database/seed_demo_users.sql` — tài khoản demo (chỉ dùng khi dev)
4. `database/03_dashboard.sql` — policies đọc videos/categories/video_views, trigger đếm lượt xem, RPC thống kê
5. `database/seed_demo_data.sql` — dữ liệu mẫu categories/videos/lượt xem (chỉ dùng khi dev)
6. `database/04_videos_storage.sql` — policies ghi videos (ADMIN), buckets thumbnails/videos/avatars, storage policies
7. `database/05_users.sql` — cột `profiles.status` (ACTIVE/INACTIVE; từ file 14 thêm PENDING); chỉ tài khoản ACTIVE đăng nhập được, ADMIN không ACTIVE mất quyền quản trị
8. `database/06_categories.sql` — policies ghi `video_categories` (ADMIN), ràng buộc định dạng slug
9. `database/07_security.sql` — giới hạn cột được update ở profiles, thu hẹp quyền EXECUTE, policies site_settings
10. `database/08_youtube.sql` — cột `videos.video_source` (UPLOAD/YOUTUBE) + ràng buộc link YouTube hợp lệ
11. `database/09_courses.sql` … `database/13_protect_course_videos.sql` — khóa học, đăng ký học, thông báo, bảo vệ video khóa học
12. `database/14_member_activation.sql` — thành viên mới đăng ký ở trạng thái **PENDING** (chờ kích hoạt); ADMIN không tự đổi role/status của chính mình
13. `database/15_member_phone.sql` — cột `profiles.phone` (nhập khi đăng ký, ADMIN xem ở trang Thành viên); nút **Đăng ký** khóa học gửi yêu cầu ngay bằng số điện thoại trong hồ sơ (không cần popup)

## Kích hoạt thành viên
- Đăng ký xong, tài khoản ở trạng thái **Chờ kích hoạt** (PENDING): chưa đăng nhập, chưa đăng ký học được.
- ADMIN vào **Quản lý thành viên → Thành viên**: bấm **Kích hoạt** (→ ACTIVE) hoặc **Ngừng kích hoạt** (→ INACTIVE).
  Số thành viên chờ kích hoạt hiện thành huy hiệu cạnh menu "Thành viên".
- Tài khoản đang có trước khi chạy file 14 giữ nguyên trạng thái.
- Supabase đang bật **Confirm email**: khi ADMIN bấm Kích hoạt, database tự đánh dấu email đã xác nhận
  (trigger `trg_profiles_confirm_email_on_activate`), nên thành viên đăng nhập được ngay mà không cần mở email.
  Nên tắt hẳn ở Supabase → Authentication → Sign In / Providers → Email → **Confirm email** để tránh giới hạn
  gửi email mặc định của Supabase (vài email mỗi giờ) làm lỗi đăng ký.

## Storage
| Bucket     | Public | Giới hạn | Định dạng       |
|------------|--------|----------|-----------------|
| thumbnails | ✔      | 5 MB     | JPG, PNG, WEBP  |
| avatars    | ✔      | 2 MB     | JPG, PNG, WEBP  |
| videos     | ✘ (signed URL) | 50 MB | MP4, WEBM |

Path file: `userId/timestamp-ten-file.ext`.

## Nguồn video
- **Upload file**: lưu bucket `videos` (private), xem qua signed URL (hết hạn sau 1 giờ).
- **Link YouTube**: chỉ nhận domain YouTube (youtube.com, youtu.be, shorts, embed); lưu dạng chuẩn
  `https://www.youtube.com/watch?v=<id>` và nhúng bằng `youtube-nocookie.com`. Ảnh bìa tự lấy từ YouTube nếu không chọn thumbnail.
- Nút **Xem** ở trang Quản lý video mở trình phát cho cả hai loại.

## Trang xem video (USER và ADMIN)
- `library.html`: thư viện video PUBLISHED (tìm kiếm, lọc category, phân trang 12/24/48). USER đăng nhập sẽ vào trang này.
- `watch.html?id=<id>`: trình phát + thông tin + "Video khác" (ưu tiên cùng category).
- Mỗi lần mở video phát được sẽ ghi 1 dòng `video_views` (trigger tự tăng `videos.views`);
  cùng video chỉ tính 1 lần trong 30 phút trên mỗi trình duyệt. Xem thử ở trang quản trị (nút Xem) không tính lượt xem.

## Bảo mật
- Frontend chỉ chứa publishable key; mọi quyền được bảo vệ bằng RLS ở database.
- USER chỉ được sửa `full_name`, `avatar_url` (avatar phải nằm trong folder của chính mình);
  `role`/`status` chỉ ADMIN đổi được; `username`/`email` không sửa qua API.
- Mỗi trang có Content-Security-Policy: script chỉ từ site và `cdn.jsdelivr.net`, gọi API chỉ tới Supabase của project.
- Render dữ liệu bằng `textContent`; không hiển thị lỗi SQL/Supabase cho người dùng.
- Khi deploy: chỉ upload thư mục `video-admin/`.

## Tài khoản demo (development)
| Role  | Email            | Password |
|-------|------------------|----------|
| ADMIN | admin1@gmail.com | 123456   |
| USER  | user1@gmail.com  | 123456   |
