// Đăng ký học: thành viên bấm "Đăng ký" -> ADMIN liên hệ qua số điện thoại và kích hoạt -> thành viên vào học.
// Thành viên chỉ gửi yêu cầu qua RPC request_enrollment (không tự kích hoạt được).
import { supabase } from './supabase.js?v=202610172049';
import { showToast } from './components.js?v=202610172049';
import { createElement, formatDate } from './utils.js?v=202610172049';

export const LEARN_PAGE = 'learn.html';

export const ENROLLMENT_STATUSES = {
  PENDING: { label: 'Chờ kích hoạt', badge: 'warning' },
  ACTIVE: { label: 'Đã kích hoạt', badge: 'success' },
  REJECTED: { label: 'Bị từ chối', badge: 'danger' },
  REVOKED: { label: 'Đã thu hồi', badge: 'default' },
};

export function getLearnUrl(courseId) {
  return `${LEARN_PAGE}?course=${encodeURIComponent(courseId)}`;
}

// ---------- Data ----------

export async function fetchMyEnrollment(courseId, userId) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('id, status, phone, note, admin_note, created_at, activated_at')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Map course_id -> status của user (lỗi thì trả Map rỗng: chỉ dùng để hiện nhãn)
export async function fetchMyEnrollmentMap(userId) {
  try {
    const { data, error } = await supabase.from('course_enrollments').select('course_id, status').eq('user_id', userId);
    if (error) throw error;
    return new Map(data.map((row) => [row.course_id, row.status]));
  } catch {
    return new Map();
  }
}

// p_phone = null: database lấy số điện thoại trong hồ sơ thành viên (15_member_phone.sql)
async function requestEnrollment(courseId) {
  const { data, error } = await supabase.rpc('request_enrollment', {
    p_course_id: courseId,
    p_phone: null,
    p_note: null,
  });
  if (error) throw error;
  return data;
}

function getFriendlyEnrollmentError(error) {
  if (error?.code === '22023') return 'Số điện thoại trong tài khoản không hợp lệ. Vui lòng liên hệ quản trị viên.';
  if (error?.code === 'P0002') return 'Khóa học hiện không nhận đăng ký.';
  if (error?.code === '42501') return 'Tài khoản của bạn chưa thể đăng ký khóa học. Vui lòng liên hệ quản trị viên.';
  return 'Không thể đăng ký khóa học. Vui lòng thử lại.';
}

// ---------- Nút "Đăng ký" trên trang chi tiết khóa học ----------

function createButton(text, className, onClick) {
  const button = createElement('button', className, text);
  button.type = 'button';
  button.addEventListener('click', () => onClick(button));
  return button;
}

function createStatusBox(status, title, text) {
  const box = createElement('div', `enroll-status enroll-status-${status.toLowerCase()}`);
  box.append(createElement('strong', 'enroll-status-title', title));
  if (text) box.appendChild(createElement('p', 'enroll-status-text', text));
  return box;
}

// Bấm "Đăng ký" là gửi yêu cầu ngay (không mở popup); số điện thoại lấy từ hồ sơ thành viên
async function submitEnrollment(course, button, onChange) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Đang gửi...';
  try {
    await requestEnrollment(course.id);
    showToast('Đã đăng ký khóa học. Quản trị viên sẽ liên hệ và kích hoạt khóa học cho bạn.', 'success', 4500);
    onChange?.();
  } catch (error) {
    showToast(getFriendlyEnrollmentError(error), 'error', 4500);
    button.disabled = false;
    button.textContent = label;
  }
}

function getContactText(enrollment) {
  return enrollment.phone ? `Quản trị viên sẽ liên hệ qua số ${enrollment.phone}.` : 'Quản trị viên sẽ liên hệ với bạn để kích hoạt.';
}

// profile: null nếu chưa đăng nhập. onChange(): tải lại sau khi đăng ký. onLoginRequired(): mở đăng nhập.
export function createEnrollmentCta({ course, profile, enrollment, onChange, onLoginRequired }) {
  const cta = createElement('div', 'enroll-cta');
  const submit = (button) => submitEnrollment(course, button, onChange);

  if (!profile) {
    cta.append(
      createButton('Đăng ký', 'btn btn-gradient btn-block', () => onLoginRequired?.()),
      createElement('small', 'enroll-hint', 'Bạn cần đăng nhập để đăng ký khóa học.'),
    );
    return cta;
  }

  if (!enrollment) {
    cta.append(
      createButton('Đăng ký', 'btn btn-gradient btn-block', submit),
      createElement('small', 'enroll-hint', 'Quản trị viên sẽ liên hệ qua số điện thoại của bạn và kích hoạt khóa học.'),
    );
    return cta;
  }

  const feedback = enrollment.admin_note ? `Phản hồi từ quản trị viên: ${enrollment.admin_note}` : '';
  if (enrollment.status === 'ACTIVE') {
    const learnLink = createElement('a', 'btn btn-gradient btn-block', 'Vào học ngay');
    learnLink.href = getLearnUrl(course.id);
    cta.append(
      createStatusBox('ACTIVE', 'Bạn đã được kích hoạt khóa học này', enrollment.activated_at ? `Kích hoạt ngày ${formatDate(enrollment.activated_at)}.` : ''),
      learnLink,
    );
  } else if (enrollment.status === 'PENDING') {
    cta.append(createStatusBox('PENDING', 'Đã đăng ký, đang chờ kích hoạt',
      `Đăng ký ngày ${formatDate(enrollment.created_at)}. ${getContactText(enrollment)}`));
  } else {
    const title = enrollment.status === 'REVOKED' ? 'Quyền học khóa này đã bị thu hồi' : 'Đăng ký chưa được chấp nhận';
    cta.append(
      createStatusBox(enrollment.status, title, feedback),
      createButton('Đăng ký lại', 'btn btn-gradient btn-block', submit),
    );
  }
  if (feedback && enrollment.status !== 'REJECTED' && enrollment.status !== 'REVOKED') {
    cta.appendChild(createElement('small', 'enroll-hint', feedback));
  }
  return cta;
}