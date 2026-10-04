-- =========================================================
-- DEV ONLY: dữ liệu mẫu cho Dashboard (categories, videos, video_views)
-- Chỉ chạy khi bảng videos đang trống.
-- =========================================================
do $$
declare
  v_admin_id uuid;
  v_video record;
  v_view_count integer;
  v_user_ids uuid[];
begin
  if exists (select 1 from public.videos) then
    raise notice 'videos already has data, skip seeding';
    return;
  end if;

  select id into v_admin_id from public.profiles where email = 'admin1@gmail.com';
  select array_agg(id) into v_user_ids from public.profiles;

  insert into public.video_categories (name, slug, description) values
    ('Giáo dục', 'giao-duc', 'Video bài giảng, hướng dẫn học tập'),
    ('Giải trí', 'giai-tri', 'Video giải trí, hài hước'),
    ('Âm nhạc', 'am-nhac', 'MV, live performance'),
    ('Thể thao', 'the-thao', 'Highlight, phân tích trận đấu'),
    ('Công nghệ', 'cong-nghe', 'Review, tin tức công nghệ')
  on conflict (slug) do nothing;

  insert into public.videos (title, slug, description, thumbnail_url, category_id, status, duration, file_size, created_by, created_at)
  select
    t.title,
    t.slug,
    'Mô tả cho video ' || t.title,
    'https://picsum.photos/seed/' || t.slug || '/320/180',
    (select id from public.video_categories where slug = t.category_slug),
    t.status,
    60 + floor(random() * 1500)::int,
    (20 + floor(random() * 780))::bigint * 1024 * 1024,
    v_admin_id,
    now() - (t.age_days || ' days')::interval
  from (values
    ('Học JavaScript cơ bản trong 60 phút', 'hoc-javascript-co-ban', 'giao-duc', 'PUBLISHED', 300),
    ('HTML & CSS cho người mới bắt đầu', 'html-css-nguoi-moi', 'giao-duc', 'PUBLISHED', 280),
    ('Supabase từ A đến Z', 'supabase-a-z', 'cong-nghe', 'PUBLISHED', 200),
    ('Review laptop văn phòng 2026', 'review-laptop-2026', 'cong-nghe', 'PUBLISHED', 150),
    ('Top 10 bàn thắng đẹp nhất tuần', 'top-10-ban-thang', 'the-thao', 'PUBLISHED', 120),
    ('Phân tích chiến thuật bóng đá', 'phan-tich-chien-thuat', 'the-thao', 'PUBLISHED', 100),
    ('Live acoustic cuối tuần', 'live-acoustic', 'am-nhac', 'PUBLISHED', 90),
    ('MV ca nhạc mới nhất', 'mv-moi-nhat', 'am-nhac', 'PUBLISHED', 75),
    ('Hài kịch ngắn: Một ngày đi làm', 'hai-kich-di-lam', 'giai-tri', 'PUBLISHED', 60),
    ('Vlog du lịch Đà Lạt', 'vlog-da-lat', 'giai-tri', 'PUBLISHED', 45),
    ('Tự học SQL với PostgreSQL', 'tu-hoc-sql', 'giao-duc', 'PUBLISHED', 30),
    ('Mẹo dùng Chart.js hiệu quả', 'meo-chartjs', 'cong-nghe', 'PUBLISHED', 20),
    ('Highlight trận chung kết', 'highlight-chung-ket', 'the-thao', 'PUBLISHED', 10),
    ('Bản nháp: Hướng dẫn Git', 'nhap-huong-dan-git', 'giao-duc', 'DRAFT', 5),
    ('Bản nháp: Podcast công nghệ', 'nhap-podcast', 'cong-nghe', 'DRAFT', 2)
  ) as t(title, slug, category_slug, status, age_days);

  -- Lượt xem ngẫu nhiên trong khoảng từ ngày đăng video đến hiện tại.
  -- Trigger trg_video_views_increment tự cập nhật videos.views.
  for v_video in select id, created_at from public.videos where status = 'PUBLISHED' loop
    v_view_count := 20 + floor(random() * 380)::int;
    insert into public.video_views (video_id, user_id, viewed_at)
    select
      v_video.id,
      v_user_ids[1 + floor(random() * array_length(v_user_ids, 1))::int],
      v_video.created_at + random() * (now() - v_video.created_at)
    from generate_series(1, v_view_count);
  end loop;
end;
$$;
