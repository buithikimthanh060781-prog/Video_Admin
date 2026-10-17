// course-curriculum module: quản lý chương và bài học của một khóa học (tab "Chương trình học")
// Bài học chỉ tham chiếu video gốc (video_id). Xóa chương/bài chỉ xóa liên kết, không xóa video.
import { supabase } from './supabase.js?v=202610172049';
import { confirmModal, createBadge, createStateView, openModal, showToast } from './components.js?v=202610172049';
import { createVideoPicker } from './course-video-picker.js?v=202610172049';
import { VIDEO_STATUSES } from './course-utils.js?v=202610172049';
import { openVideoModal } from './player.js?v=202610172049';
import { createElement, formatDuration } from './utils.js?v=202610172049';

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;
const SECTION_COLUMNS = 'id, title, description, sort_order, course_lessons(id, section_id, video_id, title, description, sort_order, is_preview, is_active, videos(id, title, status, video_source, video_url, storage_path, duration))';

let courseId = null;
let root = null;
let sections = [];

// ---------- Data ----------

function sortByOrder(items) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

async function fetchSections() {
  const { data, error } = await supabase
    .from('course_sections')
    .select(SECTION_COLUMNS)
    .eq('course_id', courseId)
    .order('sort_order')
    .order('id');
  if (error) throw error;
  return sortByOrder(data).map((section) => ({
    ...section,
    course_lessons: sortByOrder(section.course_lessons),
  }));
}

// Mọi thao tác ghi phải ảnh hưởng ít nhất 1 dòng (RLS chặn sẽ trả về 0 dòng, không báo lỗi)
async function writeRows(request) {
  const { data, error } = await request.select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('no rows affected');
}

function nextSortOrder(items) {
  return items.length === 0 ? 0 : Math.max(...items.map((item) => item.sort_order)) + 1;
}

function swapItems(items, index, delta) {
  const copy = [...items];
  const target = index + delta;
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

// Ghi lại thứ tự 0..n-1 cho các dòng bị đổi vị trí
async function applyOrder(table, orderedItems) {
  const changes = orderedItems
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => item.sort_order !== index);
  await Promise.all(changes.map(({ item, index }) => (
    writeRows(supabase.from(table).update({ sort_order: index }).eq('id', item.id))
  )));
}

// Chạy thao tác ghi rồi tải lại dữ liệu (kể cả khi lỗi để đồng bộ với database)
async function runAction(action, { successMessage, errorMessage }) {
  try {
    await action();
    if (successMessage) showToast(successMessage, 'success');
  } catch {
    showToast(errorMessage, 'error');
  }
  await load();
}

// ---------- Form helpers ----------

function createField({ name, label, type = 'input', value = '', required = false, options = null, maxLength = null }) {
  const group = createElement('div', 'form-group');
  const labelElement = createElement('label', '', label);
  labelElement.htmlFor = `curriculum-${name}`;
  if (required) labelElement.appendChild(createElement('span', 'required', ' *'));

  const input = document.createElement(type);
  input.id = `curriculum-${name}`;
  input.name = name;
  if (type === 'textarea') input.rows = 3;
  if (maxLength) input.maxLength = maxLength;
  if (options) {
    options.forEach((item) => {
      const option = createElement('option', '', item.label);
      option.value = item.value;
      input.appendChild(option);
    });
  }
  input.value = value;

  group.append(labelElement, input);
  return group;
}

function appendFieldError(group, name) {
  const error = createElement('small', 'field-error');
  error.dataset.errorFor = name;
  group.appendChild(error);
}

function setFormError(form, name, message) {
  const errorElement = form.querySelector(`[data-error-for="${name}"]`);
  if (errorElement) errorElement.textContent = message;
  form.elements[name]?.classList.toggle('is-invalid', Boolean(message));
}

function showFormMessage(form, message) {
  const box = form.querySelector('.form-message');
  box.textContent = message;
  box.hidden = !message;
}

function createFormShell(groups) {
  const form = createElement('form', 'curriculum-form');
  form.noValidate = true;
  form.addEventListener('submit', (event) => event.preventDefault());
  const message = createElement('div', 'form-message form-message-error');
  message.hidden = true;
  groups.forEach((group) => appendFieldError(group, group.querySelector('[name]').name));
  form.append(message, ...groups);
  return form;
}

function validateTitle(form, title) {
  setFormError(form, 'title', '');
  if (!title) {
    setFormError(form, 'title', 'Vui lòng nhập tên.');
    return false;
  }
  if (title.length > TITLE_MAX_LENGTH) {
    setFormError(form, 'title', `Tên tối đa ${TITLE_MAX_LENGTH} ký tự.`);
    return false;
  }
  return true;
}

