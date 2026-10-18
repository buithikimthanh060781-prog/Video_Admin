// learn module: trang học của học viên (learn.html?course=ID&lesson=ID)
// Phát video bài học, đánh dấu bài đã học, chương đã xong, thanh % hoàn thành khóa học.
// Quyền xem video do RLS (can_view_video) quyết định; trang chỉ hiển thị cho học viên ACTIVE (hoặc ADMIN, không lưu tiến độ).
import { supabase } from './supabase.js?v=202610180851';
import { initLayout } from './layout.js?v=202610180851';
import { isAdmin } from './auth.js?v=202610180851';
import { createBadge, createStateView, showToast } from './components.js?v=202610180851';
import { fetchCourseSections } from './course-view.js?v=202610180851';
import { fetchMyEnrollment } from './enrollment.js?v=202610180851';
import { createIcon } from './icons.js?v=202610180851';
import { renderPlayerInto } from './player.js?v=202610180851';
import { computeProgress, createProgressBar } from './progress.js?v=202610180851';
import { createElement } from './utils.js?v=202610180851';

// Cùng khóa với watch.js: 1 lượt xem / video / 30 phút trên mỗi trình duyệt
const VIEW_DEDUPE_MS = 30 * 60 * 1000;
const MOBILE_QUERY = '(max-width: 1024px)';

const params = new URLSearchParams(location.search);
const courseId = params.get('course') || '';
const state = {
  profile: null,
  course: null,
  sections: [],
  lessons: [],
  completed: new Set(),
  currentId: null,
  canTrack: false,
  isSaving: false,
  playerToken: 0,
};
const elements = {};

// ---------- Data ----------

