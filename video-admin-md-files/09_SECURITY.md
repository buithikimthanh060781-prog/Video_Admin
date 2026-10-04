# SECURITY RULES

## 1. Supabase Key
Có thể đặt anon/public key trong frontend.
KHÔNG đặt service_role key trong HTML/JavaScript.

## 2. Password
Không lưu password/password_hash trong profiles. Dùng Supabase Auth.

## 3. Role
Role mặc định USER. Frontend không được tự set ADMIN.

## 4. RLS
Bật Row Level Security cho tất cả tables.

## 5. profiles
USER: đọc profile của chính mình.
ADMIN: đọc profiles.

## 6. videos
USER: SELECT published videos.
ADMIN: SELECT, INSERT, UPDATE, DELETE.

## 7. video_views
Authenticated user: INSERT.
Admin: SELECT.

## 8. categories
Authenticated: SELECT.
ADMIN: INSERT, UPDATE, DELETE.

## 9. Never trust frontend
Không chỉ kiểm tra if(role === 'ADMIN') trên frontend. Database RLS phải bảo vệ dữ liệu.

## 10. XSS
Khi render dữ liệu database, ưu tiên textContent thay vì innerHTML cho dữ liệu user.

## 11. File upload
Validate MIME type, extension và file size.

## 12. Error messages
Không hiển thị SQL error, Supabase internal error hoặc stack trace cho user.
