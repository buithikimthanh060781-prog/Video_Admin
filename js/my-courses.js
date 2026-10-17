// my-courses module: khóa học thành viên đã đăng ký + trạng thái + tiến độ học
import { supabase } from './supabase.js?v=202610171951';
import { initLayout } from './layout.js?v=202610171951';
import { createBadge, createStateView } from './components.js?v=202610171951';
import { setCourseImage } from './course-art.js?v=202610171951';
import { ENROLLMENT_STATUSES, getLearnUrl } from './enrollment.js?v=202610171951';
import { computeProgress, createProgressBar } from './progress.js?v=202610171951';
import { createElement, formatDate } from './utils.js?v=202610171951';

const ENROLLMENT_COLUMNS = 'id, status, phone, admin_note, created_at, activated_at, courses(id, slug, title, thumbnail_url, instructor_name, course_categories(name), course_sections(course_lessons(id, is_active)))';

const FILTERS = [
  { key: 'all', label: 'Tất cả', match: () => true },
  { key: 'learning', label: 'Đang học', match: (item) => item.status === 'ACTIVE' },
  { key: 'pending', label: 'Chờ kích hoạt', match: (item) => item.status === 'PENDING' },
  { key: 'other', label: 'Khác', match: (item) => item.status === 'REJECTED' || item.status === 'REVOKED' },
];

const state = { items: [], filter: 'all' };
const elements = {};

// ---------- Data ----------

async function fetchEnrollments(userId) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchCompletedLessonIds(userId) {
  const { data, error } = await supabase.from('lesson_progress').select('lesson_id').eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((row) => row.lesson_id));
}

function getActiveLessonIds(course) {
  return (course?.course_sections || [])
    .flatMap((section) => section.course_lessons || [])
    .filter((lesson) => lesson.is_active)
    .map((lesson) => lesson.id);
}

function buildItems(enrollments, completedIds) {
  return enrollments.map((enrollment) => ({
    ...enrollment,
    progress: computeProgress(getActiveLessonIds(enrollment.courses), completedIds),
  }));
}

// ---------- Render ----------

function createStat(value, label, variant) {
  const tile = createElement('div', `stat-tile stat-tile-${variant}`);
  tile.append(createElement('strong', 'stat-tile-value', String(value)), createElement('span', 'stat-tile-label', label));
  return tile;
}

function renderStats() {
  const learning = state.items.filter((item) => item.status === 'ACTIVE');
  elements.stats.replaceChildren(
    createStat(learning.length, 'Đang học', 'primary'),
    createStat(state.items.filter((item) => item.status === 'PENDING').length, 'Chờ kích hoạt', 'warning'),
    createStat(learning.filter((item) => item.progress.total > 0 && item.progress.percent === 100).length, 'Đã hoàn thành', 'success'),
  );
}

function renderFilters() {
  elements.filters.replaceChildren(...FILTERS.map((filter) => {
    const count = state.items.filter(filter.match).length;
    const button = createElement('button', 'filter-chip', `${filter.label} (${count})`);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.filter === filter.key));
    button.addEventListener('click', () => {
      state.filter = filter.key;
      renderFilters();
      renderList();
    });
    return button;
  }));
}

function createThumbnail(course) {
  const wrapper = createElement('div', 'my-course-thumb');
  const image = createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  setCourseImage(image, course?.thumbnail_url, course?.course_categories?.name);
  wrapper.appendChild(image);
  return wrapper;
}

function getDetailUrl(course) {
  return `explore-detail.html?slug=${encodeURIComponent(course.slug)}`;
}

function getLearnLabel(progress) {
  if (progress.percent === 100 && progress.total > 0) return 'Xem lại khóa học';
  return progress.completed > 0 ? 'Tiếp tục học' : 'Bắt đầu học';
}

function createActionLink(text, href, className) {
  const link = createElement('a', className, text);
  link.href = href;
  return link;
}

