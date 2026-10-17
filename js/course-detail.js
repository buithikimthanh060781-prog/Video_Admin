// course-detail module: chi tiết một khóa học (?slug=...)
// Dùng cho course-detail.html (trang công khai) và explore-detail.html (trong hệ thống, body[data-layout="app"]).
import { supabase } from './supabase.js?v=202610171951';
import { initLayout } from './layout.js?v=202610171951';
import { HOME_PAGE, initPublicLayout } from './public-layout.js?v=202610171951';
import { openLoginModal } from './login-modal.js?v=202610171951';
import { fetchCourseSections, renderCourseView, renderViewState } from './course-view.js?v=202610171951';
import { createEnrollmentCta, fetchMyEnrollment } from './enrollment.js?v=202610171951';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COURSE_COLUMNS = 'id, title, slug, instructor_name, short_description, description, target_audience, learning_outcomes, requirements, level, language, thumbnail_url, price, sale_price, status, course_categories(name)';

const isAppLayout = document.body.dataset.layout === 'app';
const LIST_PAGE = isAppLayout ? 'explore.html' : HOME_PAGE;
const slug = new URLSearchParams(location.search).get('slug') || '';
const elements = {};

// Khách chỉ thấy khóa học PUBLISHED; học viên đã kích hoạt vẫn thấy khóa học của mình khi bị ẩn (RLS)
async function fetchCourse() {
  if (!SLUG_PATTERN.test(slug)) return null;
  const { data, error } = await supabase.from('courses').select(COURSE_COLUMNS).eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}

// Lỗi khi đọc đăng ký không chặn việc xem khóa học
async function fetchEnrollmentSafe(courseId, profile) {
  if (!profile) return null;
  try {
    return await fetchMyEnrollment(courseId, profile.id);
  } catch {
    return null;
  }
}

function showNotFound() {
  renderViewState(elements.root, 'empty', {
    message: 'Không tìm thấy khóa học hoặc khóa học chưa được công khai.',
    actionLabel: 'Về danh sách khóa học',
    onAction: () => { location.href = LIST_PAGE; },
  });
}

async function loadCourse(profile) {
  renderViewState(elements.root, 'loading');
  try {
    const course = await fetchCourse();
    if (!course) return showNotFound();
    const [sections, enrollment] = await Promise.all([
      fetchCourseSections(course.id),
      fetchEnrollmentSafe(course.id, profile),
    ]);
    // Khóa học không công khai chỉ hiện cho học viên đã kích hoạt
    if (course.status !== 'PUBLISHED' && enrollment?.status !== 'ACTIVE') return showNotFound();

    document.title = `${course.title} - Học Vèo`;
    // Mô tả trang theo nội dung khóa học (SEO, chia sẻ liên kết)
    if (course.short_description) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', course.short_description.slice(0, 160));
    }
    elements.breadcrumb.textContent = course.title;
    renderCourseView(elements.root, {
      course,
      sections,
      isLoggedIn: Boolean(profile),
      renderCta: () => createEnrollmentCta({
        course,
        profile,
        enrollment,
        onChange: () => loadCourse(profile),
        onLoginRequired: openLoginModal,
      }),
    });
  } catch {
    renderViewState(elements.root, 'error', { actionLabel: 'Thử lại', onAction: () => loadCourse(profile) });
  }
}

async function initViewer() {
  if (isAppLayout) return initLayout('Chi tiết khóa học', { adminOnly: false });
  const { profile } = await initPublicLayout();
  return profile;
}

async function initCourseDetailPage() {
  elements.root = document.getElementById('course-root');
  elements.breadcrumb = document.getElementById('breadcrumb-current');
  const profile = await initViewer();
  if (isAppLayout && !profile) return;
  await loadCourse(profile);
}

initCourseDetailPage();
