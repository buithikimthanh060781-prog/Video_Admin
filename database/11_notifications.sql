-- =========================================================
-- 11_NOTIFICATIONS: thông báo trong ứng dụng cho thành viên
-- Tự tạo khi ADMIN kích hoạt / từ chối / thu hồi đăng ký học (trigger trên course_enrollments).
-- Chạy sau 10_enrollments.sql. Script chạy lại nhiều lần an toàn.
-- =========================================================

create table if not exists public.notifications (
  id bigint primary key generated always as identity,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in ('ENROLLMENT_ACTIVE', 'ENROLLMENT_REJECTED', 'ENROLLMENT_REVOKED'));

-- Chỉ cho link nội bộ dạng "trang.html?tham-so" (chặn javascript:, http:// ...)
alter table public.notifications drop constraint if exists notifications_link_check;
alter table public.notifications
  add constraint notifications_link_check check (link is null or link ~ '^[a-z0-9-]+\.html(\?[A-Za-z0-9=&_%.-]*)?$');

create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread on public.notifications (user_id) where read_at is null;

-- ---------- Trigger: tạo thông báo khi trạng thái đăng ký thay đổi ----------
create or replace function public.notify_enrollment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_slug text;
  v_type text;
  v_heading text;
  v_message text;
  v_link text;
begin
  if new.status is not distinct from old.status or new.status not in ('ACTIVE', 'REJECTED', 'REVOKED') then
    return new;
  end if;

  select c.title, c.slug into v_title, v_slug from public.courses c where c.id = new.course_id;

  if new.status = 'ACTIVE' then
    v_type := 'ENROLLMENT_ACTIVE';
    v_heading := 'Khóa học đã được kích hoạt';
    v_message := format('Bạn đã có thể học khóa "%s".', v_title);
    v_link := 'learn.html?course=' || new.course_id;
  elsif new.status = 'REJECTED' then
    v_type := 'ENROLLMENT_REJECTED';
    v_heading := 'Yêu cầu đăng ký chưa được chấp nhận';
    v_message := format('Yêu cầu học khóa "%s" chưa được chấp nhận.', v_title);
    v_link := 'explore-detail.html?slug=' || v_slug;
  else
    v_type := 'ENROLLMENT_REVOKED';
    v_heading := 'Quyền học khóa học đã bị thu hồi';
    v_message := format('Quyền học khóa "%s" đã bị thu hồi.', v_title);
    v_link := 'explore-detail.html?slug=' || v_slug;
  end if;

  if nullif(trim(new.admin_note), '') is not null then
    v_message := v_message || ' Lời nhắn: ' || trim(new.admin_note);
  end if;

  insert into public.notifications (user_id, type, title, message, link)
  values (new.user_id, v_type, v_heading, left(v_message, 1500), v_link);
  return new;
end;
$$;

drop trigger if exists trg_course_enrollments_notify on public.course_enrollments;
create trigger trg_course_enrollments_notify
  after update on public.course_enrollments
  for each row execute function public.notify_enrollment_status();

revoke execute on function public.notify_enrollment_status() from public, anon, authenticated;

-- ---------- Grants + RLS ----------
-- Thành viên chỉ đọc, đánh dấu đã đọc, xóa thông báo của mình. Không ai tự tạo thông báo qua API.
revoke all on public.notifications from anon;
revoke insert, update, delete, truncate on public.notifications from authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());
