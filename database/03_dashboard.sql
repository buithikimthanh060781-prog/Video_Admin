-- =========================================================
-- 05_DASHBOARD: policies đọc dữ liệu, theo dõi lượt xem, RPC thống kê
-- =========================================================

-- ---------- Policies: video_categories ----------
drop policy if exists "categories_select_authenticated" on public.video_categories;
create policy "categories_select_authenticated" on public.video_categories
  for select to authenticated
  using (true);

-- ---------- Policies: videos ----------
drop policy if exists "videos_select_published" on public.videos;
create policy "videos_select_published" on public.videos
  for select to authenticated
  using (status = 'PUBLISHED');

drop policy if exists "videos_select_admin" on public.videos;
create policy "videos_select_admin" on public.videos
  for select to authenticated
  using (public.is_admin());

-- ---------- Policies: video_views ----------
drop policy if exists "video_views_insert_own" on public.video_views;
create policy "video_views_insert_own" on public.video_views
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "video_views_select_admin" on public.video_views;
create policy "video_views_select_admin" on public.video_views
  for select to authenticated
  using (public.is_admin());

-- ---------- Theo dõi lượt xem: mỗi record video_views tăng videos.views ----------
create or replace function public.increment_video_views()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.videos set views = views + 1 where id = new.video_id;
  return new;
end;
$$;

drop trigger if exists trg_video_views_increment on public.video_views;
create trigger trg_video_views_increment
  after insert on public.video_views
  for each row execute function public.increment_video_views();

-- ---------- RPC: thống kê tổng (chỉ ADMIN) ----------
create or replace function public.get_dashboard_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return json_build_object(
    'total_videos', (select count(*) from public.videos),
    'total_views', (select coalesce(sum(views), 0) from public.videos),
    'storage_used', (select coalesce(sum(file_size), 0) from public.videos),
    'total_users', (select count(*) from public.profiles)
  );
end;
$$;

-- ---------- RPC: lượt xem theo ngày/tháng (chỉ ADMIN) ----------
-- Trả về đủ mọi mốc thời gian trong khoảng (mốc không có lượt xem = 0).
create or replace function public.get_views_over_time(
  p_from timestamptz,
  p_to timestamptz,
  p_interval text default 'day',
  p_timezone text default 'UTC'
)
returns table (bucket date, views bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_interval not in ('day', 'month') then
    raise exception 'Invalid interval' using errcode = '22023';
  end if;

  return query
  with buckets as (
    select generate_series(
      date_trunc(p_interval, p_from at time zone p_timezone),
      date_trunc(p_interval, p_to at time zone p_timezone),
      ('1 ' || p_interval)::interval
    )::date as bucket
  ),
  counts as (
    select date_trunc(p_interval, vv.viewed_at at time zone p_timezone)::date as bucket,
           count(*) as views
    from public.video_views vv
    where vv.viewed_at >= p_from and vv.viewed_at < p_to
    group by 1
  )
  select b.bucket, coalesce(c.views, 0)::bigint
  from buckets b
  left join counts c on c.bucket = b.bucket
  order by b.bucket;
end;
$$;

revoke execute on function public.get_dashboard_stats() from public, anon;
revoke execute on function public.get_views_over_time(timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.get_dashboard_stats() to authenticated;
grant execute on function public.get_views_over_time(timestamptz, timestamptz, text, text) to authenticated;
