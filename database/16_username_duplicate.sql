-- =========================================================
-- 16_USERNAME_DUPLICATE: tên đăng nhập ĐƯỢC trùng, email KHÔNG được trùng
-- Chạy sau 01..15. Script chạy lại nhiều lần an toàn.
--
-- - Đăng nhập bằng email nên tên đăng nhập chỉ để hiển thị: bỏ ràng buộc UNIQUE của profiles.username.
-- - Email vẫn duy nhất (profiles_email_key + Supabase Auth). Thêm hàm is_email_available() để
--   trang đăng ký báo "Email đã được sử dụng" ngay khi bấm Đăng ký.
-- =========================================================

-- ---------- Tên đăng nhập được trùng ----------
alter table public.profiles drop constraint if exists profiles_username_key;
-- Vẫn giữ chỉ mục để tìm kiếm theo tên nhanh (trang Quản lý thành viên)
create index if not exists idx_profiles_username on public.profiles (username);

-- ---------- Kiểm tra email trước khi đăng ký ----------
-- Chỉ trả về true/false, không lộ dữ liệu tài khoản. So sánh không phân biệt hoa thường.
create or replace function public.is_email_available(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from auth.users where lower(email) = lower(trim(p_email))
  );
$$;

revoke execute on function public.is_email_available(text) from public;
grant execute on function public.is_email_available(text) to anon, authenticated;
