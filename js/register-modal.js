// Popup đăng ký thành viên 2 cột (cùng khung với popup đăng nhập) cho trang công khai.
// Đăng ký xong: đóng popup, hiện thông báo "chờ quản trị viên kích hoạt" ngay trên trang hiện tại.
import { bindRegisterForm } from './auth.js?v=202610171935';
import { showToast } from './components.js?v=202610171935';
import {
  createAside,
  createAuthMain,
  createErrorElement,
  createInput,
  createPasswordToggle,
  createSwitchLink,
  openAuthModal,
  openLoginModal,
} from './login-modal.js?v=202610171935';
import { createElement } from './utils.js?v=202610171935';

const ID_PREFIX = 'register';

// Các bước sau khi đăng ký (đúng quy trình thật: ADMIN kích hoạt rồi mới đăng nhập được)
const ASIDE_POINTS = [
  'Bước 1: Đăng ký tài khoản miễn phí',
  'Bước 2: Quản trị viên kích hoạt tài khoản',
  'Bước 3: Đăng nhập và đăng ký khóa học',
];

const FIELDS = [
  { name: 'username', label: 'Tên đăng nhập', type: 'text', autocomplete: 'username', placeholder: 'vd: Nguyễn Văn An', hint: 'Có thể dùng tiếng Việt có dấu, không trùng với thành viên khác' },
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email', placeholder: 'ban@example.com' },
  { name: 'phone', label: 'Số điện thoại', type: 'tel', autocomplete: 'tel', placeholder: 'vd: 0912 345 678', hint: 'Quản trị viên liên hệ qua số này để kích hoạt tài khoản và khóa học' },
  { name: 'password', label: 'Mật khẩu', type: 'password', autocomplete: 'new-password', placeholder: 'Ít nhất 6 ký tự' },
  { name: 'confirmPassword', label: 'Nhập lại mật khẩu', type: 'password', autocomplete: 'new-password', placeholder: 'Nhập lại mật khẩu ở trên' },
];

function createField({ name, label, type, autocomplete, placeholder, hint }) {
  const group = createElement('div', 'form-group');
  const labelElement = createElement('label', '', label);
  labelElement.htmlFor = `${ID_PREFIX}-${name}`;

  const input = createInput({ name, type, autocomplete, placeholder, idPrefix: ID_PREFIX });
  let control = input;
  if (type === 'password') {
    control = createElement('div', 'input-action');
    control.append(input, createPasswordToggle(input));
  }

  group.append(labelElement, control);
  if (hint) group.appendChild(createElement('small', 'form-hint', hint));
  group.appendChild(createErrorElement(name));
  return group;
}

function createRegisterForm() {
  const form = createElement('form', 'auth-form');
  form.noValidate = true;

  const message = createElement('div', 'form-message form-message-error');
  message.setAttribute('role', 'alert');
  message.hidden = true;

  const submitButton = createElement('button', 'btn btn-gradient btn-block', 'Đăng ký');
  submitButton.type = 'submit';

  const footer = createElement('p', 'auth-footer');
  footer.append('Đã có tài khoản? ', createSwitchLink('Đăng nhập', 'login.html'));

  form.append(message, ...FIELDS.map(createField), submitButton, footer);
  return form;
}

export function openRegisterModal() {
  const form = createRegisterForm();
  const close = openAuthModal({
    title: 'Đăng ký thành viên',
    aside: createAside({
      title: 'Tham gia Học Vèo',
      text: 'Tạo tài khoản để đăng ký khóa học, học theo lộ trình và theo dõi tiến độ của riêng bạn.',
      points: ASIDE_POINTS,
    }),
    main: createAuthMain('Đăng ký thành viên', 'Sau khi đăng ký, tài khoản cần được quản trị viên kích hoạt trước khi đăng nhập.', form),
  });

  bindRegisterForm(form, {
    onSuccess: (message, duration) => {
      close();
      showToast(message, 'success', duration);
    },
  });

  // "Đăng nhập": chuyển sang popup đăng nhập
  form.querySelector('[data-auth-switch]').addEventListener('click', (event) => {
    event.preventDefault();
    close();
    openLoginModal();
  });
  form.elements.username.focus();
}
