# USER MANAGEMENT

File: users.html

Chỉ ADMIN được truy cập.

## Table
Columns:
- ID
- Avatar
- Username
- Email
- Role
- Created At
- Status
- Actions

Roles:
- ADMIN
- USER

## Search
username, email.

## Filter
Role, Status.

## User Detail
ADMIN có thể xem Username, Email, Role, Created date.

Không hiển thị password, auth token hoặc session token.

Password được quản lý bởi Supabase Auth.
