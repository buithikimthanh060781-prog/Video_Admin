// course-edit module: thêm mới (không có ?id) hoặc sửa khóa học (?id=...)
// Tab "Thông tin chung" lưu dữ liệu; tab "Xuất bản" đổi trạng thái DRAFT / PUBLISHED / HIDDEN.
import { supabase } from './supabase.js?v=202610171951';
import { initLayout } from './layout.js?v=202610171951';
import { confirmModal, createBadge, createStateView, setFlashToast, showFlashToast, showToast } from './components.js?v=202610171951';
import {
  BUCKETS,
  FILE_RULES,
  buildStoragePath,
  getFriendlyStorageError,
  getPathFromPublicUrl,
  getPublicUrl,
  removeFiles,
  uploadFile,
  validateFile,
} from './storage.js?v=202610171951';
import {
  COURSE_LANGUAGES,
  COURSE_LEVELS,
  COURSE_STATUSES,
  MAX_PRICE,
  generateCourseCode,
  getFriendlyCourseError,
  getPublishMissing,
  updateCourseStatus,
} from './course-utils.js?v=202610171951';
import { initCurriculum } from './course-curriculum.js?v=202610171951';
import { fetchCourseSections, renderCourseView, renderViewState } from './course-view.js?v=202610171951';
import { createElement, formatDate, slugify } from './utils.js?v=202610171951';

const THUMBNAIL_PLACEHOLDER = 'assets/thumbnail-placeholder.svg';
const TITLE_MAX_LENGTH = 200;
const CODE_PATTERN = /^[A-Za-z0-9_-]{2,30}$/;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FIELD_NAMES = ['title', 'code', 'slug', 'category', 'thumbnail', 'price', 'salePrice'];
const COURSE_COLUMNS = 'id, code, title, slug, category_id, instructor_name, short_description, description, target_audience, learning_outcomes, requirements, level, language, thumbnail_url, price, sale_price, status, created_at, updated_at';

const courseId = new URLSearchParams(location.search).get('id');
const isEditMode = Boolean(courseId);

let currentProfile = null;
let currentCourse = null;
let isDirty = false;
let isSlugEdited = false;
let isCurriculumLoaded = false;
let curriculum = null;
let categories = [];
const objectUrls = [];
const elements = {};

// ---------- Data ----------

async function fetchCategories() {
  const { data, error } = await supabase
    .from('course_categories')
    .select('id, name, is_active')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
}

