-- =========================================================
-- 09_SECURITY: siết quyền sau khi audit
-- =========================================================

-- ---------- profiles: chỉ cho update các cột được phép ----------
-- username/email do hệ thống quản lý (đồng bộ với Supabase Auth), không cho sửa qua API.
-- role/status: trigger prevent_role_change chỉ cho ADMIN đổi.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, role, status) on public.profiles to authenticated;

-- avatar_url chỉ được trỏ tới folder của chính user trong bucket avatars
alter table public.profiles drop constraint if exists profiles_avatar_url_own_folder;
alter table public.profiles
  add constraint profiles_avatar_url_own_folder check (
    avatar_url is null
    or avatar_url like 'https://laoxrsdemwvwcpqjqecq.supabase.co/storage/v1/object/public/avatars/' || id::text || '/%'
  );

-- ---------- Functions: thu hẹp quyền EXECUTE ----------
-- Trigger functions không cần gọi trực tiếp.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.increment_video_views() from public, anon, authenticated;
revoke execute on function public.prevent_role_change() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- is_admin dùng trong policies cho user đã đăng nhập
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- is_username_available dùng ở trang Register (chưa đăng nhập)
revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ---------- video_views: chỉ ghi lượt xem cho video user được phép xem ----------
-- Subquery chạy dưới RLS của videos: USER chỉ thấy video PUBLISHED.
drop policy if exists "video_views_insert_own" on public.video_views;
create policy "video_views_insert_own" on public.video_views
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.videos v where v.id = video_id)
  );

-- ---------- site_settings ----------
drop policy if exists "site_settings_select_authenticated" on public.site_settings;
create policy "site_settings_select_authenticated" on public.site_settings
  for select to authenticated
  using (true);

drop policy if exists "site_settings_update_admin" on public.site_settings;
create policy "site_settings_update_admin" on public.site_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Bảng khác: anon không có quyền ghi ----------
revoke insert, update, delete, truncate on public.videos, public.video_categories,
  public.video_views, public.site_settings from anon;
