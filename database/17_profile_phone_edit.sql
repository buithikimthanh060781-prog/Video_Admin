-- =========================================================
-- 17_PROFILE_PHONE_EDIT: thành viên tự cập nhật số điện thoại ở trang Tài khoản
-- Chạy sau 15_member_phone.sql. Script chạy lại nhiều lần an toàn.
--
-- Chỉ mở thêm quyền sửa cột phone cho người dùng đã đăng nhập. RLS (profiles_update_own) vẫn
-- giới hạn mỗi người chỉ sửa được hồ sơ của chính mình; định dạng số do ràng buộc profiles_phone_format kiểm tra.
-- =========================================================
grant update (phone) on public.profiles to authenticated;
