-- =========================================================
-- 15_MEMBER_PHONE: số điện thoại của thành viên + nút "Đăng ký" khóa học không cần popup
-- Chạy sau 01..14. Script chạy lại nhiều lần an toàn.
--
-- - profiles.phone: số điện thoại nhập khi đăng ký thành viên (ADMIN xem ở trang Quản lý thành viên).
--   Tài khoản cũ chưa có số điện thoại thì để trống (NULL).
-- - request_enrollment(): không bắt buộc truyền số điện thoại; lấy số trong hồ sơ thành viên.
-- - Tên đăng nhập: bỏ giới hạn định dạng (cho phép tiếng Việt có dấu, khoảng trắng); vẫn không trùng nhau.
-- =========================================================

-- ---------- profiles.phone ----------
alter table public.profiles add column if not exists phone text;

alter table public.profiles drop constraint if exists profiles_phone_format;
alter table public.profiles
  add constraint profiles_phone_format check (phone is null or phone ~ '^[0-9+ .()-]{8,20}$');

-- ---------- Tạo profile khi đăng ký: lưu cả số điện thoại ----------
-- Role luôn USER, status luôn PENDING (14_member_activation.sql). Số điện thoại sai định dạng thì bỏ qua.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
begin
  if v_phone is not null and v_phone !~ '^[0-9+ .()-]{8,20}$' then
    v_phone := null;
  end if;

  insert into public.profiles (id, username, email, full_name, role, status, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'USER',
    'PENDING',
    v_phone
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- Đăng ký học: dùng số điện thoại trong hồ sơ ----------
-- p_phone để trống -> lấy profiles.phone. Thành viên chưa có số điện thoại vẫn đăng ký được
-- (quản trị viên liên hệ qua email).
create or replace function public.request_enrollment(p_course_id bigint, p_phone text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text := nullif(trim(p_phone), '');
  v_note text := nullif(trim(p_note), '');
  v_status text;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles where id = v_user_id and status = 'ACTIVE'
  ) then
    raise exception 'Tài khoản chưa được kích hoạt, không thể đăng ký học' using errcode = '42501';
  end if;
  if not exists (select 1 from public.courses where id = p_course_id and status = 'PUBLISHED') then
    raise exception 'Khóa học không tồn tại hoặc chưa công khai' using errcode = 'P0002';
  end if;
  if v_phone is null then
    select phone into v_phone from public.profiles where id = v_user_id;
  end if;
  if v_phone is not null and v_phone !~ '^[0-9+ .()-]{8,20}$' then
    raise exception 'Số điện thoại không hợp lệ' using errcode = '22023';
  end if;
  if coalesce(length(v_note), 0) > 1000 then
    raise exception 'Lời nhắn quá dài (tối đa 1000 ký tự)' using errcode = '22023';
  end if;

  select status into v_status
  from public.course_enrollments
  where course_id = p_course_id and user_id = v_user_id
  for update;

  if v_status is null then
    insert into public.course_enrollments (course_id, user_id, status, phone, note)
    values (p_course_id, v_user_id, 'PENDING', v_phone, v_note)
    on conflict (course_id, user_id) do nothing;
    return 'PENDING';
  elsif v_status = 'ACTIVE' then
    return 'ACTIVE';
  else
    update public.course_enrollments
    set status = 'PENDING', phone = v_phone, note = v_note
    where course_id = p_course_id and user_id = v_user_id;
    return 'PENDING';
  end if;
end;
$$;

revoke execute on function public.request_enrollment(bigint, text, text) from public, anon;
grant execute on function public.request_enrollment(bigint, text, text) to authenticated;

-- Tìm thành viên theo số điện thoại (trang Quản lý thành viên)
create index if not exists idx_profiles_phone on public.profiles (phone);

-- ---------- Sửa dữ liệu cũ ----------
-- Thành viên đăng ký (form đã có ô SĐT) TRƯỚC khi chạy file này: số điện thoại chỉ nằm trong Supabase Auth
-- (raw_user_meta_data) -> chép sang hồ sơ. Chỉ điền khi hồ sơ chưa có số và số đúng định dạng.
update public.profiles p
set phone = trim(u.raw_user_meta_data ->> 'phone')
from auth.users u
where u.id = p.id
  and p.phone is null
  and trim(u.raw_user_meta_data ->> 'phone') ~ '^[0-9+ .()-]{8,20}$';
