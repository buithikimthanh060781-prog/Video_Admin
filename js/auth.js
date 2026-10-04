// Authentication: Supabase Auth + kiểm tra session/role
import { supabase } from './supabase.js';

export const ROLE_ADMIN = 'ADMIN';
export const LOGIN_PAGE = 'login.html';
export const ADMIN_HOME = 'index.html';
export const USER_HOME = 'library.html';

const MIN_PASSWORD_LENGTH = 6;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Error messages (không lộ lỗi nội bộ) ----------

export function getFriendlyAuthError(error) {
  const message = (error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
  if (message.includes('email not confirmed')) return 'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.';
  if (message.includes('already registered')) return 'Email đã được sử dụng.';
  if (message.includes('rate limit') || error?.status === 429) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
  if (message.includes('same as the old')) return 'Mật khẩu mới phải khác mật khẩu cũ.';
  if (message.includes('password')) return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  if (message.includes('failed to fetch')) return 'Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.';
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

// ---------- Session & profile ----------

export async function getSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch {
    return null;
  }
}

export async function getCurrentProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, full_name, avatar_url, role, status, created_at')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  } catch {
    return null;
  }
}

export function isAdmin(profile) {
  return profile?.role === ROLE_ADMIN && isActive(profile);
}

export function isActive(profile) {
  return profile?.status !== 'INACTIVE';
}

const INACTIVE_MESSAGE = 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.';

export function getHomePage(profile) {
  return isAdmin(profile) ? ADMIN_HOME : USER_HOME;
}

// Dùng cho mọi trang cần đăng nhập. Trả về profile hoặc redirect.
export async function requireAuth({ adminOnly = false } = {}) {
  const session = await getSession();
  if (!session) {
    location.replace(LOGIN_PAGE);
    return null;
  }
  const profile = await getCurrentProfile(session.user.id);
  if (!profile || !isActive(profile)) {
    await signOut();
    return null;
  }
  if (adminOnly && !isAdmin(profile)) {
    location.replace(USER_HOME);
    return null;
  }
  return profile;
}

// ---------- Auth actions ----------

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function isUsernameAvailable(username) {
  const { data, error } = await supabase.rpc('is_username_available', { p_username: username });
  if (error) throw error;
  return data === true;
}

// Role không được gửi từ frontend: database trigger luôn tạo profile với role USER.
export async function signUp({ username, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: new URL(LOGIN_PAGE, location.href).href,
    },
  });
  if (error) throw error;
  // Supabase trả user không có identity khi email đã tồn tại.
  if (data.user && data.user.identities?.length === 0) {
    throw new Error('User already registered');
  }
  return data;
}

export async function sendResetPasswordEmail(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('reset-password.html', location.href).href,
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

// Xóa session; lỗi mạng không được chặn luồng chính nên chỉ trả về true/false.
async function clearSession() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}

export async function signOut() {
  await clearSession();
  location.replace(LOGIN_PAGE);
}

// ---------- Form helpers ----------

function setFieldError(form, name, message) {
  const errorElement = form.querySelector(`[data-error-for="${name}"]`);
  const input = form.elements[name];
  if (errorElement) errorElement.textContent = message || '';
  if (input) input.classList.toggle('is-invalid', Boolean(message));
}

function clearFormErrors(form) {
  form.querySelectorAll('[data-error-for]').forEach((element) => {
    setFieldError(form, element.dataset.errorFor, '');
  });
  showFormMessage(form, '');
}

function showFormMessage(form, message, type = 'error') {
  const messageElement = form.querySelector('.form-message');
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.className = `form-message form-message-${type}`;
  messageElement.hidden = !message;
}

function setSubmitting(form, isSubmitting, loadingText) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = isSubmitting;
  button.textContent = isSubmitting ? loadingText : button.dataset.label;
}

function validateEmail(form, email) {
  if (EMAIL_PATTERN.test(email)) return true;
  setFieldError(form, 'email', email ? 'Email không hợp lệ.' : 'Vui lòng nhập email.');
  return false;
}

function validateRequired(form, name, value, message) {
  if (value) return true;
  setFieldError(form, name, message);
  return false;
}

