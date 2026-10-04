# VIDEO ADMIN MANAGEMENT SYSTEM

## 1. Project Overview
Xây dựng website Admin quản lý video bằng HTML5, CSS3, Vanilla JavaScript và Supabase.

Không sử dụng React, Vue, Angular, Next.js, Node.js backend, PHP, ASP.NET hoặc backend server riêng.

Frontend chạy như static website.

## 2. Mục tiêu
- Đăng nhập
- Đăng ký
- Quên mật khẩu
- Dashboard thống kê video
- Quản lý video
- Thêm, sửa, xóa video
- Upload thumbnail/video
- Quản lý category
- Quản lý users
- Phân quyền ADMIN / USER
- Theo dõi lượt xem

## 3. User Roles
### ADMIN
Xem Dashboard, quản lý video, category, users và storage.

### USER
Đăng nhập, xem video và thông tin cá nhân; không có quyền quản trị.

## 4. Pages
/login.html
/register.html
/forgot-password.html
/reset-password.html
/index.html
/videos.html
/video-edit.html
/users.html
/categories.html
/account.html

## 5. Dashboard
- Tổng số video
- Tổng lượt xem
- Dung lượng storage
- Tổng số users
- Top 10 video nhiều lượt xem
- Biểu đồ lượt xem theo ngày/tháng

## 6. UI
Light mode, nền trắng, sidebar sáng, card trắng, border nhẹ, border-radius 8–12px, responsive.

## 7. Architecture
Frontend: HTML + CSS + JavaScript
Backend service: Supabase
Database: PostgreSQL
Authentication: Supabase Auth
Storage: Supabase Storage