async function fetchCourse(id) {
  if (!/^\d+$/.test(id)) return null;
  const { data, error } = await supabase.from('courses').select('id, title, slug').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchCompleted(userId, lessonIds) {
  if (lessonIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .in('lesson_id', lessonIds);
  if (error) throw error;
  return new Set(data.map((row) => row.lesson_id));
}

async function fetchLessonVideo(videoId) {
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, video_source, video_url, storage_path')
    .eq('id', videoId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function saveCompleted(lessonId) {
  const { error } = await supabase
    .from('lesson_progress')
    .upsert({ user_id: state.profile.id, lesson_id: lessonId }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true });
  if (error) throw error;
}

async function removeCompleted(lessonId) {
  const { error } = await supabase
    .from('lesson_progress')
    .delete()
    .eq('user_id', state.profile.id)
    .eq('lesson_id', lessonId);
  if (error) throw error;
}

// Ghi lượt xem cho thống kê video; lỗi không ảnh hưởng việc học
async function recordView(videoId) {
  const key = `viewed-video-${videoId}`;
  try {
    const viewedAt = Number(localStorage.getItem(key));
    if (viewedAt && Date.now() - viewedAt < VIEW_DEDUPE_MS) return;
    const { error } = await supabase.from('video_views').insert({ video_id: videoId, user_id: state.profile.id });
    if (!error) localStorage.setItem(key, String(Date.now()));
  } catch {
    // bỏ qua
  }
}

// ---------- Helpers ----------

function flattenLessons(sections) {
  return sections.flatMap((section, sectionIndex) => section.course_lessons.map((lesson, lessonIndex) => ({
    ...lesson,
    sectionIndex,
    lessonIndex,
    sectionTitle: section.title,
  })));
}

function getCurrentIndex() {
  return state.lessons.findIndex((lesson) => lesson.id === state.currentId);
}

function getProgress() {
  return computeProgress(state.lessons.map((lesson) => lesson.id), state.completed);
}

function pickInitialLesson() {
  const requested = Number(params.get('lesson'));
  if (state.lessons.some((lesson) => lesson.id === requested)) return requested;
  const firstUnfinished = state.lessons.find((lesson) => !state.completed.has(lesson.id));
  return (firstUnfinished || state.lessons[0]).id;
}

function createButton(content, className, onClick, { label, disabled = false } = {}) {
  const button = createElement('button', className);
  button.type = 'button';
  if (typeof content === 'string') button.textContent = content;
  else button.append(...content);
  if (label) button.setAttribute('aria-label', label);
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

// ---------- Actions ----------

function selectLesson(lessonId) {
  state.currentId = lessonId;
  history.replaceState(null, '', `learn.html?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
  renderLesson();
  renderOutline();
  if (window.matchMedia(MOBILE_QUERY).matches) elements.lessonPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function setCompleted(lessonId, isDone, { silent = false } = {}) {
  if (!state.canTrack || state.isSaving || state.completed.has(lessonId) === isDone) return;
  const wasComplete = getProgress().percent === 100;
  state.isSaving = true;
  try {
    if (isDone) await saveCompleted(lessonId);
    else await removeCompleted(lessonId);
    if (isDone) state.completed.add(lessonId);
    else state.completed.delete(lessonId);

    const isCourseDone = getProgress().percent === 100;
    if (isCourseDone && !wasComplete) showToast('Chúc mừng! Bạn đã hoàn thành toàn bộ khóa học.', 'success', 5000);
    else if (!silent) showToast(isDone ? 'Đã đánh dấu bài học là đã học xong.' : 'Đã bỏ đánh dấu bài học.', 'success');
  } catch {
    showToast('Không thể lưu tiến độ. Vui lòng thử lại.', 'error');
  } finally {
    state.isSaving = false;
    renderActions();
    renderOutline();
  }
}

// ---------- Player ----------

async function loadPlayer(lesson) {
  const token = ++state.playerToken;
  elements.player.replaceChildren(createStateView('loading'));
  if (!lesson.video_id) {
    elements.player.replaceChildren(createStateView('empty', { message: 'Bài học này chưa có video.' }));
    return;
  }
  try {
    const video = await fetchLessonVideo(lesson.video_id);
    if (token !== state.playerToken) return;
    if (!video) {
      elements.player.replaceChildren(createStateView('empty', { message: 'Video của bài học hiện chưa khả dụng.' }));
      return;
    }
    // Xem hết / xem >= 95% (cả video tải lên và YouTube) thì tự đánh dấu bài đã học
    const isPlayable = await renderPlayerInto(elements.player, { ...video, title: lesson.title }, {
      onWatched: () => {
        if (state.currentId === lesson.id) setCompleted(lesson.id, true);
      },
    });
    if (token !== state.playerToken || !isPlayable) return;
    recordView(video.id);
  } catch {
    if (token === state.playerToken) {
      elements.player.replaceChildren(createStateView('error', { actionLabel: 'Thử lại', onAction: () => loadPlayer(lesson) }));
    }
  }
}

// ---------- Render: bài học hiện tại ----------

function renderActions() {
  const index = getCurrentIndex();
  const lesson = state.lessons[index];
  const isDone = state.completed.has(lesson.id);
  const previous = state.lessons[index - 1];
  const next = state.lessons[index + 1];

  const previousButton = createButton([createElement('span', '', '← Bài trước')], 'btn btn-secondary', () => selectLesson(previous.id), {
    disabled: !previous,
  });
  const nextButton = createButton([createElement('span', '', 'Bài tiếp →')], 'btn btn-gradient', () => selectLesson(next.id), {
    disabled: !next,
  });

  const children = [previousButton];
  if (state.canTrack) {
    const toggle = createButton(
      isDone ? [createIcon('check', 16), createElement('span', '', 'Đã học xong')] : [createElement('span', '', 'Đánh dấu đã học')],
      isDone ? 'btn btn-done' : 'btn btn-secondary',
      () => setCompleted(lesson.id, !isDone),
      { label: isDone ? 'Bỏ đánh dấu đã học' : 'Đánh dấu đã học', disabled: state.isSaving },
    );
    toggle.setAttribute('aria-pressed', String(isDone));
    toggle.title = isDone ? 'Bấm để bỏ đánh dấu' : 'Đánh dấu bài này là đã học xong';
    children.push(toggle);
  }
  children.push(nextButton);
  elements.actions.replaceChildren(...children);
}

function renderLesson() {
  const index = getCurrentIndex();
  const lesson = state.lessons[index];
  elements.lessonMeta.replaceChildren(
    createBadge(`Chương ${lesson.sectionIndex + 1}`, 'primary'),
    createElement('span', 'text-secondary', `Bài ${index + 1}/${state.lessons.length} · ${lesson.sectionTitle}`),
  );
  elements.lessonTitle.textContent = lesson.title;
  elements.lessonDescription.textContent = lesson.description || '';
  elements.lessonDescription.hidden = !lesson.description;
  document.title = `${lesson.title} - ${state.course.title}`;
  renderActions();
  loadPlayer(lesson);
}

// ---------- Render: đề cương + tiến độ ----------

function createLessonStatusIcon(isDone, isCurrent, number) {
  if (isDone) {
    const icon = createElement('span', 'outline-mark is-done');
    icon.appendChild(createIcon('check', 14));
    return icon;
  }
  if (isCurrent) {
    const icon = createElement('span', 'outline-mark is-current');
    icon.appendChild(createIcon('play', 14));
    return icon;
  }
  return createElement('span', 'outline-mark', String(number));
}

function createOutlineLesson(lesson, number) {
  const isDone = state.completed.has(lesson.id);
  const isCurrent = lesson.id === state.currentId;
  const classes = ['outline-lesson', isDone ? 'is-done' : '', isCurrent ? 'is-current' : ''].filter(Boolean).join(' ');
  const button = createButton(
    [createLessonStatusIcon(isDone, isCurrent, number), createElement('span', 'outline-lesson-title', lesson.title)],
    classes,
    () => selectLesson(lesson.id),
    { label: `${lesson.title}${isDone ? ' (đã học xong)' : ''}` },
  );
  if (isCurrent) button.setAttribute('aria-current', 'step');
  const item = createElement('li');
  item.appendChild(button);
  return item;
}

function createOutlineSection(section, sectionIndex) {
  const lessonIds = section.course_lessons.map((lesson) => lesson.id);
  const { completed, total } = computeProgress(lessonIds, state.completed);
  const isDone = total > 0 && completed === total;

  const block = createElement('section', isDone ? 'outline-section is-done' : 'outline-section');
  const head = createElement('div', 'outline-section-head');
  const title = createElement('h3', 'outline-section-title', `Chương ${sectionIndex + 1}: ${section.title}`);
  const status = isDone
    ? createBadge('Đã xong', 'success')
    : createElement('span', 'outline-section-count', `${completed}/${total}`);
  head.append(title, status);

  const list = createElement('ol', 'outline-lessons');
  let number = state.sections.slice(0, sectionIndex).reduce((sum, item) => sum + item.course_lessons.length, 0);
  section.course_lessons.forEach((lesson) => {
    number += 1;
    list.appendChild(createOutlineLesson(lesson, number));
  });
  if (section.course_lessons.length === 0) list.appendChild(createElement('li', 'text-secondary outline-empty', 'Chương chưa có bài học.'));

  block.append(head, list);
  return block;
}

// Chip "% hoàn thành" cạnh tiêu đề header (chỉ khi được lưu tiến độ)
function renderHeaderProgress(progress) {
  const headerLeft = document.querySelector('.header-left');
  if (!state.canTrack || !headerLeft) return;
  let chip = headerLeft.querySelector('.header-course-progress');
  if (!chip) {
    chip = createElement('span');
    chip.setAttribute('role', 'status');
    headerLeft.appendChild(chip);
  }
  const isDone = progress.percent === 100;
  chip.className = isDone ? 'header-course-progress is-done' : 'header-course-progress';
  chip.setAttribute('aria-label', `Đã hoàn thành ${progress.percent}% khóa học`);
  const track = createElement('span', 'header-course-progress-track');
  const fill = createElement('span', 'header-course-progress-fill');
  fill.style.width = `${progress.percent}%`;
  track.appendChild(fill);
  chip.replaceChildren(track, createElement('span', '', isDone ? 'Hoàn thành' : `${progress.percent}% hoàn thành`));
}

function renderOutline() {
  const progress = getProgress();
  renderHeaderProgress(progress);
  const children = [];
  if (state.canTrack) {
    children.push(createProgressBar(progress, { label: 'Tiến độ khóa học' }));
    if (progress.percent === 100) {
      const done = createElement('div', 'learn-complete');
      done.append(createIcon('check', 18), createElement('span', '', 'Chúc mừng! Bạn đã hoàn thành khóa học.'));
      children.push(done);
    }
  }
  children.push(...state.sections.map(createOutlineSection));
  elements.outlineBody.replaceChildren(...children);
}

// ---------- Layout ----------

function buildLayout() {
  const layout = createElement('div', 'learn-layout');

  const lessonPanel = createElement('section', 'learn-main');
  const player = createElement('div', 'player learn-player');
  const info = createElement('div', 'card learn-info');
  const meta = createElement('div', 'learn-meta');
  const title = createElement('h2', 'learn-title');
  const description = createElement('p', 'learn-description');
  const actions = createElement('div', 'learn-actions');
  info.append(meta, title, description, actions);
  lessonPanel.append(player, info);

  const outline = createElement('aside', 'card learn-outline');
  outline.setAttribute('aria-label', 'Nội dung khóa học');
  const outlineHead = createElement('div', 'learn-outline-head');
  const courseLink = createElement('a', 'learn-course-title', state.course.title);
  courseLink.href = `explore-detail.html?slug=${encodeURIComponent(state.course.slug)}`;
  outlineHead.appendChild(courseLink);
  const outlineBody = createElement('div', 'learn-outline-body');
  outline.append(outlineHead, outlineBody);

  layout.append(lessonPanel, outline);
  const children = [];
  if (!state.canTrack) {
    children.push(createElement('div', 'form-message form-message-error learn-admin-note',
      'Chế độ xem của quản trị viên: bạn chưa được kích hoạt khóa học này nên tiến độ không được lưu.'));
  }
  children.push(layout);
  elements.root.replaceChildren(...children);

  Object.assign(elements, { lessonPanel, player, lessonMeta: meta, lessonTitle: title, lessonDescription: description, actions, outlineBody });
}

function showState(type, options) {
  elements.root.replaceChildren(createStateView(type, options));
}

// ---------- Init ----------

async function loadLearnPage() {
  showState('loading');
  try {
    const [course, enrollment] = await Promise.all([
      fetchCourse(courseId),
      fetchMyEnrollment(courseId, state.profile.id).catch(() => null),
    ]);
    const isEnrolled = enrollment?.status === 'ACTIVE';
    if (!course) {
      showState('empty', {
        message: 'Không tìm thấy khóa học hoặc bạn chưa được kích hoạt khóa học này.',
        actionLabel: 'Về khóa học của tôi',
        onAction: () => { location.href = 'my-courses.html'; },
      });
      return;
    }
    if (!isEnrolled && !isAdmin(state.profile)) {
      showState('empty', {
        message: 'Bạn chưa được kích hoạt khóa học này. Hãy bấm Đăng ký ở trang khóa học để được quản trị viên kích hoạt.',
        actionLabel: 'Xem khóa học',
        onAction: () => { location.href = `explore-detail.html?slug=${encodeURIComponent(course.slug)}`; },
      });
      return;
    }

    state.course = course;
    state.canTrack = isEnrolled;
    state.sections = await fetchCourseSections(course.id);
    state.lessons = flattenLessons(state.sections);
    if (state.lessons.length === 0) {
      showState('empty', { message: 'Khóa học đang được cập nhật, chưa có bài học nào.' });
      return;
    }
    state.completed = isEnrolled
      ? await fetchCompleted(state.profile.id, state.lessons.map((lesson) => lesson.id))
      : new Set();
    state.currentId = pickInitialLesson();

    elements.breadcrumb.textContent = course.title;
    const headerTitle = document.querySelector('.header-title');
    if (headerTitle) {
      headerTitle.textContent = course.title;
      headerTitle.title = course.title;
    }
    buildLayout();
    renderLesson();
    renderOutline();
  } catch {
    showState('error', { actionLabel: 'Thử lại', onAction: loadLearnPage });
  }
}

async function initLearnPage() {
  state.profile = await initLayout('Học', { adminOnly: false });
  if (!state.profile) return;
  elements.root = document.getElementById('learn-root');
  elements.breadcrumb = document.getElementById('breadcrumb-current');
  await loadLearnPage();
}

initLearnPage();
