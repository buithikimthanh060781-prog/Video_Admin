# CODING RULES

## Technology
Chỉ:
- HTML
- CSS
- Vanilla JavaScript
- Supabase
- Chart.js CDN

## No Framework
Không sử dụng React, Vue, Angular, Next.js, Nuxt, Svelte.

## No Backend
Không tạo Node.js server, Express, PHP, ASP.NET hoặc Python backend.

## JavaScript
Dùng ES Modules.

js/:
- supabase.js
- auth.js
- dashboard.js
- videos.js
- video-edit.js
- users.js
- categories.js
- utils.js

## CSS
Tách:
- css/style.css
- css/auth.css
- css/responsive.css

## Naming
JavaScript: camelCase
CSS: kebab-case
Database: snake_case

## Functions
Mỗi function làm một nhiệm vụ; tránh function quá lớn.

## Async
Supabase calls dùng async/await.

## Error handling
Mọi Supabase request có try/catch.

## UI states
Có loading, empty và error state.

## Reusable Components
Tái sử dụng Sidebar, Header, Modal, Toast, Pagination, Table.

## CDN
Được phép dùng CDN cho Supabase JS và Chart.js.

## UX
Ưu tiên Toast, Modal và inline validation thay vì alert().
