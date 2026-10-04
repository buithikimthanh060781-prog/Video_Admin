-- =========================================================
-- 07_USER_MANAGEMENT: status cho profiles
-- =========================================================

alter table public.profiles
  add column if not exists status text not null default 'ACTIVE';

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check check (status in ('ACTIVE', 'INACTIVE'));

create index if not exists idx_profiles_status on public.profiles (status);
create index if not exists idx_profiles_created_at on public.profiles (created_at desc);

-- ADMIN bị INACTIVE thì mất quyền quản trị ngay ở database
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN' and status = 'ACTIVE'
  );
$$;

-- User không được tự đổi role/status của mình (chỉ ADMIN hoặc SQL trực tiếp)
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Not allowed to change role or status';
  end if;
  return new;
end;
$$;
