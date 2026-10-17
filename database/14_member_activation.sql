-- =========================================================
-- 14_MEMBER_ACTIVATION: thành viên mới đăng ký phải chờ ADMIN kích hoạt
-- Chạy sau 01..13. Script chạy lại nhiều lần an toàn.
--
-- profiles.status:
--   PENDING  : vừa đăng ký, chờ quản trị viên kích hoạt (không đăng nhập / đăng ký học được)
--   ACTIVE   : đang hoạt động
--   INACTIVE : bị quản trị viên ngừng kích hoạt
--
-- KHÔNG đổi trạng thái của các tài khoản đang có: chỉ tài khoản đăng ký SAU khi chạy file này mới là PENDING.
-- ADMIN kích hoạt thành viên => email của thành viên được đánh dấu đã xác nhận (đăng nhập được ngay).
-- Quyền ở database đã có sẵn và vẫn đúng với PENDING:
--   - is_admin() chỉ nhận ADMIN có status = 'ACTIVE'
--   - request_enrollment() (đăng ký học) chỉ nhận thành viên có status = 'ACTIVE'
-- =========================================================

-- ---------- Cho phép trạng thái PENDING ----------
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check check (status in ('PENDING', 'ACTIVE', 'INACTIVE'));

-- ---------- Tài khoản mới tạo ở trạng thái PENDING ----------
-- Role luôn là USER, status luôn là PENDING, bỏ qua mọi giá trị do frontend gửi lên.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, email, full_name, role, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'USER',
    'PENDING'
  );
  return new;
end;
$$;

-- ---------- Đổi role / status ----------
-- Chỉ ADMIN (hoặc SQL trực tiếp) được đổi; ADMIN không được tự đổi role/status của chính mình
-- để tránh tự khóa mình khỏi trang quản trị.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and auth.uid() is not null then
    if not public.is_admin() then
      raise exception 'Not allowed to change role or status';
    end if;
    if new.id = auth.uid() then
      raise exception 'Not allowed to change your own role or status';
    end if;
  end if;
  return new;
end;
$$;

-- ---------- Kích hoạt = xác nhận email ----------
-- Supabase Auth đang bật "Confirm email": tài khoản chưa xác nhận email bị chặn đăng nhập
-- ("Email not confirmed") dù đã được kích hoạt. Quy trình của Học Vèo là ADMIN kích hoạt (đã liên hệ
-- trực tiếp với thành viên), nên khi ADMIN kích hoạt thì đánh dấu email đã xác nhận luôn.
create or replace function public.confirm_email_on_activate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ACTIVE' and old.status is distinct from 'ACTIVE' then
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_confirm_email_on_activate on public.profiles;
create trigger trg_profiles_confirm_email_on_activate
  after update of status on public.profiles
  for each row execute function public.confirm_email_on_activate();

-- Trigger functions không cần gọi trực tiếp
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prevent_role_change() from public, anon, authenticated;
revoke execute on function public.confirm_email_on_activate() from public, anon, authenticated;

-- ---------- Sửa dữ liệu cũ ----------
-- Thành viên đang ACTIVE nhưng chưa xác nhận email (đăng ký trước khi chạy file này) không đăng nhập được:
-- xác nhận email cho họ. Chỉ chạm tới tài khoản ACTIVE, không đổi trạng thái của ai.
update auth.users u
set email_confirmed_at = now()
from public.profiles p
where p.id = u.id
  and p.status = 'ACTIVE'
  and u.email_confirmed_at is null;

-- Lọc nhanh tài khoản chờ kích hoạt (đã có idx_profiles_status từ 05_users.sql)
create index if not exists idx_profiles_status on public.profiles (status);
