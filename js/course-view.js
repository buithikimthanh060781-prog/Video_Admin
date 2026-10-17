// Hiển thị khóa học theo góc nhìn khách hàng. Dùng cho trang course-detail.html và tab "Xem trước" của admin.
// Khách chỉ thấy thông tin + đề cương. Video chỉ phát được với bài "Học thử" và khi đã đăng nhập.
import { supabase } from './supabase.js?v=202610172049';
import { createBadge, createStateView, showToast } from './components.js?v=202610172049';
import { setCourseImage } from './course-art.js?v=202610172049';
import { COURSE_LANGUAGES, COURSE_LEVELS } from './course-utils.js?v=202610172049';
import { openVideoModal } from './player.js?v=202610172049';
import { createElement, formatCurrency } from './utils.js?v=202610172049';

const SECTION_COLUMNS = 'id, title, description, sort_order, course_lessons(id, video_id, title, description, sort_order, is_preview, is_active)';

// ---------- Data ----------

function sortByOrder(items) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

// Chương + bài học đang hiển thị, đã sắp xếp. RLS đã lọc theo quyền của người xem.
export async function fetchCourseSections(courseId) {
  const { data, error } = await supabase
    .from('course_sections')
    .select(SECTION_COLUMNS)
    .eq('course_id', courseId)
    .order('sort_order')
    .order('id');
  if (error) throw error;
  return sortByOrder(data).map((section) => ({
    ...section,
    course_lessons: sortByOrder(section.course_lessons.filter((lesson) => lesson.is_active)),
  }));
}

export function countLessons(sections) {
  return sections.reduce((total, section) => total + section.course_lessons.length, 0);
}

// ---------- Shared pieces ----------

// Giá thực tế = giá khuyến mại (nếu có) hoặc giá niêm yết; bằng 0 thì hiện "Miễn phí"
export function createPriceView(course) {
  const wrapper = createElement('span', 'price-view');
  const hasSale = course.sale_price !== null && course.sale_price < course.price;
  const finalPrice = hasSale ? course.sale_price : course.price;
  wrapper.appendChild(createElement('strong', 'price-current', finalPrice > 0 ? formatCurrency(finalPrice) : 'Miễn phí'));
  if (hasSale) wrapper.appendChild(createElement('span', 'price-old', formatCurrency(course.price)));
  return wrapper;
}

function createThumbnail(course) {
  const image = createElement('img');
  image.alt = '';
  setCourseImage(image, course.thumbnail_url, course.course_categories?.name);
  return image;
}

function createTextBlock(title, text) {
  if (!text) return null;
  const block = createElement('section', 'course-block');
  block.append(createElement('h2', 'course-block-title', title), createElement('p', 'course-text', text));
  return block;
}

