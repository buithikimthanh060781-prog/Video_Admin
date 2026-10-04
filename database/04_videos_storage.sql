-- =========================================================
-- 06_VIDEO_MANAGEMENT + 08_SUPABASE_STORAGE
-- Policies ghi cho videos, Storage buckets và storage policies
-- =========================================================

-- ---------- Policies: videos (ADMIN ghi) ----------
drop policy if exists "videos_insert_admin" on public.videos;
create policy "videos_insert_admin" on public.videos
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "videos_update_admin" on public.videos;
create policy "videos_update_admin" on public.videos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "videos_delete_admin" on public.videos;
create policy "videos_delete_admin" on public.videos
  for delete to authenticated
  using (public.is_admin());

-- ---------- Buckets ----------
-- thumbnails/avatars: public (đọc qua public URL). videos: private (dùng signed URL).
-- Giới hạn dung lượng + MIME type được Supabase kiểm tra ở server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('thumbnails', 'thumbnails', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('videos', 'videos', false, 52428800, array['video/mp4', 'video/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Storage policies: thumbnails + videos ----------
-- Chỉ ADMIN upload/update/delete, và chỉ trong folder của chính mình (userId/...).
drop policy if exists "admin_media_insert" on storage.objects;
create policy "admin_media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('thumbnails', 'videos')
    and public.is_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "admin_media_update" on storage.objects;
create policy "admin_media_update" on storage.objects
  for update to authenticated
  using (bucket_id in ('thumbnails', 'videos') and public.is_admin())
  with check (bucket_id in ('thumbnails', 'videos') and public.is_admin());

drop policy if exists "admin_media_delete" on storage.objects;
create policy "admin_media_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('thumbnails', 'videos') and public.is_admin());

-- ADMIN đọc mọi object (cần để tạo signed URL / list).
drop policy if exists "admin_media_select" on storage.objects;
create policy "admin_media_select" on storage.objects
  for select to authenticated
  using (bucket_id in ('thumbnails', 'videos') and public.is_admin());

-- USER đã đăng nhập được tạo signed URL cho file của video PUBLISHED.
drop policy if exists "videos_select_published_file" on storage.objects;
create policy "videos_select_published_file" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'videos'
    and exists (
      select 1 from public.videos v
      where v.storage_path = storage.objects.name and v.status = 'PUBLISHED'
    )
  );

-- ---------- Storage policies: avatars ----------
-- Mỗi user chỉ ghi vào folder của mình; ADMIN quản lý tất cả.
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
