// Popup đăng nhập 2 cột cho trang công khai (login.html, course-detail.html, register.html...). ADMIN và USER dùng chung.
// Các hàm tạo ô nhập / cột trái được dùng lại cho popup đăng ký (register-modal.js).
import { bindLoginForm } from './auth.js?v=202610171935';
import { openModal } from './components.js?v=202610171935';
import { createIcon } from './icons.js?v=202610171935';
import { openRegisterModal } from './register-modal.js?v=202610171935';
import { createElement } from './utils.js?v=202610171935';

// DEV ONLY: tài khoản demo để test. Xóa DEMO_ACCOUNTS và createDemoAccounts() trước khi triển khai production.
const DEMO_ACCOUNTS = [
  { role: 'Quản trị viên', email: 'admin1@gmail.com', password: '123456' },
  { role: 'Thành viên', email: 'user1@gmail.com', password: '123456' },
];

const ASIDE_POINTS = [
  'Học theo lộ trình từng chương',
  'Đánh dấu bài đã học, xem % hoàn thành',
  'Học trên mọi thiết bị',
];

// ---------- Fields ----------

export function createInput({ name, type, autocomplete, placeholder = '', idPrefix = 'login' }) {
  const input = document.createElement('input');
  input.id = `${idPrefix}-${name}`;
  input.name = name;
  input.type = type;
  input.autocomplete = autocomplete;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

export function createErrorElement(name) {
  const error = createElement('small', 'field-error');
  error.dataset.errorFor = name;
  return error;
}

function createEmailField() {
  const group = createElement('div', 'form-group');
  const label = createElement('label', '', 'Email');
  label.htmlFor = 'login-email';
  group.append(
    label,
    createInput({ name: 'email', type: 'email', autocomplete: 'email', placeholder: 'ban@example.com' }),
    createErrorElement('email'),
  );
  return group;
}

export function createPasswordToggle(input) {
  const button = createElement('button', 'input-action-button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Hiện mật khẩu');
  button.setAttribute('aria-pressed', 'false');
  button.appendChild(createIcon('eye', 18));
  button.addEventListener('click', () => {
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    button.setAttribute('aria-pressed', String(!isVisible));
    button.setAttribute('aria-label', isVisible ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
    input.focus();
  });
  return button;
}

function createPasswordField() {
  const group = createElement('div', 'form-group');
  const label = createElement('label', '', 'Mật khẩu');
  label.htmlFor = 'login-password';
  const forgotLink = createElement('a', 'auth-link-small', 'Quên mật khẩu?');
  forgotLink.href = 'forgot-password.html';
  const row = createElement('div', 'form-label-row');
  row.append(label, forgotLink);

  const input = createInput({ name: 'password', type: 'password', autocomplete: 'current-password', placeholder: '••••••' });
  const wrapper = createElement('div', 'input-action');
  wrapper.append(input, createPasswordToggle(input));

  group.append(row, wrapper, createErrorElement('password'));
  return group;
}

// DEV ONLY
function createDemoAccounts() {
  const section = createElement('section', 'demo-accounts');
  section.setAttribute('aria-label', 'Tài khoản demo');
  section.appendChild(createElement('h3', 'demo-accounts-title', 'Tài khoản demo (để test)'));

  const table = createElement('table', 'demo-accounts-table');
  const headRow = document.createElement('tr');
  ['Vai trò', 'Email', 'Mật khẩu', ''].forEach((label) => headRow.appendChild(createElement('th', '', label)));
  const thead = document.createElement('thead');
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  DEMO_ACCOUNTS.forEach((account) => {
    const fillButton = createElement('button', 'btn btn-secondary btn-sm', 'Điền');
    fillButton.type = 'button';
    fillButton.dataset.demoEmail = account.email;
    fillButton.dataset.demoPassword = account.password;
    const actionCell = createElement('td');
    actionCell.appendChild(fillButton);

    const row = document.createElement('tr');
    row.append(
      createElement('td', '', account.role),
      createElement('td', '', account.email),
      createElement('td', '', account.password),
      actionCell,
    );
    tbody.appendChild(row);
  });

  table.append(thead, tbody);
  section.appendChild(table);
  return section;
}

// ---------- Layout (dùng chung cho popup đăng nhập / đăng ký) ----------

// Cột trái navy: badge, tiêu đề, mô tả, danh sách điểm có dấu check
export function createAside({ title, text, points }) {
  const aside = createElement('div', 'auth-aside');
  const list = createElement('ul', 'auth-aside-list');
  points.forEach((point) => {
    const item = createElement('li');
    item.append(createIcon('check', 14), document.createTextNode(point));
    list.appendChild(item);
  });
  aside.append(
    createElement('span', 'auth-aside-badge', 'Học Vèo · Học nhanh, nhớ lâu'),
    createElement('h2', 'auth-aside-title', title),
    createElement('p', 'auth-aside-text', text),
    list,
  );
  return aside;
}

export function createAuthMain(title, subtitle, form) {
  const main = createElement('div', 'auth-main');
  main.append(
    createElement('h2', 'auth-main-title', title),
    createElement('p', 'auth-main-subtitle', subtitle),
    form,
  );
  return main;
}

// Mở popup 2 cột. Trả về hàm đóng popup.
export function openAuthModal({ title, aside, main }) {
  const body = createElement('div', 'auth-split');
  body.append(aside, main);
  const { element, close } = openModal({ title, body });
  element.classList.add('modal-auth');
  return close;
}

// Link chuyển sang popup khác (vd "Đăng ký ngay"). Giữ href để vẫn dùng được khi JavaScript lỗi.
export function createSwitchLink(text, href) {
  const link = createElement('a', '', text);
  link.href = href;
  link.dataset.authSwitch = '';
  return link;
}

function createLoginForm() {
  const form = createElement('form', 'auth-form');
  form.noValidate = true;

  const message = createElement('div', 'form-message form-message-error');
  message.setAttribute('role', 'alert');
  message.hidden = true;

  const submitButton = createElement('button', 'btn btn-gradient btn-block', 'Đăng nhập');
  submitButton.type = 'submit';

  const footer = createElement('p', 'auth-footer');
  footer.append('Chưa có tài khoản? ', createSwitchLink('Đăng ký ngay', 'register.html'));

  form.append(message, createEmailField(), createPasswordField(), submitButton, footer, createDemoAccounts());
  return form;
}

export function openLoginModal() {
  const form = createLoginForm();
  bindLoginForm(form);
  const close = openAuthModal({
    title: 'Đăng nhập',
    aside: createAside({
      title: 'Chào mừng bạn quay lại',
      text: 'Đăng nhập để tiếp tục học, xem lại khóa học đã đăng ký và theo dõi tiến độ của bạn.',
      points: ASIDE_POINTS,
    }),
    main: createAuthMain('Đăng nhập', 'Dùng email và mật khẩu của bạn. Quản trị viên và học viên dùng chung trang này.', form),
  });
  // "Đăng ký ngay": chuyển sang popup đăng ký ngay trên trang hiện tại
  form.querySelector('[data-auth-switch]').addEventListener('click', (event) => {
    event.preventDefault();
    close();
    openRegisterModal();
  });
  form.elements.email.focus();
}