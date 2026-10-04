-- =========================================================
-- PHASE 8 - CATEGORY MANAGEMENT: ADMIN ghi video_categories
-- (SELECT cho authenticated đã có trong 03_dashboard.sql)
-- =========================================================

drop policy if exists "categories_insert_admin" on public.video_categories;
create policy "categories_insert_admin" on public.video_categories
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "categories_update_admin" on public.video_categories;
create policy "categories_update_admin" on public.video_categories
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "categories_delete_admin" on public.video_categories;
create policy "categories_delete_admin" on public.video_categories
  for delete to authenticated
  using (public.is_admin());

-- Slug chỉ gồm a-z, 0-9 và dấu gạch ngang
alter table public.video_categories drop constraint if exists video_categories_slug_format;
alter table public.video_categories
  add constraint video_categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