// ---------- Section modal ----------

function openSectionModal(section = null) {
  const form = createFormShell([
    createField({ name: 'title', label: 'Tên chương', value: section?.title, required: true, maxLength: TITLE_MAX_LENGTH }),
    createField({ name: 'description', label: 'Mô tả', type: 'textarea', value: section?.description || '', maxLength: DESCRIPTION_MAX_LENGTH }),
  ]);
  form.elements.title.addEventListener('input', () => setFormError(form, 'title', ''));
  let isSaving = false;

  async function submit() {
    if (isSaving) return false;
    const title = form.elements.title.value.trim();
    showFormMessage(form, '');
    if (!validateTitle(form, title)) return false;
    const payload = { title, description: form.elements.description.value.trim() || null };

    isSaving = true;
    try {
      if (section) {
        await writeRows(supabase.from('course_sections').update(payload).eq('id', section.id));
      } else {
        await writeRows(supabase.from('course_sections').insert({
          ...payload,
          course_id: courseId,
          sort_order: nextSortOrder(sections),
        }));
      }
      showToast(section ? 'Đã cập nhật chương.' : 'Đã thêm chương.', 'success');
      load();
      return true;
    } catch {
      showFormMessage(form, 'Không thể lưu chương. Vui lòng thử lại.');
      return false;
    } finally {
      isSaving = false;
    }
  }

  openModal({
    title: section ? 'Sửa chương' : 'Thêm chương',
    body: form,
    actions: [
      { label: 'Hủy', variant: 'secondary' },
      { label: 'Lưu', variant: 'primary', onClick: submit },
    ],
  });
  form.elements.title.focus();
}

async function handleDeleteSection(section) {
  const lessonCount = section.course_lessons.length;
  const confirmed = await confirmModal({
    title: 'Xóa chương?',
    message: lessonCount > 0
      ? `Chương "${section.title}" và ${lessonCount} bài học bên trong sẽ bị xóa khỏi khóa học. Video gốc trong kho không bị xóa.`
      : `Chương "${section.title}" sẽ bị xóa khỏi khóa học.`,
    confirmText: 'Xóa',
    cancelText: 'Hủy',
  });
  if (!confirmed) return;
  await runAction(
    () => writeRows(supabase.from('course_sections').delete().eq('id', section.id)),
    { successMessage: 'Đã xóa chương.', errorMessage: 'Không thể xóa chương. Vui lòng thử lại.' },
  );
}

function handleMoveSection(index, delta) {
  return runAction(
    () => applyOrder('course_sections', swapItems(sections, index, delta)),
    { errorMessage: 'Không thể đổi thứ tự chương. Vui lòng thử lại.' },
  );
}

// ---------- Lesson modal ----------

function describeVideo(video) {
  const wrapper = createElement('div', 'lesson-video-summary');
  if (!video) {
    wrapper.appendChild(createElement('span', 'text-secondary', 'Chưa chọn video.'));
    return wrapper;
  }
  const status = VIDEO_STATUSES[video.status] || { label: video.status, badge: 'default' };
  wrapper.append(
    createElement('strong', '', video.title),
    createElement('span', 'text-secondary', formatDuration(video.duration)),
    createBadge(status.label, status.badge),
  );
  return wrapper;
}

function createLessonSectionOptions() {
  return sections.map((section, index) => ({ value: String(section.id), label: `Chương ${index + 1}: ${section.title}` }));
}

function createLessonForm(section, lesson) {
  const sectionGroup = createField({
    name: 'section',
    label: 'Chương',
    type: 'select',
    value: String(section.id),
    options: createLessonSectionOptions(),
  });
  const videoGroup = createElement('div', 'form-group');
  const videoLabel = createElement('label', '', 'Video');
  videoLabel.appendChild(createElement('span', 'required', ' *'));
  const videoInput = document.createElement('input');
  videoInput.type = 'hidden';
  videoInput.name = 'video';
  const videoBox = createElement('div', 'lesson-video-box');
  videoGroup.append(videoLabel, videoInput, videoBox);

  const form = createFormShell([
    createField({ name: 'title', label: 'Tên bài học', value: lesson?.title, required: true, maxLength: TITLE_MAX_LENGTH }),
    createField({ name: 'description', label: 'Mô tả', type: 'textarea', value: lesson?.description || '', maxLength: DESCRIPTION_MAX_LENGTH }),
    sectionGroup,
    videoGroup,
    createField({
      name: 'isPreview',
      label: 'Học thử miễn phí',
      type: 'select',
      value: String(lesson?.is_preview ?? false),
      options: [{ value: 'false', label: 'Không' }, { value: 'true', label: 'Có' }],
    }),
    createField({
      name: 'isActive',
      label: 'Trạng thái hiển thị',
      type: 'select',
      value: String(lesson?.is_active ?? true),
      options: [{ value: 'true', label: 'Hiển thị' }, { value: 'false', label: 'Ẩn' }],
    }),
  ]);
  return { form, videoBox };
}

