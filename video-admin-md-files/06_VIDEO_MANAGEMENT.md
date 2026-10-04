# VIDEO MANAGEMENT

File: videos.html

## Table
Columns:
- ID
- Thumbnail
- Title
- Category
- Views
- Status
- Created At
- Actions

Actions:
- Edit
- Delete

## Add Video
Button: + Add Video

Form:
- Title
- Description
- Category
- Thumbnail
- Video
- Status

## Thumbnail Upload
Bucket: thumbnails.
Lưu public URL vào videos.thumbnail_url.

## Video Upload
Bucket: videos.
Lưu storage_path, video_url và file_size.

## Validation
Thumbnail:
- image/jpeg
- image/png
- image/webp

Video:
- video/mp4
- video/webm

Kiểm tra file type và file size.

## Edit Video
Cho phép sửa Title, Description, Category, Thumbnail, Status.
Không reset views.

## Delete Video
1. Confirm
2. Xóa database record
3. Xóa file storage nếu có
4. Refresh table

## Search
Search theo title.

## Filter
Category và Status.

## Pagination
Mặc định 10 videos/page; cho phép 10/20/50.

## Empty State
"Chưa có video nào."
Button: Add Video
