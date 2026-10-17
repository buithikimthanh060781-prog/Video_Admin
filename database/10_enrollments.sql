-- =========================================================
-- 10_ENROLLMENTS: đăng ký học (tư vấn -> admin kích hoạt), tiến độ học, bảo vệ video khóa học
-- Chạy sau 01..09. Script chạy lại nhiều lần an toàn.
--
-- LƯU Ý: file này THAY policy "videos_select_published" (03_dashboard.sql) và
-- "videos_select_published_file" (04_videos_storage.sql). Nếu chạy lại 03 hoặc 04,
-- phải chạy lại file này ngay sau đó, nếu không video khóa học sẽ bị lộ trở lại.
-- =========================================================

-- ---------- course_enrollments ----------
-- PENDING: chờ admin xử lý · ACTIVE: đã kích hoạt, được học · REJECTED: từ chối · REVOKED: đã thu hồi
create table if not exists public.course_enrollments (
  id bigint primary key generated always as identity,
  course_id bigint not null,
  user_id uuid not null,
  status text not null default 'PENDING',
  phone text,
  note text,
  admin_note text,
  activated_at timestamptz,
  activated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_enrollments_course_id_fkey foreign key (course_id) references public.courses(id) on delete cascade,
  constraint course_enrollments_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint course_enrollments_activated_by_fkey foreign key (activated_by) references public.profiles(id) on delete set null,
  constraint course_enrollments_course_user_key unique (course_id, user_id)
);

alter table public.course_enrollments drop constraint if exists course_enrollments_status_check;
alter table public.course_enrollments
  add constraint course_enrollments_status_check check (status in ('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED'));

alter table public.course_enrollments drop constraint if exists course_enrollments_text_length_check;
alter table public.course_enrollments
  add constraint course_enrollments_text_length_check check (
    coalesce(length(phone), 0) <= 20
    and coalesce(length(note), 0) <= 1000
    and coalesce(length(admin_note), 0) <= 1000
  );

create index if not exists idx_course_enrollments_user_status on public.course_enrollments (user_id, status);
create index if not exists idx_course_enrollments_status_created on public.course_enrollments (status, created_at desc);
create index if not exists idx_course_enrollments_course on public.course_enrollments (course_id);

drop trigger if exists trg_course_enrollments_updated_at on public.course_enrollments;
create trigger trg_course_enrollments_updated_at
  before update on public.course_enrollments
  for each row execute function public.set_updated_at();

-- Ghi lại ai kích hoạt, lúc nào; không cho đổi khóa học / học viên của một đăng ký
create or replace function public.handle_enrollment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.course_id is distinct from old.course_id or new.user_id is distinct from old.user_id then
    raise exception 'Not allowed to change course or user of an enrollment';
  end if;
  if new.status = 'ACTIVE' and old.status is distinct from 'ACTIVE' then
    new.activated_at = now();
    new.activated_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_course_enrollments_handle_update on public.course_enrollments;
create trigger trg_course_enrollments_handle_update
  before update on public.course_enrollments
  for each row execute function public.handle_enrollment_update();

-- ---------- lesson_progress (bài đã học xong) ----------
create table if not exists public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id bigint not null references public.course_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists idx_lesson_progress_lesson on public.lesson_progress (lesson_id);

-- ---------- Helper functions (security definer: đọc bảng không phụ thuộc RLS, không lộ dữ liệu) ----------

-- User hiện tại có đăng ký ACTIVE cho khóa học
create or replace function public.has_active_enrollment(p_course_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.course_enrollments e
    where e.course_id = p_course_id and e.user_id = auth.uid() and e.status = 'ACTIVE'
  );
$$;

