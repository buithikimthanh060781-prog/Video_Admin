// Popup "Quên mật khẩu" trên trang chủ (login.html): email + số điện thoại + mật khẩu mới + nhập lại mật khẩu mới.
// Email và số điện thoại phải khớp tài khoản thì đổi mật khẩu ngay, rồi đăng nhập bằng mật khẩu mới.
// Không chuyển sang trang forgot-password.html.
import {
  clearFormErrors,
  getFriendlyAuthError,
  resetPasswordWithPhone,
  setSubmitting,
  showFormMessage,
  validateResetForm,
} from './auth.js?v=202610180851';
import { showToast } from './components.js?v=202610180851';
import {
  createAside,
  createAuthMain,
  createErrorElement,
  createInput,
  createPasswordToggle,
  createSwitchLink,
  openAuthModal,
  openLoginModal,
} from './login-modal.js?v=202610180851';
import { createElement } from './utils.js?v=202610180851';

const ID_PREFIX = 'forgot';
const WRONG_INFO_MESSAGE = 'Email hoặc số điện thoại không đúng. Tài khoản cũ chưa có số điện thoại thì vui lòng liên hệ quản trị viên.';

const ASIDE_POINTS = [
  'Nhập email và số điện thoại đã đăng ký',
  'Đặt mật khẩu mới',
  'Đăng nhập ngay bằng mật khẩu mới',
];

function createTextField({ name, label, type, autocomplete, placeholder, hint }) {
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

const FIELDS = [
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email', placeholder: 'ban@example.com' },
  { name: 'phone', label: 'Số điện thoại', type: 'tel', autocomplete: 'tel', placeholder: 'vd: 0912 345 678', hint: 'Số điện thoại bạn đã đăng ký cùng tài khoản' },
  { name: 'password', label: 'Mật khẩu mới', type: 'password', autocomplete: 'new-password', placeholder: 'Ít nhất 6 ký tự' },
  { name: 'confirmPassword', label: 'Nhập lại mật khẩu mới', type: 'password', autocomplete: 'new-password', placeholder: 'Nhập lại mật khẩu mới ở trên' },
];

function createForgotForm() {
  const form = createElement('form', 'auth-form');
  form.noValidate = true;

  const message = createElement('div', 'form-message form-message-error');
  message.setAttribute('role', 'alert');
  message.hidden = true;

  const submitButton = createElement('button', 'btn btn-gradient btn-block', 'Đổi mật khẩu');
  submitButton.type = 'submit';

  const footer = createElement('p', 'auth-footer');
  footer.append('Nhớ mật khẩu rồi? ', createSwitchLink('Đăng nhập', 'login.html'));

  form.append(message, ...FIELDS.map(createTextField), submitButton, footer);
  return form;
}

export function openForgotModal() {
  const form = createForgotForm();
  const close = openAuthModal({
    title: 'Quên mật khẩu',
    aside: createAside({
      title: 'Lấy lại mật khẩu',
      text: 'Xác nhận bằng email và số điện thoại đã đăng ký, sau đó đặt mật khẩu mới cho tài khoản của bạn.',
      points: ASIDE_POINTS,
    }),
    main: createAuthMain('Quên mật khẩu', 'Nhập email, số điện thoại đã đăng ký và mật khẩu mới.', form),
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const values = {
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      password: form.elements.password.value,
      confirmPassword: form.elements.confirmPassword.value,
    };
    if (!validateResetForm(form, values)) return;

    setSubmitting(form, true, 'Đang kiểm tra...');
    try {
      if (!(await resetPasswordWithPhone(values))) {
        showFormMessage(form, WRONG_INFO_MESSAGE);
        setSubmitting(form, false);
        return;
      }
      close();
      showToast('Đổi mật khẩu thành công! Hãy đăng nhập bằng mật khẩu mới.', 'success', 6000);
      openLoginModal();
    } catch (error) {
      showFormMessage(form, getFriendlyAuthError(error));
      setSubmitting(form, false);
    }
  });

  form.querySelector('[data-auth-switch]').addEventListener('click', (event) => {
    event.preventDefault();
    close();
    openLoginModal();
  });
  form.elements.email.focus();
}