function openLessonModal({ section, lesson = null }) {
  let selectedVideo = lesson?.videos ?? null;
  const { form, videoBox } = createLessonForm(section, lesson);
  const body = createElement('div', 'lesson-modal-body');

  const chooseButton = createElement('button', 'btn btn-secondary btn-sm', 'Chọn video');
  chooseButton.type = 'button';

  const picker = createVideoPicker({
    onSelect: (video) => {
      selectedVideo = video;
      if (!form.elements.title.value.trim()) form.elements.title.value = video.title.slice(0, TITLE_MAX_LENGTH);
      setFormError(form, 'video', '');
      renderVideoBox();
      showView('form');
    },
    onCancel: () => showView('form'),
  });
  picker.element.hidden = true;

  function renderVideoBox() {
    chooseButton.textContent = selectedVideo ? 'Đổi video' : 'Chọn video';
    videoBox.replaceChildren(describeVideo(selectedVideo), chooseButton);
  }

  function showView(view) {
    const isPicker = view === 'picker';
    form.hidden = isPicker;
    picker.element.hidden = !isPicker;
    if (isPicker) picker.load();
  }

  chooseButton.addEventListener('click', () => showView('picker'));
  form.elements.title.addEventListener('input', () => setFormError(form, 'title', ''));
  renderVideoBox();
  body.append(form, picker.element);

  let isSaving = false;

  async function submit() {
    if (isSaving) return false;
    const title = form.elements.title.value.trim();
    showFormMessage(form, '');
    let isValid = validateTitle(form, title);
    setFormError(form, 'video', '');
    if (!selectedVideo) {
      setFormError(form, 'video', 'Vui lòng chọn video từ kho.');
      isValid = false;
    }
    if (!isValid) return false;

    const targetSection = sections.find((item) => String(item.id) === form.elements.section.value) || section;
    const payload = {
      title,
      description: form.elements.description.value.trim() || null,
      video_id: selectedVideo.id,
      is_preview: form.elements.isPreview.value === 'true',
      is_active: form.elements.isActive.value === 'true',
      section_id: targetSection.id,
    };

    isSaving = true;
    try {
      if (lesson) {
        // Chuyển sang chương khác: xếp vào cuối chương đó
        if (targetSection.id !== lesson.section_id) payload.sort_order = nextSortOrder(targetSection.course_lessons);
        await writeRows(supabase.from('course_lessons').update(payload).eq('id', lesson.id));
      } else {
        await writeRows(supabase.from('course_lessons').insert({
          ...payload,
          sort_order: nextSortOrder(targetSection.course_lessons),
        }));
      }
      showToast(lesson ? 'Đã cập nhật bài học.' : 'Đã thêm bài học.', 'success');
      load();
      return true;
    } catch {
      showFormMessage(form, 'Không thể lưu bài học. Vui lòng thử lại.');
      return false;
    } finally {
      isSaving = false;
    }
  }

  openModal({
    title: lesson ? 'Sửa bài học' : 'Thêm bài học',
    body,
    size: 'lg',
    actions: [
      { label: 'Hủy', variant: 'secondary' },
      { label: 'Lưu', variant: 'primary', onClick: submit },
    ],
  });
  if (lesson) form.elements.title.focus();
  else showView('picker');
}

async function handleDeleteLesson(lesson) {
  const confirmed = await confirmModal({
    title: 'Xóa bài học?',
    message: `Bài học "${lesson.title}" sẽ bị xóa khỏi khóa học. Video gốc trong kho không bị xóa.`,
    confirmText: 'Xóa',
    cancelText: 'Hủy',
  });
  if (!confirmed) return;
  await runAction(
    () => writeRows(supabase.from('course_lessons').delete().eq('id', lesson.id)),
    { successMessage: 'Đã xóa bài học.', errorMessage: 'Không thể xóa bài học. Vui lòng thử lại.' },
  );
}

function handleMoveLesson(section, index, delta) {
  return runAction(
    () => applyOrder('course_lessons', swapItems(section.course_lessons, index, delta)),
    { errorMessage: 'Không thể đổi thứ tự bài học. Vui lòng thử lại.' },
  );
}

// ---------- Render ----------

