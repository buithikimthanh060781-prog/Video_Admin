// Checklist "Bắt đầu quản trị" trên trang Tổng quan: hướng dẫn admin mới các việc cần làm theo thứ tự.
// Dấu tick tự động theo dữ liệu thật trong hệ thống (không tick tay). Có thể thu gọn; lựa chọn được nhớ trong trình duyệt.
import { supabase } from './supabase.js?v=202610180851';
import { createIcon } from './icons.js?v=202610180851';
import { createElement } from './utils.js?v=202610180851';

const COLLAPSE_KEY = 'admin-checklist-collapsed';

// count(): trả về số bản ghi; done(count) => đã xong chưa
const count = (table, apply = (query) => query) => async () => {
  const { count: total, error } = await apply(supabase.from(table).select('id', { count: 'exact', head: true }));
  if (error) throw error;
  return total ?? 0;
};

const STEPS = [
  {
    title: 'Tạo lĩnh vực khóa học',
    hint: 'Ví dụ: Thần số học, Ngoại ngữ, Tài chính. Mỗi khóa học thuộc một lĩnh vực.',
    href: 'course-categories.html',
    action: 'Mở Lĩnh vực khóa học',
    load: count('course_categories'),
    isDone: (n) => n > 0,
  },
  {
    title: 'Thêm video vào kho video',
    hint: 'Tải video lên hoặc dán link YouTube. Video sẽ được chọn vào bài học của khóa học.',
    href: 'video-edit.html',
    action: 'Thêm video',
    load: count('videos'),
    isDone: (n) => n > 0,
  },
  {
    title: 'Tạo khóa học',
    hint: 'Nhập tên, lĩnh vực, giảng viên, giá và ảnh bìa ở tab "Thông tin chung".',
    href: 'course-edit.html',
    action: 'Tạo khóa học',
    load: count('courses'),
    isDone: (n) => n > 0,
  },
  {
    title: 'Thêm chương và bài học cho khóa học',
    hint: 'Ở tab "Chương trình học": thêm chương, rồi chọn video có sẵn cho từng bài học.',
    href: 'courses.html',
    action: 'Mở Khóa học',
    load: count('course_lessons'),
    isDone: (n) => n > 0,
  },
  {
    title: 'Xuất bản khóa học',
    hint: 'Ở tab "Xuất bản" chọn Công khai. Khóa học cần có lĩnh vực và ảnh bìa mới xuất bản được.',
    href: 'courses.html',
    action: 'Mở Khóa học',
    load: count('courses', (query) => query.eq('status', 'PUBLISHED')),
    isDone: (n) => n > 0,
  },
  {
    title: 'Kích hoạt thành viên mới',
    hint: 'Thành viên đăng ký xong ở trạng thái "Chờ kích hoạt". Bấm Kích hoạt để họ đăng nhập được.',
    href: 'users.html?status=PENDING',
    action: 'Mở Thành viên',
    // Xong khi không còn thành viên chờ kích hoạt và đã có ít nhất một thành viên hoạt động
    load: async () => {
      const [pending, members] = await Promise.all([
        count('profiles', (query) => query.eq('status', 'PENDING'))(),
        count('profiles', (query) => query.eq('role', 'USER').eq('status', 'ACTIVE'))(),
      ]);
      return { pending, members };
    },
    isDone: ({ pending, members }) => pending === 0 && members > 0,
    detail: ({ pending }) => (pending > 0 ? `Đang có ${pending} thành viên chờ kích hoạt.` : ''),
  },
  {
    title: 'Duyệt đăng ký học',
    hint: 'Thành viên bấm Đăng ký khóa học thì yêu cầu hiện ở "Duyệt đăng ký học". Liên hệ qua số điện thoại rồi Kích hoạt.',
    href: 'enrollments.html',
    action: 'Mở Duyệt đăng ký học',
    load: async () => {
      const [pending, active] = await Promise.all([
        count('course_enrollments', (query) => query.eq('status', 'PENDING'))(),
        count('course_enrollments', (query) => query.eq('status', 'ACTIVE'))(),
      ]);
      return { pending, active };
    },
    // Đã từng kích hoạt cho học viên và không còn yêu cầu nào đang chờ
    isDone: ({ pending, active }) => pending === 0 && active > 0,
    detail: ({ pending }) => (pending > 0 ? `Đang có ${pending} yêu cầu chờ duyệt.` : ''),
  },
];

