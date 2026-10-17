-- =========================================================
-- DEV ONLY: tạo tài khoản demo trong Supabase Auth (email đã xác nhận)
-- admin1@gmail.com / 123456 (ADMIN), user1@gmail.com / 123456 (USER)
-- Không dùng cho production.
-- =========================================================

create or replace function pg_temp.create_demo_user(p_email text, p_username text, p_password text)
returns uuid
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is not null then
    return v_user_id;
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', p_username), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  return v_user_id;
end;
$$;

select pg_temp.create_demo_user('admin1@gmail.com', 'admin1', '123456');
select pg_temp.create_demo_user('user1@gmail.com', 'user1', '123456');

-- Profile được trigger handle_new_user tạo với role USER (từ 14_member_activation.sql: status PENDING);
-- nâng admin1 lên ADMIN và kích hoạt sẵn 2 tài khoản demo.
update public.profiles set role = 'ADMIN' where email = 'admin1@gmail.com';
update public.profiles set status = 'ACTIVE' where email in ('admin1@gmail.com', 'user1@gmail.com');