function createButton(text, label, onClick, { variant = 'secondary', disabled = false } = {}) {
  const button = createElement('button', `btn btn-${variant} btn-sm`, text);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

// Cảnh báo cho ADMIN khi video của bài học không dùng được
function createVideoBadges(lesson) {
  const video = lesson.videos;
  if (!video) return [createBadge('Video gốc đã bị xóa', 'danger')];
  if (video.status !== 'PUBLISHED') {
    const label = VIDEO_STATUSES[video.status]?.label || video.status;
    return [createBadge(`Video chưa công khai (${label})`, 'warning')];
  }
  return [];
}

function createLessonItem(section, lesson, index) {
  const item = createElement('li', 'lesson-item');
  const info = createElement('div', 'lesson-info');
  info.appendChild(createElement('strong', 'lesson-title', `${index + 1}. ${lesson.title}`));

  const meta = createElement('div', 'lesson-meta');
  meta.appendChild(createElement('span', 'text-secondary', lesson.videos ? `Video: ${lesson.videos.title}` : 'Chưa có video'));
  if (lesson.videos) meta.appendChild(createElement('span', 'text-secondary', formatDuration(lesson.videos.duration)));
  if (lesson.is_preview) meta.appendChild(createBadge('Học thử', 'primary'));
  if (!lesson.is_active) meta.appendChild(createBadge('Ẩn', 'default'));
  meta.append(...createVideoBadges(lesson));
  info.appendChild(meta);

  const actions = createElement('div', 'table-actions');
  if (lesson.videos) actions.appendChild(createButton('Xem', 'Xem video', () => openVideoModal(lesson.videos)));
  actions.append(
    createButton('↑', 'Chuyển bài học lên', () => handleMoveLesson(section, index, -1), { disabled: index === 0 }),
    createButton('↓', 'Chuyển bài học xuống', () => handleMoveLesson(section, index, 1), { disabled: index === section.course_lessons.length - 1 }),
    createButton('Sửa', 'Sửa bài học', () => openLessonModal({ section, lesson })),
    createButton('Xóa', 'Xóa bài học', () => handleDeleteLesson(lesson), { variant: 'danger' }),
  );
  item.append(info, actions);
  return item;
}

function createSectionCard(section, index) {
  const card = createElement('article', 'section-card');

  const heading = createElement('div', 'section-heading');
  heading.appendChild(createElement('h3', 'section-name', `Chương ${index + 1}: ${section.title}`));
  if (section.description) heading.appendChild(createElement('p', 'text-secondary section-description', section.description));

  const actions = createElement('div', 'table-actions');
  actions.append(
    createButton('↑', 'Chuyển chương lên', () => handleMoveSection(index, -1), { disabled: index === 0 }),
    createButton('↓', 'Chuyển chương xuống', () => handleMoveSection(index, 1), { disabled: index === sections.length - 1 }),
    createButton('Sửa', 'Sửa chương', () => openSectionModal(section)),
    createButton('Xóa', 'Xóa chương', () => handleDeleteSection(section), { variant: 'danger' }),
  );
  const header = createElement('div', 'section-header');
  header.append(heading, actions);

  const lessons = createElement('ul', 'lesson-list');
  if (section.course_lessons.length === 0) {
    lessons.appendChild(createElement('li', 'lesson-empty text-secondary', 'Chương này chưa có bài học.'));
  } else {
    lessons.append(...section.course_lessons.map((lesson, lessonIndex) => createLessonItem(section, lesson, lessonIndex)));
  }

  const addLesson = createButton('+ Thêm bài học', 'Thêm bài học', () => openLessonModal({ section }));
  card.append(header, lessons, addLesson);
  return card;
}

function render() {
  const lessonCount = sections.reduce((total, section) => total + section.course_lessons.length, 0);
  const toolbar = createElement('div', 'toolbar');
  const addSection = createElement('button', 'btn btn-primary', '+ Thêm chương');
  addSection.type = 'button';
  addSection.addEventListener('click', () => openSectionModal());
  toolbar.append(createElement('p', 'text-secondary', `${sections.length} chương · ${lessonCount} bài học`), addSection);

  const content = sections.length === 0
    ? createStateView('empty', { message: 'Khóa học chưa có chương nào.', actionLabel: 'Thêm chương', onAction: () => openSectionModal() })
    : createElement('div', 'section-list');
  if (sections.length > 0) content.append(...sections.map(createSectionCard));
  root.replaceChildren(toolbar, content);
}

// ---------- Public API ----------

export async function load() {
  root.replaceChildren(createStateView('loading'));
  try {
    sections = await fetchSections();
    render();
  } catch {
    root.replaceChildren(createStateView('error', { actionLabel: 'Thử lại', onAction: load }));
  }
}

export function initCurriculum({ container, courseId: id }) {
  root = container;
  courseId = id;
  return { load };
}