// ---------- Render ----------

function createStepItem(step, index, state) {
  const item = createElement('li', state.isDone ? 'onboard-step is-done' : 'onboard-step');

  const mark = createElement('span', 'onboard-mark');
  if (state.isDone) mark.appendChild(createIcon('check', 16));
  else mark.textContent = String(index + 1);
  mark.setAttribute('aria-hidden', 'true');

  const text = createElement('div', 'onboard-text');
  const title = createElement('strong', 'onboard-title', step.title);
  const status = createElement('span', 'onboard-status', state.isDone ? 'Đã xong' : 'Chưa làm');
  title.appendChild(status);
  text.append(title, createElement('p', 'onboard-hint', step.hint));
  if (state.detail) text.appendChild(createElement('p', 'onboard-detail', state.detail));

  const link = createElement('a', state.isDone ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm', state.isDone ? 'Xem lại' : step.action);
  link.href = step.href;

  item.append(mark, text, link);
  return item;
}

function isCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(value) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    // trình duyệt chặn lưu trữ: bỏ qua
  }
}

function render(container, states) {
  const doneCount = states.filter((state) => state.isDone).length;
  const total = STEPS.length;
  const percent = Math.round((doneCount * 100) / total);
  const allDone = doneCount === total;

  const head = createElement('div', 'onboard-head');
  const titleBox = createElement('div');
  titleBox.append(
    createElement('h2', 'card-title', 'Bắt đầu quản trị'),
    createElement('p', 'onboard-sub', allDone
      ? 'Bạn đã hoàn thành tất cả các bước thiết lập cơ bản.'
      : 'Làm lần lượt các bước dưới đây để website sẵn sàng đón học viên. Dấu tick tự cập nhật theo dữ liệu thật.'),
  );
  const toggle = createElement('button', 'btn btn-secondary btn-sm');
  toggle.type = 'button';
  head.append(titleBox, toggle);

  const progress = createElement('div', 'onboard-progress');
  const track = createElement('div', 'progress-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(percent));
  track.setAttribute('aria-label', 'Tiến độ thiết lập');
  const fill = createElement('div', allDone ? 'progress-fill is-done' : 'progress-fill');
  fill.style.width = `${percent}%`;
  track.appendChild(fill);
  progress.append(track, createElement('span', 'onboard-count', `${doneCount}/${total} bước`));

  const list = createElement('ol', 'onboard-list');
  list.append(...STEPS.map((step, index) => createStepItem(step, index, states[index])));

  const body = createElement('div', 'onboard-body');
  body.append(progress, list);

  const setCollapsed = (collapsed) => {
    body.hidden = collapsed;
    toggle.textContent = collapsed ? 'Hiện hướng dẫn' : 'Thu gọn';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    saveCollapsed(collapsed);
  };
  toggle.addEventListener('click', () => setCollapsed(!body.hidden));

  container.replaceChildren(head, body);
  container.hidden = false;
  // Lần đầu: mở. Đã xong hết: thu gọn mặc định. Người dùng đã chọn thì theo lựa chọn đó.
  const saved = (() => { try { return localStorage.getItem(COLLAPSE_KEY); } catch { return null; } })();
  setCollapsed(saved === null ? allDone : saved === '1');
}

// Lỗi tải một bước thì bước đó hiện chưa tick (không chặn trang Tổng quan)
export async function renderAdminChecklist(container) {
  if (!container) return;
  const results = await Promise.allSettled(STEPS.map((step) => step.load()));
  const states = results.map((result, index) => {
    if (result.status !== 'fulfilled') return { isDone: false, detail: '' };
    const value = result.value;
    return { isDone: STEPS[index].isDone(value), detail: STEPS[index].detail?.(value) || '' };
  });
  render(container, states);
}
