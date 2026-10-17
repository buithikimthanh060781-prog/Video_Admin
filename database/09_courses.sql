-- =========================================================
-- 09_COURSES: khóa học online (lĩnh vực, khóa học, chương, bài học)
-- Chạy trong Supabase SQL Editor sau 01..08. Script chạy lại nhiều lần an toàn.
-- Phụ thuộc: public.profiles, public.videos, public.is_admin(), public.set_updated_at().
-- Không sửa bảng cũ. Video gốc (public.videos) chỉ được tham chiếu, không bị sao chép/xóa.
-- =========================================================

-- ---------- course_categories (lĩnh vực khóa học) ----------
create table if not exists public.course_categories (
  id bigint primary key generated always as identity,
  name text not null unique,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.course_categories drop constraint if exists course_categories_slug_format;
alter table public.course_categories
  add constraint course_categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- ---------- courses ----------
-- price/sale_price: số nguyên VNĐ (không dùng số thực cho tiền).
create table if not exists public.courses (
  id bigint primary key generated always as identity,
  code text not null unique,
  title text not null,
  slug text not null unique,
  category_id bigint references public.course_categories(id) on delete restrict,
  instructor_name text,
  short_description text,
  description text,
  target_audience text,
  learning_outcomes text,
  requirements text,
  level text not null default 'BEGINNER',
  language text not null default 'vi',
  thumbnail_url text,
  price bigint not null default 0,
  sale_price bigint,
  status text not null default 'DRAFT',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.courses drop constraint if exists courses_slug_format;
alter table public.courses
  add constraint courses_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.courses drop constraint if exists courses_code_not_blank;
alter table public.courses
  add constraint courses_code_not_blank check (length(trim(code)) > 0);

alter table public.courses drop constraint if exists courses_title_not_blank;
alter table public.courses
  add constraint courses_title_not_blank check (length(trim(title)) > 0);

alter table public.courses drop constraint if exists courses_level_check;
alter table public.courses
  add constraint courses_level_check check (level in ('BEGINNER', 'INTERMEDIATE', 'ADVANCED'));

alter table public.courses drop constraint if exists courses_status_check;
alter table public.courses
  add constraint courses_status_check check (status in ('DRAFT', 'PUBLISHED', 'HIDDEN'));

alter table public.courses drop constraint if exists courses_price_check;
alter table public.courses
  add constraint courses_price_check check (price >= 0);

alter table public.courses drop constraint if exists courses_sale_price_check;
alter table public.courses
  add constraint courses_sale_price_check check (sale_price is null or (sale_price >= 0 and sale_price <= price));

-- Không cho xuất bản khóa học thiếu thông tin bắt buộc (chặn cả khi gọi trực tiếp qua API).
alter table public.courses drop constraint if exists courses_publish_requirements;
alter table public.courses
  add constraint courses_publish_requirements check (
    status <> 'PUBLISHED'
    or (category_id is not null and nullif(trim(thumbnail_url), '') is not null)
  );

-- ---------- course_sections (chương) ----------
create table if not exists public.course_sections (
  id bigint primary key generated always as identity,
  course_id bigint not null references public.courses(id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.course_sections drop constraint if exists course_sections_title_not_blank;
alter table public.course_sections
  add constraint course_sections_title_not_blank check (length(trim(title)) > 0);

-- ---------- course_lessons (bài học) ----------
-- video_id: tham chiếu video gốc. Video bị xóa -> video_id = NULL, bài học vẫn còn để ADMIN thấy cảnh báo.
-- Xóa bài học/chương/khóa học chỉ xóa liên kết, không bao giờ xóa video gốc.
create table if not exists public.course_lessons (
  id bigint primary key generated always as identity,
  section_id bigint not null references public.course_sections(id) on delete cascade,
  video_id bigint references public.videos(id) on delete set null,
  title text not null,
  description text,
  sort_order integer not null default 0,
  is_preview boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.course_lessons drop constraint if exists course_lessons_title_not_blank;
alter table public.course_lessons
  add constraint course_lessons_title_not_blank check (length(trim(title)) > 0);

-- ---------- Indexes ----------
create index if not exists idx_course_categories_sort on public.course_categories (is_active, sort_order, name);
create index if not exists idx_courses_category_id on public.courses (category_id);
create index if not exists idx_courses_status_sort on public.courses (status, sort_order, created_at desc);
create index if not exists idx_courses_created_by on public.courses (created_by);
create index if not exists idx_course_sections_course_sort on public.course_sections (course_id, sort_order);
create index if not exists idx_course_lessons_section_sort on public.course_lessons (section_id, sort_order);
create index if not exists idx_course_lessons_video_id on public.course_lessons (video_id);

-- ---------- updated_at triggers ----------
drop trigger if exists trg_course_categories_updated_at on public.course_categories;
create trigger trg_course_categories_updated_at
  before update on public.course_categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

drop trigger if exists trg_course_sections_updated_at on public.course_sections;
create trigger trg_course_sections_updated_at
  before update on public.course_sections
  for each row execute function public.set_updated_at();

drop trigger if exists trg_course_lessons_updated_at on public.course_lessons;
create trigger trg_course_lessons_updated_at
  before update on public.course_lessons
  for each row execute function public.set_updated_at();

-- ---------- Grants ----------
-- Khách (anon) chỉ được đọc; ghi do RLS giới hạn cho ADMIN (authenticated).
revoke insert, update, delete, truncate on
  public.course_categories, public.courses, public.course_sections, public.course_lessons
  from anon;
revoke truncate on
  public.course_categories, public.courses, public.course_sections, public.course_lessons
  from authenticated;
grant select on
  public.course_categories, public.courses, public.course_sections, public.course_lessons
  to anon, authenticated;
grant insert, update, delete on
  public.course_categories, public.courses, public.course_sections, public.course_lessons
  to authenticated;

-- ---------- RLS ----------
alter table public.course_categories enable row level security;
alter table public.courses enable row level security;
alter table public.course_sections enable row level security;
alter table public.course_lessons enable row level security;

-- course_categories: khách/USER chỉ thấy lĩnh vực đang bật; ADMIN thấy và ghi tất cả.
drop policy if exists "course_categories_select_public" on public.course_categories;
create policy "course_categories_select_public" on public.course_categories
  for select to anon, authenticated
  using (is_active);

drop policy if exists "course_categories_select_admin" on public.course_categories;
create policy "course_categories_select_admin" on public.course_categories
  for select to authenticated
  using (public.is_admin());

drop policy if exists "course_categories_insert_admin" on public.course_categories;
create policy "course_categories_insert_admin" on public.course_categories
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "course_categories_update_admin" on public.course_categories;
create policy "course_categories_update_admin" on public.course_categories
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "course_categories_delete_admin" on public.course_categories;
create policy "course_categories_delete_admin" on public.course_categories
  for delete to authenticated
  using (public.is_admin());

-- courses: khách/USER chỉ thấy khóa học PUBLISHED (DRAFT/HIDDEN không lộ ra ngoài).
drop policy if exists "courses_select_published" on public.courses;
create policy "courses_select_published" on public.courses
  for select to anon, authenticated
  using (status = 'PUBLISHED');

drop policy if exists "courses_select_admin" on public.courses;
create policy "courses_select_admin" on public.courses
  for select to authenticated
  using (public.is_admin());

drop policy if exists "courses_insert_admin" on public.courses;
create policy "courses_insert_admin" on public.courses
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "courses_update_admin" on public.courses;
create policy "courses_update_admin" on public.courses
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "courses_delete_admin" on public.courses;
create policy "courses_delete_admin" on public.courses
  for delete to authenticated
  using (public.is_admin());

-- course_sections: công khai khi khóa học PUBLISHED (subquery chạy dưới RLS của courses).
drop policy if exists "course_sections_select_published" on public.course_sections;
create policy "course_sections_select_published" on public.course_sections
  for select to anon, authenticated
  using (exists (select 1 from public.courses c where c.id = course_id));

drop policy if exists "course_sections_select_admin" on public.course_sections;
create policy "course_sections_select_admin" on public.course_sections
  for select to authenticated
  using (public.is_admin());

drop policy if exists "course_sections_insert_admin" on public.course_sections;
create policy "course_sections_insert_admin" on public.course_sections
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "course_sections_update_admin" on public.course_sections;
create policy "course_sections_update_admin" on public.course_sections
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "course_sections_delete_admin" on public.course_sections;
create policy "course_sections_delete_admin" on public.course_sections
  for delete to authenticated
  using (public.is_admin());

-- course_lessons: công khai (tiêu đề, mô tả, thứ tự) khi chương thuộc khóa học PUBLISHED và bài đang bật.
-- Chỉ lộ video_id (số), KHÔNG cấp quyền đọc file video: RLS của videos/storage giữ nguyên.
drop policy if exists "course_lessons_select_published" on public.course_lessons;
create policy "course_lessons_select_published" on public.course_lessons
  for select to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.course_sections s where s.id = section_id)
  );

drop policy if exists "course_lessons_select_admin" on public.course_lessons;
create policy "course_lessons_select_admin" on public.course_lessons
  for select to authenticated
  using (public.is_admin());

drop policy if exists "course_lessons_insert_admin" on public.course_lessons;
create policy "course_lessons_insert_admin" on public.course_lessons
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "course_lessons_update_admin" on public.course_lessons;
create policy "course_lessons_update_admin" on public.course_lessons
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "course_lessons_delete_admin" on public.course_lessons;
create policy "course_lessons_delete_admin" on public.course_lessons
  for delete to authenticated
  using (public.is_admin());
