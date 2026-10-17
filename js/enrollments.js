// enrollments module (ADMIN): xử lý đăng ký học -> kích hoạt / từ chối / thu hồi
import { supabase } from './supabase.js?v=202610171935';
import { initLayout, refreshPendingBadge } from './layout.js?v=202610171935';
import { createBadge, createPagedTable, openModal, showToast } from './components.js?v=202610171935';
import { ENROLLMENT_STATUSES } from './enrollment.js?v=202610171935';
import { createElement, debounce, escapeLikePattern, formatDate } from './utils.js?v=202610171935';

const COLUMN_COUNT = 7;
const NOTE_MAX_LENGTH = 1000;
const LEARNER_EMBED = 'profiles!course_enrollments_user_id_fkey!inner(username, email, full_name)';
const ENROLLMENT_COLUMNS = `id, status, phone, note, admin_note, created_at, activated_at, courses(id, title), ${LEARNER_EMBED}`;

const STATUS_FILTERS = [
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'ACTIVE', label: 'Đã kích hoạt' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'REVOKED', label: 'Đã thu hồi' },
  { value: '', label: 'Tất cả' },
];

const filters = { status: 'PENDING', search: '', courseId: '' };
const elements = {};
let table = null;

// ---------- Data ----------

// Bỏ ký tự làm hỏng cú pháp bộ lọc .or() của PostgREST
function toOrSafePattern(text) {
  return escapeLikePattern(text).replace(/[,()*"]/g, ' ').trim();
}

async function fetchEnrollments({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('course_enrollments')
    .select(ENROLLMENT_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.courseId) query = query.eq('course_id', filters.courseId);
  const keyword = toOrSafePattern(filters.search);
  if (keyword) query = query.or(`email.ilike.%${keyword}%,username.ilike.%${keyword}%`, { referencedTable: 'profiles' });

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

async function fetchStatusCount(status) {
  const { count, error } = await supabase
    .from('course_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('status', status);
  if (error) throw error;
  return count ?? 0;
}

async function fetchCourses() {
  const { data, error } = await supabase.from('courses').select('id, title').order('title');
  if (error) throw error;
  return data;
}

async function updateEnrollment(id, payload) {
  const { data, error } = await supabase.from('course_enrollments').update(payload).eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('not updated');
}

// ---------- Stats + chips ----------

function createStat(value, label, variant) {
  const tile = createElement('div', `stat-tile stat-tile-${variant}`);
  tile.append(createElement('strong', 'stat-tile-value', String(value)), createElement('span', 'stat-tile-label', label));
  return tile;
}

async function renderStats() {
  try {
    const [pending, active, rejected, revoked] = await Promise.all(
      ['PENDING', 'ACTIVE', 'REJECTED', 'REVOKED'].map(fetchStatusCount),
    );
    elements.stats.replaceChildren(
      createStat(pending, 'Chờ duyệt', 'warning'),
      createStat(active, 'Đã kích hoạt', 'success'),
      createStat(rejected + revoked, 'Từ chối / thu hồi', 'primary'),
    );
  } catch {
    elements.stats.replaceChildren();
  }
}

function renderStatusChips() {
  elements.chips.replaceChildren(...STATUS_FILTERS.map((item) => {
    const chip = createElement('button', 'filter-chip', item.label);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(filters.status === item.value));
    chip.addEventListener('click', () => {
      filters.status = item.value;
      renderStatusChips();
      table.loadFirstPage();
    });
    return chip;
  }));
}

async function refreshAll() {
  await Promise.all([table.load(), renderStats(), refreshPendingBadge()]);
}

// ---------- Actions ----------

const ACTIONS = {
  ACTIVE: {
    title: 'Kích hoạt khóa học?',
    description: 'Thành viên sẽ vào học được ngay toàn bộ bài học của khóa học này.',
    confirmText: 'Kích hoạt',
    variant: 'primary',
    noteLabel: 'Lời nhắn cho học viên (không bắt buộc)',
    success: 'Đã kích hoạt khóa học cho học viên.',
  },
  REJECTED: {
    title: 'Từ chối yêu cầu?',
    description: 'Thành viên sẽ thấy yêu cầu bị từ chối và có thể gửi lại.',
    confirmText: 'Từ chối',
    variant: 'danger',
    noteLabel: 'Lý do / phản hồi cho học viên',
    success: 'Đã từ chối yêu cầu.',
  },
  REVOKED: {
    title: 'Thu hồi quyền học?',
    description: 'Thành viên sẽ không xem được video của khóa học nữa. Tiến độ học vẫn được giữ lại.',
    confirmText: 'Thu hồi',
    variant: 'danger',
    noteLabel: 'Lý do / phản hồi cho học viên',
    success: 'Đã thu hồi quyền học.',
  },
};

function createActionForm(enrollment, action) {
  const form = createElement('form', 'enroll-form');
  form.noValidate = true;
  form.addEventListener('submit', (event) => event.preventDefault());

  const summary = createElement('div', 'enroll-course-summary');
  summary.append(
    createElement('span', 'text-secondary', `${enrollment.profiles.username} · ${enrollment.profiles.email}`),
    createElement('strong', '', enrollment.courses?.title || 'Khóa học không còn tồn tại'),
  );

  const group = createElement('div', 'form-group');
  const label = createElement('label', '', action.noteLabel);
  label.htmlFor = 'enrollment-admin-note';
  const textarea = document.createElement('textarea');
  textarea.id = 'enrollment-admin-note';
  textarea.name = 'adminNote';
  textarea.rows = 3;
  textarea.maxLength = NOTE_MAX_LENGTH;
  // Luôn để trống: mỗi lần xử lý là một lời nhắn mới, không mang lời nhắn cũ sang
  group.append(label, textarea, createElement('small', 'form-hint', 'Học viên nhận nội dung này trong thông báo.'));

  const message = createElement('div', 'form-message form-message-error');
  message.hidden = true;
  form.append(createElement('p', 'modal-text', action.description), summary, message, group);
  return form;
}

function openActionModal(enrollment, nextStatus) {
  const action = ACTIONS[nextStatus];
  const form = createActionForm(enrollment, action);
  let isSaving = false;

  async function submit() {
    if (isSaving) return false;
    isSaving = true;
    try {
      await updateEnrollment(enrollment.id, {
        status: nextStatus,
        admin_note: form.elements.adminNote.value.trim() || null,
      });
      showToast(action.success, 'success');
      refreshAll();
      return true;
    } catch {
      const message = form.querySelector('.form-message');
      message.textContent = 'Không thể cập nhật. Vui lòng thử lại.';
      message.hidden = false;
      return false;
    } finally {
      isSaving = false;
    }
  }

  openModal({
    title: action.title,
    body: form,
    actions: [
      { label: 'Hủy', variant: 'secondary' },
      { label: action.confirmText, variant: action.variant, onClick: submit },
    ],
  });
}

function openDetailModal(enrollment) {
  const status = ENROLLMENT_STATUSES[enrollment.status] || { label: enrollment.status, badge: 'default' };
  const list = createElement('dl', 'info-list');
  const rows = [
    ['Học viên', `${enrollment.profiles.full_name || enrollment.profiles.username} (${enrollment.profiles.email})`],
    ['Khóa học', enrollment.courses?.title || '—'],
    ['Số điện thoại', enrollment.phone || '—'],
    ['Lời nhắn', enrollment.note || '—'],
    ['Ngày gửi', formatDate(enrollment.created_at)],
    ['Kích hoạt', enrollment.activated_at ? formatDate(enrollment.activated_at) : '—'],
    ['Phản hồi', enrollment.admin_note || '—'],
  ];
  rows.forEach(([label, value]) => list.append(createElement('dt', '', label), createElement('dd', 'enroll-detail-value', value)));
  const statusRow = createElement('dd');
  statusRow.appendChild(createBadge(status.label, status.badge));
  list.prepend(createElement('dt', '', 'Trạng thái'), statusRow);

  openModal({ title: 'Chi tiết đăng ký', body: list, actions: [{ label: 'Đóng', variant: 'secondary' }] });
}

// ---------- Render ----------

function createButton(text, className, onClick) {
  const button = createElement('button', `btn ${className} btn-sm`, text);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function createActionsCell(enrollment) {
  const cell = createElement('td');
  const wrapper = createElement('div', 'table-actions');
  if (enrollment.status === 'PENDING') {
    wrapper.append(
      createButton('Kích hoạt', 'btn-primary', () => openActionModal(enrollment, 'ACTIVE')),
      createButton('Từ chối', 'btn-secondary', () => openActionModal(enrollment, 'REJECTED')),
    );
  } else if (enrollment.status === 'ACTIVE') {
    wrapper.appendChild(createButton('Thu hồi', 'btn-secondary', () => openActionModal(enrollment, 'REVOKED')));
  } else {
    wrapper.appendChild(createButton('Kích hoạt', 'btn-primary', () => openActionModal(enrollment, 'ACTIVE')));
  }
  wrapper.appendChild(createButton('Chi tiết', 'btn-secondary', () => openDetailModal(enrollment)));
  cell.appendChild(wrapper);
  return cell;
}

function createLearnerCell(learner) {
  const cell = createElement('td', 'cell-title');
  cell.append(
    createElement('span', '', learner.full_name || learner.username),
    createElement('small', 'cell-subtitle', learner.email),
  );
  return cell;
}

function createCourseCell(course) {
  const cell = createElement('td', 'cell-title');
  if (!course) {
    cell.textContent = '—';
    return cell;
  }
  const link = createElement('a', '', course.title);
  link.href = `course-edit.html?id=${encodeURIComponent(course.id)}`;
  cell.appendChild(link);
  return cell;
}

function createEnrollmentRow(enrollment) {
  const row = document.createElement('tr');
  const status = ENROLLMENT_STATUSES[enrollment.status] || { label: enrollment.status, badge: 'default' };
  const statusCell = createElement('td');
  statusCell.appendChild(createBadge(status.label, status.badge));
  const noteCell = createElement('td', 'cell-description text-secondary', enrollment.note || '—');
  if (enrollment.note) noteCell.title = enrollment.note;

  row.append(
    createLearnerCell(enrollment.profiles),
    createCourseCell(enrollment.courses),
    createElement('td', 'cell-id', enrollment.phone || '—'),
    noteCell,
    statusCell,
    createElement('td', 'text-secondary', formatDate(enrollment.created_at)),
    createActionsCell(enrollment),
  );
  return row;
}

function getEmptyState() {
  if (filters.search || filters.courseId) return { message: 'Không tìm thấy đăng ký phù hợp.' };
  if (filters.status === 'PENDING') return { message: 'Không có yêu cầu nào đang chờ duyệt.' };
  return { message: 'Chưa có đăng ký nào.' };
}

// ---------- Init ----------

async function loadCourseOptions() {
  try {
    const courses = await fetchCourses();
    courses.forEach((course) => {
      const option = createElement('option', '', course.title);
      option.value = course.id;
      elements.courseFilter.appendChild(option);
    });
  } catch {
    showToast('Không tải được danh sách khóa học.', 'error');
  }
}

async function initEnrollmentsPage() {
  const profile = await initLayout('Đăng ký học');
  if (!profile) return;

  elements.stats = document.getElementById('enrollment-stats');
  elements.chips = document.getElementById('status-chips');
  elements.searchInput = document.getElementById('search-input');
  elements.courseFilter = document.getElementById('course-filter');

  table = createPagedTable({
    tbody: document.getElementById('enrollments-body'),
    paginationContainer: document.getElementById('pagination'),
    columnCount: COLUMN_COUNT,
    fetchPage: fetchEnrollments,
    renderRow: createEnrollmentRow,
    getEmptyState,
  });

  renderStatusChips();
  elements.searchInput.addEventListener('input', debounce(() => {
    filters.search = elements.searchInput.value.trim();
    table.loadFirstPage();
  }, 350));
  elements.courseFilter.addEventListener('change', () => {
    filters.courseId = elements.courseFilter.value;
    table.loadFirstPage();
  });

  await Promise.all([loadCourseOptions(), table.load(), renderStats()]);
}

initEnrollmentsPage();
