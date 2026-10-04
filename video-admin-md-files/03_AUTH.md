# AUTHENTICATION

Sử dụng Supabase Auth. Không tự xây hệ thống password bằng JavaScript.

## Login
/login.html
Fields: Email, Password.

Sau khi login:
1. Lấy session.
2. Lấy profile.
3. Kiểm tra role.
4. ADMIN -> /index.html.
5. USER -> trang user.

## Register
/register.html
Fields:
- Username
- Email
- Password
- Confirm Password

Role mặc định là USER. Không cho frontend tự chọn ADMIN.

## Forgot Password
/forgot-password.html
Nhập email và gửi reset password email bằng Supabase.

## Reset Password
/reset-password.html
Nhập New Password và Confirm Password, sau đó dùng Supabase updateUser.

## Logout
supabase.auth.signOut(), sau đó redirect /login.html.

## Session
Mỗi trang Admin phải kiểm tra session và role.

## Demo Accounts
ADMIN:
username: admin1
email: admin1@gmail.com
password: 123456
role: ADMIN

USER:
username: user1
email: user1@gmail.com
password: 123456
role: USER

Đây chỉ là tài khoản demo development. Không hard-code password trong frontend. Tạo tài khoản bằng Supabase Auth.
