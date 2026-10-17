-- =========================================================
-- 13_PROTECT_COURSE_VIDEOS: video đã gắn vào bài học của khóa học KHÔNG được xóa.
-- Muốn ngừng dùng: chuyển status sang HIDDEN ("Ngừng kích hoạt"); dùng lại: PUBLISHED ("Kích hoạt lại").
-- Chạy sau 09_courses.sql. Script chạy lại nhiều lần an toàn.
-- Thay policy "videos_delete_admin" (04_videos_storage.sql): nếu chạy lại 04 thì chạy lại file này.
-- =========================================================

-- Lớp 1 (API): ADMIN chỉ xóa được video chưa thuộc bài học nào
drop policy if exists "videos_delete_admin" on public.videos;
create policy "videos_delete_admin" on public.videos
  for delete to authenticated
  using (
    public.is_admin()
    and not exists (select 1 from public.course_lessons l where l.video_id = videos.id)
  );

-- Lớp 2 (database): khóa ngoại RESTRICT chặn xóa cả khi chạy SQL trực tiếp
-- (trước đây là ON DELETE SET NULL trong 09_courses.sql)
alter table public.course_lessons drop constraint if exists course_lessons_video_id_fkey;
alter table public.course_lessons
  add constraint course_lessons_video_id_fkey
  foreign key (video_id) references public.videos(id) on delete restrict;
