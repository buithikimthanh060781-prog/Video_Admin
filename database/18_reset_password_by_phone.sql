-- =========================================================
-- 18_RESET_PASSWORD_BY_PHONE: quên mật khẩu = nhập email + số điện thoại + mật khẩu mới
-- Chạy sau 15_member_phone.sql. Script chạy lại nhiều lần an toàn.
--
-- Email và số điện thoại phải KHỚP với hồ sơ thành viên thì mật khẩu mới được đổi ngay (đăng nhập được liền).
-- Các lớp bảo vệ (số điện thoại dễ đoán hơn mật khẩu nên không được bỏ):
--   - Chỉ áp dụng cho thành viên (USER) đang hoạt động. Tài khoản ADMIN KHÔNG đổi được bằng cách này
--     (admin đổi mật khẩu trong Supabase → Authentication → Users).
--   - Sai quá 5 lần trong 1 giờ (theo email) thì khóa 1 giờ.
--   - Không cho biết email có tồn tại hay không: sai email hay sai số điện thoại đều trả về cùng một kết quả.
--   - Đổi xong thì đăng xuất mọi phiên đang đăng nhập của tài khoản đó.
-- =========================================================

-- ---------- Nhật ký các lần thử (không ai đọc được từ frontend) ----------
create table if not exists public.password_reset_attempts (
  id bigint primary key generated always as identity,
  email text not null,
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_password_reset_attempts_email_time
  on public.password_reset_attempts (email, attempted_at desc);

alter table public.password_reset_attempts enable row level security;
revoke all on public.password_reset_attempts from anon, authenticated;

-- ---------- Hàm đổi mật khẩu ----------
-- Trả về true nếu đổi thành công, false nếu email / số điện thoại không đúng.
create or replace function public.reset_password_with_phone(p_email text, p_phone text, p_new_password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_user_id uuid;
  v_failures integer;
begin
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Mật khẩu phải có ít nhất 6 ký tự' using errcode = '22023';
  end if;

  select count(*) into v_failures
  from public.password_reset_attempts
  where email = v_email and not success and attempted_at > now() - interval '1 hour';
  if v_failures >= 5 then
    raise exception 'Bạn nhập sai quá nhiều lần. Vui lòng thử lại sau 1 giờ' using errcode = 'P0001';
  end if;

  -- So sánh số điện thoại theo chữ số (bỏ khoảng trắng, dấu chấm, gạch ngang...)
  select p.id into v_user_id
  from public.profiles p
  where lower(p.email) = v_email
    and p.role = 'USER'
    and p.status = 'ACTIVE'
    and p.phone is not null
    and v_digits <> ''
    and regexp_replace(p.phone, '\D', '', 'g') = v_digits;

  if v_user_id is null then
    insert into public.password_reset_attempts (email, success) values (v_email, false);
    return false;
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;

  -- Đăng xuất mọi thiết bị đang dùng mật khẩu cũ
  delete from auth.sessions where user_id = v_user_id;

  delete from public.password_reset_attempts where email = v_email;
  return true;
end;
$$;

revoke execute on function public.reset_password_with_phone(text, text, text) from public;
grant execute on function public.reset_password_with_phone(text, text, text) to anon, authenticated;