function createListBlock(title, text) {
  const lines = (text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const list = createElement('ul', 'outcome-list');
  list.append(...lines.map((line) => createElement('li', '', line)));
  const block = createElement('section', 'course-block');
  block.append(createElement('h2', 'course-block-title', title), list);
  return block;
}

// Nút đăng ký trong tab "Xem trước" của admin: chỉ minh họa, không gửi yêu cầu
function createPreviewCta() {
  const cta = createElement('div', 'enroll-cta');
  const button = createElement('button', 'btn btn-primary btn-block', 'Đăng ký');
  button.type = 'button';
  button.disabled = true;
  cta.append(button, createElement('small', 'enroll-hint', 'Bản xem trước: nút đăng ký chỉ hoạt động trên trang khách.'));
  return cta;
}

// ---------- Curriculum ----------

// Chỉ bài "Học thử" mới mở video, và chỉ khi đã đăng nhập (RLS của videos/Storage vẫn là lớp bảo vệ thật).
async function watchPreviewLesson(lesson, isLoggedIn) {
  if (!isLoggedIn) {
    showToast('Vui lòng đăng nhập để xem thử bài học.', 'info');
    return;
  }
  if (!lesson.video_id) {
    showToast('Video học thử hiện chưa khả dụng.', 'warning');
    return;
  }
  const { data, error } = await supabase
    .from('videos')
    .select('id, video_source, video_url, storage_path')
    .eq('id', lesson.video_id)
    .maybeSingle();
  if (error || !data) {
    showToast('Video học thử hiện chưa khả dụng.', 'warning');
    return;
  }
  openVideoModal({ ...data, title: lesson.title });
}

function createLessonItem(lesson, index, isLoggedIn) {
  const item = createElement('li', 'curriculum-lesson');
  const info = createElement('div', 'curriculum-lesson-info');
  info.appendChild(createElement('span', 'curriculum-lesson-title', `${index + 1}. ${lesson.title}`));
  if (lesson.description) info.appendChild(createElement('small', 'text-secondary', lesson.description));
  item.appendChild(info);

  if (lesson.is_preview) {
    const actions = createElement('div', 'curriculum-lesson-actions');
    actions.appendChild(createBadge('Học thử', 'primary'));
    if (lesson.video_id) {
      const watchButton = createElement('button', 'btn btn-secondary btn-sm', 'Xem thử');
      watchButton.type = 'button';
      watchButton.addEventListener('click', () => watchPreviewLesson(lesson, isLoggedIn));
      actions.appendChild(watchButton);
    }
    item.appendChild(actions);
  }
  return item;
}

function createSectionItem(section, index, isLoggedIn) {
  const details = createElement('details', 'curriculum-section');
  if (index === 0) details.open = true;

  const summary = createElement('summary', 'curriculum-summary');
  summary.append(
    createElement('span', 'curriculum-section-title', `Chương ${index + 1}: ${section.title}`),
    createElement('span', 'text-secondary', `${section.course_lessons.length} bài học`),
  );
  details.appendChild(summary);

  if (section.description) details.appendChild(createElement('p', 'text-secondary curriculum-description', section.description));
  const lessons = createElement('ul', 'curriculum-lessons');
  if (section.course_lessons.length === 0) {
    lessons.appendChild(createElement('li', 'curriculum-lesson text-secondary', 'Chương này chưa có bài học.'));
  } else {
    lessons.append(...section.course_lessons.map((lesson, lessonIndex) => createLessonItem(lesson, lessonIndex, isLoggedIn)));
  }
  details.appendChild(lessons);
  return details;
}

function createCurriculumBlock(sections, isLoggedIn) {
  const block = createElement('section', 'course-block');
  block.appendChild(createElement('h2', 'course-block-title', 'Nội dung khóa học'));
  if (sections.length === 0) {
    block.appendChild(createElement('p', 'text-secondary', 'Nội dung khóa học đang được cập nhật.'));
    return block;
  }
  block.appendChild(createElement('p', 'text-secondary', `${sections.length} chương · ${countLessons(sections)} bài học`));
  const list = createElement('div', 'curriculum');
  list.append(...sections.map((section, index) => createSectionItem(section, index, isLoggedIn)));
  block.appendChild(list);
  return block;
}

// ---------- Main ----------

function createInfoList(course, sections) {
  const items = [
    ['Giảng viên', course.instructor_name || '—'],
    ['Trình độ', COURSE_LEVELS[course.level] || '—'],
    ['Ngôn ngữ', COURSE_LANGUAGES[course.language] || course.language],
    ['Số bài học', String(countLessons(sections))],
  ];
  const list = createElement('dl', 'info-list course-info');
  list.append(...items.flatMap(([label, value]) => [createElement('dt', '', label), createElement('dd', '', value)]));
  return list;
}

function createAside(course, sections, renderCta) {
  const aside = createElement('aside', 'course-aside card');
  const banner = createElement('div', 'course-banner');
  banner.appendChild(createThumbnail(course));
  const cta = renderCta ? renderCta() : createPreviewCta();
  aside.append(banner, createPriceView(course), cta, createInfoList(course, sections));
  return aside;
}

function createHeading(course) {
  const heading = createElement('div', 'course-heading');
  if (course.course_categories?.name) heading.appendChild(createBadge(course.course_categories.name, 'primary'));
  heading.appendChild(createElement('h1', 'course-title', course.title));
  if (course.short_description) heading.appendChild(createElement('p', 'course-lead', course.short_description));
  return heading;
}

// course: hàng courses (+ course_categories(name)); sections: kết quả fetchCourseSections
// renderCta(): trả về khối nút đăng ký (bỏ trống = bản xem trước của admin)
export function renderCourseView(container, { course, sections, isLoggedIn, renderCta = null }) {
  const main = createElement('div', 'course-main');
  main.append(
    createHeading(course),
    ...[
      createListBlock('Bạn sẽ học được gì', course.learning_outcomes),
      createTextBlock('Mô tả khóa học', course.description),
      createTextBlock('Đối tượng phù hợp', course.target_audience),
      createListBlock('Yêu cầu đầu vào', course.requirements),
    ].filter(Boolean),
    createCurriculumBlock(sections, isLoggedIn),
  );
  const layout = createElement('div', 'course-detail');
  layout.append(main, createAside(course, sections, renderCta));
  container.replaceChildren(layout);
}

export function renderViewState(container, type, options) {
  container.replaceChildren(createStateView(type, options));
}
