# DASHBOARD

File: index.html

## Statistics
- Total Videos
- Total Views
- Storage Used
- Total Users

## Total Videos
COUNT videos.

## Total Views
SUM videos.views.

## Storage Used
Tính tổng videos.file_size và format Bytes/KB/MB/GB.

## Total Users
COUNT profiles.

## Top 10 Videos
Query videos ORDER BY views DESC LIMIT 10.

Hiển thị:
- Rank
- Thumbnail
- Title
- Views

## Bar Chart
Dùng Chart.js qua CDN:
https://cdn.jsdelivr.net/npm/chart.js

Chart: Top 10 videos by views.
X: Video title
Y: Views

## Views Over Time
Dùng bảng video_views, group theo ngày.

## Line Chart
Cho phép filter:
- 7 days
- 30 days
- This month
- This year

## States
Có loading, empty và error state.
