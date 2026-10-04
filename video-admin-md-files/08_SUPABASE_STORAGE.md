# SUPABASE STORAGE

## Buckets
Tạo:
- thumbnails
- videos
- avatars

## File Types
thumbnails/avatars:
- jpg
- jpeg
- png
- webp

videos:
- mp4
- webm

## File Path
Database lưu storage_path hoặc public URL.

Không dùng tên file gốc làm path duy nhất.

Format:
userId/timestamp-originalFileName

## Security
Storage policy phải kiểm tra authenticated user, role và ownership.

ADMIN:
- upload
- update
- delete

USER:
- không được upload video quản trị

## Public / Private
Thumbnail có thể public.
Video ưu tiên private nếu không public; dùng signed URL khi cần.

## Storage Usage
Dashboard dùng videos.file_size để tính dung lượng video.
