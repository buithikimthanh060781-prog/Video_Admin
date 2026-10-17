-- =========================================================
-- 12_CLEAR_ACTIVATION_NOTE: khi ADMIN kích hoạt, lời nhắn chỉ gửi vào thông báo rồi bị xóa
-- khỏi course_enrollments.admin_note, để không còn lại cho những lần kích hoạt sau.
-- Thay trigger AFTER của 11_notifications.sql bằng trigger BEFORE (cần BEFORE để sửa được dòng).
-- Chạy sau 11_notifications.sql. Script chạy lại nhiều lần an toàn.
-- =========================================================

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

  -- Lời nhắn kích hoạt đã nằm trong thông báo: xóa khỏi đăng ký
  if new.status = 'ACTIVE' then
    new.admin_note := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_enrollment_status() from public, anon, authenticated;

drop trigger if exists trg_course_enrollments_notify on public.course_enrollments;
create trigger trg_course_enrollments_notify
  before update on public.course_enrollments
  for each row execute function public.notify_enrollment_status();

-- Dọn lời nhắn còn sót trên các đăng ký đã kích hoạt trước đây
update public.course_enrollments set admin_note = null where status = 'ACTIVE' and admin_note is not null;