async function fetchCourse(id) {
  if (!/^\d+$/.test(id)) return null;
  const { data, error } = await supabase.from('courses').select(COURSE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function insertCourse(payload) {
  const { data, error } = await supabase.from('courses').insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

async function updateCourse(id, payload) {
  const { data, error } = await supabase.from('courses').update(payload).eq('id', id).select(COURSE_COLUMNS);
  if (error) throw error;
  if (data.length === 0) throw new Error('not updated');
  return data[0];
}

// ---------- Form helpers ----------

function setFieldError(name, message) {
  const errorElement = elements.form.querySelector(`[data-error-for="${name}"]`);
  if (errorElement) errorElement.textContent = message || '';
  elements.form.elements[name]?.classList.toggle('is-invalid', Boolean(message));
}

function showFormMessage(message) {
  const box = elements.form.querySelector('.form-message');
  box.textContent = message;
  box.className = 'form-message form-message-error';
  box.hidden = !message;
}

function clearErrors() {
  FIELD_NAMES.forEach((name) => setFieldError(name, ''));
  showFormMessage('');
}

function setSubmitting(isSubmitting, text = 'Lưu') {
  elements.fieldset.disabled = isSubmitting;
  elements.submitButton.disabled = isSubmitting;
  elements.submitButton.textContent = isSubmitting ? text : 'Lưu';
}

// Ô số trống -> null; ngược lại trả về Number (có thể là NaN nếu nhập sai)
function parseMoney(text) {
  const trimmed = text.trim();
  return trimmed === '' ? null : Number(trimmed);
}

function getFormValues() {
  const { form } = elements;
  const title = form.elements.title.value.trim();
  return {
    title,
    code: form.elements.code.value.trim().toUpperCase(),
    slug: form.elements.slug.value.trim() || slugify(title),
    categoryId: form.elements.category.value,
    instructor: form.elements.instructor.value.trim(),
    shortDescription: form.elements.shortDescription.value.trim(),
    description: form.elements.description.value.trim(),
    targetAudience: form.elements.targetAudience.value.trim(),
    learningOutcomes: form.elements.learningOutcomes.value.trim(),
    requirements: form.elements.requirements.value.trim(),
    level: form.elements.level.value,
    language: form.elements.language.value,
    price: parseMoney(form.elements.price.value),
    salePrice: parseMoney(form.elements.salePrice.value),
    thumbnailFile: form.elements.thumbnail.files[0] || null,
  };
}

function isValidMoney(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_PRICE;
}

function validatePrices(values, errors) {
  if (values.price === null) errors.price = 'Vui lòng nhập giá niêm yết (nhập 0 nếu miễn phí).';
  else if (!isValidMoney(values.price)) errors.price = 'Giá phải là số nguyên không âm.';

  if (values.salePrice === null) return;
  if (!isValidMoney(values.salePrice)) errors.salePrice = 'Giá khuyến mại phải là số nguyên không âm.';
  else if (!errors.price && values.salePrice > values.price) errors.salePrice = 'Giá khuyến mại không được lớn hơn giá niêm yết.';
}

function validateForm(values) {
  const errors = {};
  if (!values.title) errors.title = 'Vui lòng nhập tên khóa học.';
  else if (values.title.length > TITLE_MAX_LENGTH) errors.title = `Tên tối đa ${TITLE_MAX_LENGTH} ký tự.`;
  if (!CODE_PATTERN.test(values.code)) errors.code = 'Mã gồm 2–30 ký tự: chữ, số, "-" hoặc "_".';
  if (values.title && !SLUG_PATTERN.test(values.slug)) errors.slug = 'Đường dẫn (slug) không hợp lệ.';
  validatePrices(values, errors);

  const thumbnailError = validateFile(values.thumbnailFile, FILE_RULES.thumbnail);
  if (thumbnailError) errors.thumbnail = thumbnailError;

  // Khóa học đang công khai thì không được bỏ lĩnh vực / thumbnail
  if (currentCourse?.status === 'PUBLISHED') {
    if (!values.categoryId) errors.category = 'Khóa học đang công khai phải có lĩnh vực.';
    if (!values.thumbnailFile && !currentCourse.thumbnail_url) errors.thumbnail = 'Khóa học đang công khai phải có ảnh bìa.';
  }
  Object.entries(errors).forEach(([name, message]) => setFieldError(name, message));
  return Object.keys(errors).length === 0;
}

function buildPayload(values) {
  return {
    code: values.code,
    title: values.title,
    slug: values.slug,
    category_id: values.categoryId ? Number(values.categoryId) : null,
    instructor_name: values.instructor || null,
    short_description: values.shortDescription || null,
    description: values.description || null,
    target_audience: values.targetAudience || null,
    learning_outcomes: values.learningOutcomes || null,
    requirements: values.requirements || null,
    level: values.level,
    language: values.language,
    price: values.price,
    sale_price: values.salePrice,
  };
}

// ---------- Thumbnail ----------

function createObjectUrl(file) {
  const url = URL.createObjectURL(file);
  objectUrls.push(url);
  return url;
}

function handleThumbnailChange() {
  const file = elements.form.elements.thumbnail.files[0];
  const error = validateFile(file, FILE_RULES.thumbnail);
  setFieldError('thumbnail', error);
  elements.thumbnailPreview.src = !file || error
    ? currentCourse?.thumbnail_url || THUMBNAIL_PLACEHOLDER
    : createObjectUrl(file);
}

async function uploadThumbnail(file, uploadedPaths) {
  const path = buildStoragePath(currentProfile.id, file);
  await uploadFile(BUCKETS.thumbnails, path, file);
  uploadedPaths.push(path);
  return getPublicUrl(BUCKETS.thumbnails, path);
}

// ---------- Save ----------

async function createCourse(values, uploadedPaths) {
  const payload = {
    ...buildPayload(values),
    status: 'DRAFT',
    created_by: currentProfile.id,
  };
  if (values.thumbnailFile) {
    setSubmitting(true, 'Đang tải ảnh bìa lên...');
    payload.thumbnail_url = await uploadThumbnail(values.thumbnailFile, uploadedPaths);
  }
  setSubmitting(true, 'Đang lưu...');
  return insertCourse(payload);
}

async function saveCourseChanges(values, uploadedPaths) {
  const payload = buildPayload(values);
  if (values.thumbnailFile) {
    setSubmitting(true, 'Đang tải ảnh bìa lên...');
    payload.thumbnail_url = await uploadThumbnail(values.thumbnailFile, uploadedPaths);
  }
  setSubmitting(true, 'Đang lưu...');
  const updated = await updateCourse(currentCourse.id, payload);

  // Thumbnail mới đã lưu: xóa thumbnail cũ (chỉ xóa nếu nằm trong Storage của project)
  if (payload.thumbnail_url) {
    await removeFiles(BUCKETS.thumbnails, [getPathFromPublicUrl(BUCKETS.thumbnails, currentCourse.thumbnail_url)]);
  }
  return updated;
}

function getSaveErrorMessage(error) {
  if (error?.statusCode || error?.name === 'StorageApiError' || error?.name === 'StorageUnknownError') {
    return getFriendlyStorageError(error);
  }
  return getFriendlyCourseError(error);
}

async function handleSubmit(event) {
  event.preventDefault();
  clearErrors();
  const values = getFormValues();
  if (!validateForm(values)) return;

  const uploadedPaths = [];
  try {
    if (isEditMode) {
      currentCourse = await saveCourseChanges(values, uploadedPaths);
      isDirty = false;
      elements.form.elements.thumbnail.value = '';
      renderCourse(currentCourse);
      showToast('Đã lưu khóa học.', 'success');
      setSubmitting(false);
    } else {
      const created = await createCourse(values, uploadedPaths);
      isDirty = false;
      setFlashToast('Đã tạo khóa học (bản nháp). Bạn có thể tiếp tục chỉnh sửa.');
      location.href = `course-edit.html?id=${encodeURIComponent(created.id)}`;
    }
  } catch (error) {
    await removeFiles(BUCKETS.thumbnails, uploadedPaths);
    showFormMessage(getSaveErrorMessage(error));
    setSubmitting(false);
  }
}

// ---------- Publish tab ----------

function createChecklistItem(isDone, text) {
  const item = createElement('li', isDone ? 'check-ok' : 'check-missing');
  item.append(createElement('span', 'check-mark', isDone ? '✓' : '✗'), document.createTextNode(` ${text}`));
  return item;
}

function renderPublishPanel(course) {
  const status = COURSE_STATUSES[course.status] || { label: course.status, badge: 'default' };
  elements.publishStatus.replaceChildren(createBadge(status.label, status.badge));
  elements.publishUpdated.textContent = formatDate(course.updated_at);

  const missing = getPublishMissing(course);
  elements.publishChecklist.replaceChildren(
    createChecklistItem(Boolean(course.title?.trim()), 'Có tên khóa học'),
    createChecklistItem(Boolean(course.category_id), 'Đã chọn lĩnh vực'),
    createChecklistItem(Boolean(course.thumbnail_url), 'Có ảnh bìa'),
  );

  elements.publishPanel.querySelectorAll('[data-status]').forEach((button) => {
    const target = button.dataset.status;
    button.disabled = target === course.status || (target === 'PUBLISHED' && missing.length > 0);
  });
}

function showPublishMessage(message) {
  elements.publishMessage.textContent = message;
  elements.publishMessage.className = 'form-message form-message-error';
  elements.publishMessage.hidden = !message;
}

const STATUS_CONFIRMS = {
  DRAFT: { title: 'Chuyển về bản nháp?', message: 'Khóa học sẽ không còn hiển thị với khách.', confirmText: 'Lưu bản nháp' },
  PUBLISHED: { title: 'Xuất bản khóa học?', message: 'Khóa học sẽ hiển thị công khai cho khách tham khảo.', confirmText: 'Xuất bản' },
  HIDDEN: { title: 'Ẩn khóa học?', message: 'Khóa học sẽ không còn hiển thị với khách. Dữ liệu không bị xóa.', confirmText: 'Ẩn' },
};

async function handleStatusClick(nextStatus) {
  showPublishMessage('');
  if (isDirty) {
    showPublishMessage('Bạn có thay đổi chưa lưu ở tab "Thông tin chung". Hãy lưu trước khi đổi trạng thái.');
    return;
  }
  const missing = getPublishMissing(currentCourse);
  if (nextStatus === 'PUBLISHED' && missing.length > 0) {
    showPublishMessage(`Chưa thể xuất bản. Còn thiếu: ${missing.join(', ')}.`);
    return;
  }
  const confirmed = await confirmModal({ ...STATUS_CONFIRMS[nextStatus], cancelText: 'Hủy', variant: 'primary' });
  if (!confirmed) return;

  try {
    await updateCourseStatus(currentCourse.id, nextStatus);
    currentCourse = { ...currentCourse, status: nextStatus, updated_at: new Date().toISOString() };
    renderPublishPanel(currentCourse);
    showToast('Đã cập nhật trạng thái khóa học.', 'success');
  } catch (error) {
    showPublishMessage(getFriendlyCourseError(error, 'Không thể đổi trạng thái. Vui lòng thử lại.'));
  }
}

// ---------- Preview tab ----------

// Dựng lại khóa học từ dữ liệu đã lưu, hiển thị giống trang khách (kể cả khi đang là bản nháp)
async function renderPreview() {
  elements.previewNotice.hidden = !isDirty;
  renderViewState(elements.previewRoot, 'loading');
  try {
    const sections = await fetchCourseSections(currentCourse.id);
    const category = categories.find((item) => item.id === currentCourse.category_id);
    renderCourseView(elements.previewRoot, {
      course: { ...currentCourse, course_categories: category ? { name: category.name } : null },
      sections,
      isLoggedIn: true,
    });
  } catch {
    renderViewState(elements.previewRoot, 'error', { actionLabel: 'Thử lại', onAction: renderPreview });
  }
}

// ---------- Tabs ----------

function selectTab(name) {
  elements.form.hidden = name !== 'general';
  elements.curriculumPanel.hidden = name !== 'curriculum';
  elements.previewPanel.hidden = name !== 'preview';
  elements.publishPanel.hidden = name !== 'publish';
  if (name === 'preview') renderPreview();
  if (name === 'curriculum' && !isCurriculumLoaded) {
    isCurriculumLoaded = true;
    curriculum.load();
  }
  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === name;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
}

// ---------- Render ----------

function renderOptions(select, options) {
  select.replaceChildren(...options.map(({ value, label }) => {
    const option = createElement('option', '', label);
    option.value = value;
    return option;
  }));
}

function renderCategoryOptions(categories) {
  const select = elements.form.elements.category;
  categories.forEach((category) => {
    const option = createElement('option', '', category.is_active ? category.name : `${category.name} (đang ẩn)`);
    option.value = category.id;
    select.appendChild(option);
  });
}

function renderStaticOptions() {
  renderOptions(elements.form.elements.level, Object.entries(COURSE_LEVELS).map(([value, label]) => ({ value, label })));
  renderOptions(elements.form.elements.language, Object.entries(COURSE_LANGUAGES).map(([value, label]) => ({ value, label })));
}

function fillForm(course) {
  const { form } = elements;
  form.elements.title.value = course.title;
  form.elements.code.value = course.code;
  form.elements.slug.value = course.slug;
  form.elements.category.value = course.category_id ?? '';
  form.elements.instructor.value = course.instructor_name || '';
  form.elements.shortDescription.value = course.short_description || '';
  form.elements.description.value = course.description || '';
  form.elements.targetAudience.value = course.target_audience || '';
  form.elements.learningOutcomes.value = course.learning_outcomes || '';
  form.elements.requirements.value = course.requirements || '';
  form.elements.level.value = course.level;
  form.elements.language.value = course.language;
  form.elements.price.value = String(course.price);
  form.elements.salePrice.value = course.sale_price === null ? '' : String(course.sale_price);
  elements.thumbnailPreview.src = course.thumbnail_url || THUMBNAIL_PLACEHOLDER;
}

function renderCourse(course) {
  elements.breadcrumbCurrent.textContent = course.title;
  document.title = `${course.title} - Học Vèo`;
  elements.thumbnailPreview.src = course.thumbnail_url || THUMBNAIL_PLACEHOLDER;
  renderPublishPanel(course);
}

function showPageState(type, options) {
  elements.editor.hidden = true;
  elements.pageState.hidden = false;
  const card = createElement('div', 'card');
  card.appendChild(createStateView(type, options));
  elements.pageState.replaceChildren(card);
}

// ---------- Init ----------

function cacheElements() {
  elements.pageState = document.getElementById('page-state');
  elements.editor = document.getElementById('course-editor');
  elements.form = document.getElementById('course-form');
  elements.fieldset = document.getElementById('panel-general');
  elements.submitButton = elements.form.querySelector('button[type="submit"]');
  elements.thumbnailPreview = document.getElementById('thumbnail-preview');
  elements.breadcrumbCurrent = document.getElementById('breadcrumb-current');
  elements.tabButtons = [...document.querySelectorAll('.tab-button')];
  elements.curriculumPanel = document.getElementById('panel-curriculum');
  elements.previewPanel = document.getElementById('panel-preview');
  elements.previewNotice = document.getElementById('preview-notice');
  elements.previewRoot = document.getElementById('preview-root');
  elements.publishPanel = document.getElementById('panel-publish');
  elements.publishStatus = document.getElementById('publish-status');
  elements.publishUpdated = document.getElementById('publish-updated');
  elements.publishChecklist = document.getElementById('publish-checklist');
  elements.publishMessage = document.getElementById('publish-message');
}

function bindEvents() {
  const { form } = elements;
  form.addEventListener('submit', handleSubmit);
  form.addEventListener('input', () => { isDirty = true; });
  form.elements.thumbnail.addEventListener('change', handleThumbnailChange);
  form.elements.slug.addEventListener('input', () => {
    isSlugEdited = true;
    setFieldError('slug', '');
  });
  form.elements.title.addEventListener('input', () => {
    setFieldError('title', '');
    if (!isSlugEdited) form.elements.slug.value = slugify(form.elements.title.value);
  });
  ['code', 'price', 'salePrice', 'category'].forEach((name) => {
    form.elements[name].addEventListener('input', () => setFieldError(name, ''));
  });
  elements.thumbnailPreview.addEventListener('error', () => {
    elements.thumbnailPreview.src = THUMBNAIL_PLACEHOLDER;
  });
  elements.tabButtons.forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  elements.publishPanel.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => handleStatusClick(button.dataset.status));
  });
  window.addEventListener('pagehide', () => objectUrls.forEach((url) => URL.revokeObjectURL(url)));
  window.addEventListener('beforeunload', (event) => {
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

async function loadPageData() {
  showPageState('loading');
  try {
    const [loadedCategories, course] = await Promise.all([
      fetchCategories(),
      isEditMode ? fetchCourse(courseId) : Promise.resolve(null),
    ]);
    if (isEditMode && !course) {
      showPageState('empty', {
        message: 'Không tìm thấy khóa học.',
        actionLabel: 'Về danh sách',
        onAction: () => { location.href = 'courses.html'; },
      });
      return;
    }
    categories = loadedCategories;
    renderStaticOptions();
    renderCategoryOptions(categories);
    currentCourse = course;
    if (course) {
      isSlugEdited = true;
      fillForm(course);
      renderCourse(course);
      curriculum = initCurriculum({ container: document.getElementById('curriculum-root'), courseId: course.id });
    } else {
      elements.form.elements.code.value = generateCourseCode();
      // Chương trình học và xuất bản cần khóa học đã được lưu
      elements.tabButtons.filter((button) => button.dataset.tab !== 'general').forEach((button) => { button.disabled = true; });
    }
    isDirty = false;
    elements.pageState.hidden = true;
    elements.editor.hidden = false;
    selectTab('general');
  } catch {
    showPageState('error', { actionLabel: 'Thử lại', onAction: loadPageData });
  }
}

async function initCourseEditPage() {
  currentProfile = await initLayout(isEditMode ? 'Sửa khóa học' : 'Thêm khóa học');
  if (!currentProfile) return;
  showFlashToast();
  cacheElements();
  bindEvents();
  await loadPageData();
}

initCourseEditPage();
