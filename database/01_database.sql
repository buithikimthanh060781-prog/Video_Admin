-- =========================================================
-- 02_DATABASE: Tables, relationships, indexes
-- Chạy trong Supabase SQL Editor. Script chạy lại nhiều lần an toàn.
-- =========================================================

-- ---------- profiles ----------
-- Không lưu password: password do Supabase Auth quản lý.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text unique not null,
  full_name text,
  avatar_url text,
  role text not null default 'USER' check (role in ('ADMIN', 'USER')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- video_categories ----------
create table if not exists public.video_categories (
  id bigint primary key generated always as identity,
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz default now()
);

-- ---------- videos ----------
create table if not exists public.videos (
  id bigint primary key generated always as identity,
  title text not null,
  slug text unique,
  description text,
  thumbnail_url text,
  video_url text,
  storage_path text,
  category_id bigint references public.video_categories(id) on delete set null,
  views bigint not null default 0,
  status text not null default 'PUBLISHED' check (status in ('PUBLISHED', 'DRAFT', 'HIDDEN')),
  duration integer,
  file_size bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- video_views ----------
create table if not exists public.video_views (
  id bigint primary key generated always as identity,
  video_id bigint references public.videos(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  viewed_at timestamptz default now()
);

-- ---------- site_settings ----------
create table if not exists public.site_settings (
  id bigint primary key generated always as identity,
  site_name text,
  logo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- Indexes ----------
create index if not exists idx_videos_views on public.videos (views desc);
create index if not exists idx_videos_category_id on public.videos (category_id);
create index if not exists idx_videos_created_at on public.videos (created_at desc);
create index if not exists idx_video_views_video_id on public.video_views (video_id);
create index if not exists idx_video_views_viewed_at on public.video_views (viewed_at);
create index if not exists idx_profiles_role on public.profiles (role);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_videos_updated_at on public.videos;
create trigger trg_videos_updated_at
  before update on public.videos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ---------- Enable RLS (mặc định chặn tất cả; policies thêm ở các bước sau) ----------
alter table public.profiles enable row level security;
alter table public.video_categories enable row level security;
alter table public.videos enable row level security;
alter table public.video_views enable row level security;
alter table public.site_settings enable row level security;

-- ---------- Seed site_settings ----------
insert into public.site_settings (site_name)
select 'Video Admin'
where not exists (select 1 from public.site_settings);
