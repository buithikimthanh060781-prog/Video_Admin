-- =========================================================
-- Video từ link YouTube (thay cho upload file)
-- video_source: UPLOAD = file trong Storage, YOUTUBE = link YouTube
-- =========================================================

alter table public.videos
  add column if not exists video_source text not null default 'UPLOAD';

alter table public.videos drop constraint if exists videos_video_source_check;
alter table public.videos
  add constraint videos_video_source_check check (video_source in ('UPLOAD', 'YOUTUBE'));

-- Video YouTube: không có file trong Storage và video_url phải đúng dạng chuẩn.
-- Frontend luôn chuẩn hóa link về dạng này; ràng buộc để chặn dữ liệu sai gọi trực tiếp qua API.
alter table public.videos drop constraint if exists videos_youtube_url_check;
alter table public.videos
  add constraint videos_youtube_url_check check (
    video_source <> 'YOUTUBE'
    or (
      storage_path is null
      and video_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
    )
  );

create index if not exists idx_videos_video_source on public.videos (video_source);