function validatePassword(form, name, password) {
  if (password.length >= MIN_PASSWORD_LENGTH) return true;
  setFieldError(form, name, `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
  return false;
}

function validatePasswordConfirm(form, password, confirmPassword) {
  if (password === confirmPassword) return true;
  setFieldError(form, 'confirmPassword', 'Mật khẩu xác nhận không khớp.');
  return false;
}

// ---------- Pages ----------

async function initLoginPage(form) {
  const session = await getSession();
  if (session) {
    const profile = await getCurrentProfile(session.user.id);
    if (profile && isActive(profile)) return location.replace(getHomePage(profile));
    if (profile) await clearSession();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const isEmailValid = validateEmail(form, email);
    const isPasswordValid = validateRequired(form, 'password', password, 'Vui lòng nhập mật khẩu.');
    if (!isEmailValid || !isPasswordValid) return;

    setSubmitting(form, true, 'Đang đăng nhập...');
    try {
      const newSession = await signIn(email, password);
      const profile = await getCurrentProfile(newSession.user.id);
      if (!profile) throw new Error('profile not found');
      if (!isActive(profile)) {
        await clearSession();
        showFormMessage(form, INACTIVE_MESSAGE);
        setSubmitting(form, false);
        return;
      }
      location.replace(getHomePage(profile));
    } catch (error) {
      showFormMessage(form, getFriendlyAuthError(error));
      setSubmitting(form, false);
    }
  });
}

async function validateRegisterForm(form, { username, email, password, confirmPassword }) {
  let isValid = true;
  if (!USERNAME_PATTERN.test(username)) {
    setFieldError(form, 'username', 'Username 3–30 ký tự, chỉ gồm chữ, số và dấu _.');
    isValid = false;
  }
  isValid = validateEmail(form, email) && isValid;
  isValid = validatePassword(form, 'password', password) && isValid;
  isValid = validatePasswordConfirm(form, password, confirmPassword) && isValid;
  if (!isValid) return false;

  if (!(await isUsernameAvailable(username))) {
    setFieldError(form, 'username', 'Username đã được sử dụng.');
    return false;
  }
  return true;
}

function initRegisterPage(form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const values = {
      username: form.elements.username.value.trim(),
      email: form.elements.email.value.trim(),
      password: form.elements.password.value,
      confirmPassword: form.elements.confirmPassword.value,
    };

    setSubmitting(form, true, 'Đang đăng ký...');
    try {
      if (!(await validateRegisterForm(form, values))) return;
      const { session } = await signUp(values);
      if (session) {
        location.replace(USER_HOME);
        return;
      }
      form.reset();
      showFormMessage(form, 'Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.', 'success');
    } catch (error) {
      showFormMessage(form, getFriendlyAuthError(error));
    } finally {
      setSubmitting(form, false);
    }
  });
}

function initForgotPasswordPage(form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const email = form.elements.email.value.trim();
    if (!validateEmail(form, email)) return;

    setSubmitting(form, true, 'Đang gửi...');
    try {
      await sendResetPasswordEmail(email);
      form.reset();
      showFormMessage(form, 'Nếu email tồn tại, link đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư.', 'success');
    } catch (error) {
      showFormMessage(form, getFriendlyAuthError(error));
    } finally {
      setSubmitting(form, false);
    }
  });
}

async function initResetPasswordPage(form) {
  const session = await getSession();
  if (!session) {
    form.querySelector('fieldset').disabled = true;
    showFormMessage(form, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu link mới.');
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const password = form.elements.password.value;
    const confirmPassword = form.elements.confirmPassword.value;
    const isPasswordValid = validatePassword(form, 'password', password);
    const isConfirmValid = validatePasswordConfirm(form, password, confirmPassword);
    if (!isPasswordValid || !isConfirmValid) return;

    setSubmitting(form, true, 'Đang cập nhật...');
    try {
      await updatePassword(password);
      await clearSession();
      form.querySelector('fieldset').disabled = true;
      showFormMessage(form, 'Đổi mật khẩu thành công! Đang chuyển tới trang đăng nhập...', 'success');
      setTimeout(() => location.replace(LOGIN_PAGE), 2000);
    } catch (error) {
      showFormMessage(form, getFriendlyAuthError(error));
      setSubmitting(form, false);
    }
  });
}

const PAGE_INITIALIZERS = {
  login: initLoginPage,
  register: initRegisterPage,
  'forgot-password': initForgotPasswordPage,
  'reset-password': initResetPasswordPage,
};

function initAuthPage() {
  const page = document.body.dataset.authPage;
  const form = document.getElementById('auth-form');
  const initializer = PAGE_INITIALIZERS[page];
  if (form && initializer) initializer(form);
}

initAuthPage();