function createCardBody(item) {
  const course = item.courses;
  const status = ENROLLMENT_STATUSES[item.status] || { label: item.status, badge: 'default' };
  const body = createElement('div', 'my-course-body');

  const tags = createElement('div', 'course-card-tags');
  tags.appendChild(createBadge(status.label, status.badge));
  if (course.course_categories?.name) tags.appendChild(createBadge(course.course_categories.name, 'primary'));
  body.append(tags, createElement('h3', 'my-course-title', course.title));
  if (course.instructor_name) body.appendChild(createElement('span', 'course-card-meta', course.instructor_name));

  const footer = createElement('div', 'my-course-footer');
  if (item.status === 'ACTIVE') {
    // Khóa học chưa có bài học: không hiện "0% · 0/0 bài học" gây hiểu nhầm
    body.appendChild(item.progress.total > 0
      ? createProgressBar(item.progress, { compact: true })
      : createElement('p', 'my-course-note', 'Khóa học đang cập nhật bài học.'));
    footer.appendChild(createActionLink(getLearnLabel(item.progress), getLearnUrl(course.id), 'btn btn-gradient btn-sm'));
  } else if (item.status === 'PENDING') {
    body.appendChild(createElement('p', 'my-course-note', `Đã đăng ký ngày ${formatDate(item.created_at)}. Quản trị viên sẽ liên hệ và kích hoạt cho bạn.`));
    footer.appendChild(createActionLink('Xem khóa học', getDetailUrl(course), 'btn btn-secondary btn-sm'));
  } else {
    const text = item.admin_note ? `Phản hồi: ${item.admin_note}` : 'Bạn có thể đăng ký lại khóa học.';
    body.appendChild(createElement('p', 'my-course-note', text));
    footer.appendChild(createActionLink('Đăng ký lại', getDetailUrl(course), 'btn btn-secondary btn-sm'));
  }
  body.appendChild(footer);
  return body;
}

function createCard(item) {
  const card = createElement('article', 'my-course-card');
  if (!item.courses) {
    card.classList.add('is-unavailable');
    const body = createElement('div', 'my-course-body');
    body.append(
      createBadge(ENROLLMENT_STATUSES[item.status]?.label || item.status, 'default'),
      createElement('p', 'my-course-note', 'Khóa học này hiện không còn hiển thị.'),
    );
    card.append(createThumbnail(null), body);
    return card;
  }
  card.append(createThumbnail(item.courses), createCardBody(item));
  return card;
}

function renderList() {
  const filter = FILTERS.find((item) => item.key === state.filter);
  const items = state.items.filter(filter.match);
  if (state.items.length === 0) {
    elements.grid.replaceChildren(createStateView('empty', {
      message: 'Bạn chưa đăng ký khóa học nào.',
      actionLabel: 'Khám phá khóa học',
      onAction: () => { location.href = 'explore.html'; },
    }));
    return;
  }
  if (items.length === 0) {
    elements.grid.replaceChildren(createStateView('empty', { message: 'Không có khóa học nào trong mục này.' }));
    return;
  }
  elements.grid.replaceChildren(...items.map(createCard));
}

// ---------- Init ----------

async function loadPage(profile) {
  elements.grid.replaceChildren(createStateView('loading'));
  try {
    const [enrollments, completedIds] = await Promise.all([
      fetchEnrollments(profile.id),
      fetchCompletedLessonIds(profile.id),
    ]);
    state.items = buildItems(enrollments, completedIds);
    renderStats();
    renderFilters();
    renderList();
  } catch {
    elements.grid.replaceChildren(createStateView('error', { actionLabel: 'Thử lại', onAction: () => loadPage(profile) }));
  }
}

async function initMyCoursesPage() {
  const profile = await initLayout('Khóa học của tôi', { adminOnly: false });
  if (!profile) return;
  elements.stats = document.getElementById('my-stats');
  elements.filters = document.getElementById('my-filters');
  elements.grid = document.getElementById('my-course-grid');
  await loadPage(profile);
}

initMyCoursesPage();