-- Khóa học chứa bài học
create or replace function public.get_lesson_course_id(p_lesson_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select s.course_id
  from public.course_lessons l
  join public.course_sections s on s.id = l.section_id
  where l.id = p_lesson_id;
$$;

-- Quyền xem 1 video (dòng videos + file trong Storage):
--  - ADMIN: luôn được xem
--  - Video không thuộc khóa học nào: như cũ (ai đăng nhập cũng xem được nếu PUBLISHED)
--  - Video thuộc khóa học: chỉ học viên ACTIVE của khóa học đó, hoặc bài "Học thử" của khóa học đang công khai
create or replace function public.can_view_video(p_video_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or not exists (select 1 from public.course_lessons l where l.video_id = p_video_id)
    or exists (
      select 1
      from public.course_lessons l
      join public.course_sections s on s.id = l.section_id
      join public.courses c on c.id = s.course_id
      where l.video_id = p_video_id
        and (
          exists (
            select 1 from public.course_enrollments e
            where e.course_id = c.id and e.user_id = auth.uid() and e.status = 'ACTIVE'
          )
          or (l.is_preview and l.is_active and c.status = 'PUBLISHED')
        )
    );
$$;

-- Thành viên gửi yêu cầu đăng ký tư vấn. Trả về trạng thái sau khi gửi.
-- Dùng RPC thay vì cho INSERT/UPDATE trực tiếp để thành viên không thể tự kích hoạt.
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
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.courses where id = p_course_id and status = 'PUBLISHED') then
    raise exception 'Course not available' using errcode = 'P0002';
  end if;
  if v_phone is null or v_phone !~ '^[0-9+ .()-]{8,20}$' then
    raise exception 'Invalid phone' using errcode = '22023';
  end if;
  if coalesce(length(v_note), 0) > 1000 then
    raise exception 'Note too long' using errcode = '22023';
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

revoke execute on function public.has_active_enrollment(bigint) from public, anon;
revoke execute on function public.get_lesson_course_id(bigint) from public, anon;
revoke execute on function public.can_view_video(bigint) from public, anon;
revoke execute on function public.request_enrollment(bigint, text, text) from public, anon;
revoke execute on function public.handle_enrollment_update() from public, anon, authenticated;
grant execute on function public.has_active_enrollment(bigint) to authenticated;
grant execute on function public.get_lesson_course_id(bigint) to authenticated;
grant execute on function public.can_view_video(bigint) to authenticated;
grant execute on function public.request_enrollment(bigint, text, text) to authenticated;

-- ---------- Grants ----------
revoke all on public.course_enrollments, public.lesson_progress from anon;
revoke insert, update, delete, truncate on public.course_enrollments from authenticated;
grant select, delete on public.course_enrollments to authenticated;
-- ADMIN chỉ được đổi trạng thái + ghi chú (RLS giới hạn cho ADMIN)
grant update (status, admin_note) on public.course_enrollments to authenticated;

revoke update, truncate on public.lesson_progress from authenticated;
grant select, insert, delete on public.lesson_progress to authenticated;

-- ---------- RLS: course_enrollments ----------
alter table public.course_enrollments enable row level security;

drop policy if exists "course_enrollments_select_own" on public.course_enrollments;
create policy "course_enrollments_select_own" on public.course_enrollments
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "course_enrollments_select_admin" on public.course_enrollments;
create policy "course_enrollments_select_admin" on public.course_enrollments
  for select to authenticated
  using (public.is_admin());

drop policy if exists "course_enrollments_update_admin" on public.course_enrollments;
create policy "course_enrollments_update_admin" on public.course_enrollments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "course_enrollments_delete_admin" on public.course_enrollments;
create policy "course_enrollments_delete_admin" on public.course_enrollments
  for delete to authenticated
  using (public.is_admin());

-- ---------- RLS: lesson_progress ----------
alter table public.lesson_progress enable row level security;

drop policy if exists "lesson_progress_select_own" on public.lesson_progress;
create policy "lesson_progress_select_own" on public.lesson_progress
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "lesson_progress_select_admin" on public.lesson_progress;
create policy "lesson_progress_select_admin" on public.lesson_progress
  for select to authenticated
  using (public.is_admin());

-- Chỉ ghi tiến độ cho bài thuộc khóa học mình đã được kích hoạt
drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
create policy "lesson_progress_insert_own" on public.lesson_progress
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.has_active_enrollment(public.get_lesson_course_id(lesson_id))
  );

drop policy if exists "lesson_progress_delete_own" on public.lesson_progress;
create policy "lesson_progress_delete_own" on public.lesson_progress
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- Học viên ACTIVE vẫn xem được khóa học của mình khi khóa học bị ẩn ----------
-- (chương/bài học đi theo vì policy của chúng kiểm tra courses dưới RLS)
drop policy if exists "courses_select_enrolled" on public.courses;
create policy "courses_select_enrolled" on public.courses
  for select to authenticated
  using (public.has_active_enrollment(id));

-- ---------- Bảo vệ video khóa học (thay policy cũ) ----------
drop policy if exists "videos_select_published" on public.videos;
create policy "videos_select_published" on public.videos
  for select to authenticated
  using (status = 'PUBLISHED' and public.can_view_video(id));

drop policy if exists "videos_select_published_file" on storage.objects;
create policy "videos_select_published_file" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'videos'
    and exists (
      select 1 from public.videos v
      where v.storage_path = storage.objects.name
        and v.status = 'PUBLISHED'
        and public.can_view_video(v.id)
    )
  );
