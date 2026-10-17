// Link "Đăng nhập" trên trang Đăng ký / Quên mật khẩu: mở popup đăng nhập thay vì chuyển sang trang chủ.
// Link vẫn giữ href="login.html" để dùng được khi JavaScript lỗi.
import { openLoginModal } from './login-modal.js?v=202610171935';

document.querySelectorAll('[data-login-popup]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openLoginModal();
  });
});
