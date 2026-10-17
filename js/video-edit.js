// video-edit module: thêm mới (không có ?id) hoặc sửa video (?id=...)
// Nguồn video: UPLOAD (file trong Storage) hoặc YOUTUBE (link nhúng)
import { supabase } from './supabase.js?v=202610172049';
import { initLayout } from './layout.js?v=202610172049';
import { createStateView, setFlashToast } from './components.js?v=202610172049';
import {
  BUCKETS,
  FILE_RULES,
  buildStoragePath,
  createSignedUrl,
  getAuthenticatedUrl,
  getFriendlyStorageError,
  getPathFromPublicUrl,
  getPublicUrl,
  removeFiles,
  uploadFile,
  validateFile,
} from './storage.js?v=202610172049';
import {
  VIDEO_SOURCES,
  buildYouTubeWatchUrl,
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
  isYouTubeThumbnail,
  isYouTubeVideo,
  parseYouTubeVideoId,
} from './player.js?v=202610172049';
import { createElement, debounce, formatBytes, formatDate, formatDuration, formatNumber, slugify } from './utils.js?v=202610172049';

const THUMBNAIL_PLACEHOLDER = 'assets/thumbnail-placeholder.svg';
const VALID_STATUSES = ['PUBLISHED', 'DRAFT', 'HIDDEN'];
const TITLE_MAX_LENGTH = 200;
const FIELD_NAMES = ['title', 'category', 'thumbnail', 'video', 'youtubeUrl'];

const videoId = new URLSearchParams(location.search).get('id');
const isEditMode = Boolean(videoId);

let currentProfile = null;
let currentVideo = null;
let videoDuration = null;
let previewedYouTubeId = null;
const objectUrls = [];
const elements = {};

// ---------- Data ----------

async function fetchCategories() {
  const { data, error } = await supabase.from('video_categories').select('id, name').order('name');
  if (error) throw error;
  return data;
}

async function fetchVideo(id) {
  if (!/^\d+$/.test(id)) return null;
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, description, category_id, status, thumbnail_url, storage_path, video_source, video_url, file_size, duration, views, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertVideo(payload) {
  const { data, error } = await supabase.from('videos').insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

// Không gửi views => không reset lượt xem
async function updateVideo(id, payload) {
  const { data, error } = await supabase.from('videos').update(payload).eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('not updated');
}

// ---------- Form helpers ----------

function setFieldError(name, message) {
  const errorElement = elements.form.querySelector(`[data-error-for="${name}"]`);
  if (errorElement) errorElement.textContent = message || '';
  elements.form.elements[name]?.classList.toggle('is-invalid', Boolean(message));
}

function clearErrors() {
  FIELD_NAMES.forEach((name) => setFieldError(name, ''));
  showFormMessage('');
}

function showFormMessage(message) {
  const box = elements.form.querySelector('.form-message');
  box.textContent = message;
  box.className = 'form-message form-message-error';
  box.hidden = !message;
}

function setSubmitting(isSubmitting, text = 'Lưu') {
  elements.fieldset.disabled = isSubmitting;
  elements.submitButton.disabled = isSubmitting;
  elements.submitButton.textContent = isSubmitting ? text : 'Lưu';
}

function getSource() {
  return isEditMode ? currentVideo.video_source : elements.form.elements.source.value;
}

function getFormValues() {
  const { form } = elements;
  const source = getSource();
  return {
    title: form.elements.title.value.trim(),
    description: form.elements.description.value.trim(),
    categoryId: form.elements.category.value,
    status: form.elements.status.value,
    source,
    youtubeUrl: form.elements.youtubeUrl.value.trim(),
    thumbnailFile: form.elements.thumbnail.files[0] || null,
    videoFile: !isEditMode && source === VIDEO_SOURCES.upload ? form.elements.video.files[0] || null : null,
  };
}

function validateYouTubeUrl(values) {
  if (parseYouTubeVideoId(values.youtubeUrl)) return '';
  return values.youtubeUrl ? 'Liên kết YouTube không hợp lệ.' : 'Vui lòng nhập liên kết YouTube.';
}

function validateVideoFile(values) {
  if (isEditMode) return '';
  return values.videoFile ? validateFile(values.videoFile, FILE_RULES.video) : 'Vui lòng chọn tệp video.';
}

function validateForm(values) {
  const errors = {};
  if (!values.title) errors.title = 'Vui lòng nhập tiêu đề.';
  else if (values.title.length > TITLE_MAX_LENGTH) errors.title = `Tiêu đề tối đa ${TITLE_MAX_LENGTH} ký tự.`;
  if (!values.categoryId) errors.category = 'Vui lòng chọn danh mục.';
  const thumbnailError = validateFile(values.thumbnailFile, FILE_RULES.thumbnail);
  if (thumbnailError) errors.thumbnail = thumbnailError;

  if (values.source === VIDEO_SOURCES.youtube) {
    const youtubeError = validateYouTubeUrl(values);
    if (youtubeError) errors.youtubeUrl = youtubeError;
  } else {
    const videoError = validateVideoFile(values);
    if (videoError) errors.video = videoError;
  }
  Object.entries(errors).forEach(([name, message]) => setFieldError(name, message));
  return Object.keys(errors).length === 0;
}

// ---------- Previews ----------

function createObjectUrl(file) {
  const url = URL.createObjectURL(file);
  objectUrls.push(url);
  return url;
}

// Ảnh hiển thị khi chưa chọn file thumbnail mới
function getFallbackThumbnail() {
  const youtubeId = getSource() === VIDEO_SOURCES.youtube
    && parseYouTubeVideoId(elements.form.elements.youtubeUrl.value);
  if (youtubeId) return getYouTubeThumbnailUrl(youtubeId);
  return currentVideo?.thumbnail_url || THUMBNAIL_PLACEHOLDER;
}

function handleThumbnailChange() {
  const file = elements.form.elements.thumbnail.files[0];
  const error = validateFile(file, FILE_RULES.thumbnail);
  setFieldError('thumbnail', error);
  elements.thumbnailPreview.src = !file || error ? getFallbackThumbnail() : createObjectUrl(file);
}

function handleVideoChange() {
  const file = elements.form.elements.video.files[0];
  const error = validateFile(file, FILE_RULES.video);
  setFieldError('video', error);
  videoDuration = null;
  elements.videoPreviewWrapper.hidden = !file || Boolean(error);
  if (!file || error) return;
  elements.videoPreview.src = createObjectUrl(file);
}

function handleVideoMetadata() {
  const duration = elements.videoPreview.duration;
  videoDuration = Number.isFinite(duration) ? Math.round(duration) : null;
}

// Hiển thị bản xem trước YouTube khi link hợp lệ; đồng bộ ảnh bìa nếu chưa chọn thumbnail
function updateYouTubePreview() {
  const youtubeId = parseYouTubeVideoId(elements.form.elements.youtubeUrl.value);
  elements.youtubePreviewWrapper.hidden = !youtubeId;
  if (youtubeId !== previewedYouTubeId) {
    previewedYouTubeId = youtubeId;
    if (youtubeId) elements.youtubePreview.src = getYouTubeEmbedUrl(youtubeId);
    else elements.youtubePreview.removeAttribute('src');
  }
  if (!elements.form.elements.thumbnail.files[0]) elements.thumbnailPreview.src = getFallbackThumbnail();
}

function handleYouTubeUrlInput() {
  setFieldError('youtubeUrl', '');
}

function showSourceGroups(source) {
  const isYouTube = source === VIDEO_SOURCES.youtube;
  elements.videoUploadGroup.hidden = isYouTube || isEditMode;
  elements.youtubeGroup.hidden = !isYouTube;
}

function handleSourceChange() {
  clearErrors();
  showSourceGroups(getSource());
  updateYouTubePreview();
}

// ---------- Save ----------

async function uploadThumbnail(file, uploadedPaths) {
  const path = buildStoragePath(currentProfile.id, file);
  await uploadFile(BUCKETS.thumbnails, path, file);
  uploadedPaths.thumbnails.push(path);
  return getPublicUrl(BUCKETS.thumbnails, path);
}

async function uploadVideo(file, uploadedPaths) {
  const path = buildStoragePath(currentProfile.id, file);
  await uploadFile(BUCKETS.videos, path, file);
  uploadedPaths.videos.push(path);
  return {
    storage_path: path,
    video_url: getAuthenticatedUrl(BUCKETS.videos, path),
    file_size: file.size,
    duration: videoDuration,
  };
}

function buildSlug(title) {
  return `${slugify(title) || 'video'}-${Date.now().toString(36)}`;
}

async function buildSourceData(values, uploadedPaths) {
  if (values.source === VIDEO_SOURCES.youtube) {
    return {
      video_source: VIDEO_SOURCES.youtube,
      video_url: buildYouTubeWatchUrl(parseYouTubeVideoId(values.youtubeUrl)),
      storage_path: null,
      file_size: null,
      duration: null,
    };
  }
  setSubmitting(true, 'Đang tải video lên...');
  return { video_source: VIDEO_SOURCES.upload, ...(await uploadVideo(values.videoFile, uploadedPaths)) };
}

async function resolveNewThumbnail(values, uploadedPaths) {
  if (values.thumbnailFile) {
    setSubmitting(true, 'Đang tải ảnh bìa lên...');
    return uploadThumbnail(values.thumbnailFile, uploadedPaths);
  }
  if (values.source === VIDEO_SOURCES.youtube) {
    return getYouTubeThumbnailUrl(parseYouTubeVideoId(values.youtubeUrl));
  }
  return null;
}

async function createVideo(values, uploadedPaths) {
  const sourceData = await buildSourceData(values, uploadedPaths);
  const thumbnailUrl = await resolveNewThumbnail(values, uploadedPaths);
  setSubmitting(true, 'Đang lưu...');
  await insertVideo({
    title: values.title,
    slug: buildSlug(values.title),
    description: values.description || null,
    category_id: Number(values.categoryId),
    status: values.status,
    thumbnail_url: thumbnailUrl,
    created_by: currentProfile.id,
    ...sourceData,
  });
}

// Đổi link YouTube: cập nhật video_url; ảnh bìa YouTube đi theo nếu thumbnail hiện tại là ảnh YouTube hoặc đang trống
function getYouTubeChanges(values) {
  const newVideoId = parseYouTubeVideoId(values.youtubeUrl);
  const changes = { video_url: buildYouTubeWatchUrl(newVideoId) };
  const hasCustomThumbnail = currentVideo.thumbnail_url && !isYouTubeThumbnail(currentVideo.thumbnail_url);
  if (!values.thumbnailFile && !hasCustomThumbnail) changes.thumbnail_url = getYouTubeThumbnailUrl(newVideoId);
  return changes;
}

async function saveVideoChanges(values, uploadedPaths) {
  const payload = {
    title: values.title,
    description: values.description || null,
    category_id: Number(values.categoryId),
    status: values.status,
  };
  if (isYouTubeVideo(currentVideo)) Object.assign(payload, getYouTubeChanges(values));
  if (values.thumbnailFile) {
    setSubmitting(true, 'Đang tải ảnh bìa lên...');
    payload.thumbnail_url = await uploadThumbnail(values.thumbnailFile, uploadedPaths);
  }
  setSubmitting(true, 'Đang lưu...');
  await updateVideo(currentVideo.id, payload);

  // Thumbnail mới đã lưu: xóa thumbnail cũ (chỉ xóa nếu nằm trong Storage của project)
  if (payload.thumbnail_url) {
    await removeFiles(BUCKETS.thumbnails, [getPathFromPublicUrl(BUCKETS.thumbnails, currentVideo.thumbnail_url)]);
  }
}

// Lưu thất bại: xóa các file vừa upload để không để lại file rác
async function rollbackUploads(uploadedPaths) {
  await Promise.all([
    removeFiles(BUCKETS.thumbnails, uploadedPaths.thumbnails),
    removeFiles(BUCKETS.videos, uploadedPaths.videos),
  ]);
}

function getFriendlySaveError(error) {
  if (error?.statusCode || error?.name === 'StorageApiError' || error?.name === 'StorageUnknownError') {
    return getFriendlyStorageError(error);
  }
  return 'Không thể lưu video. Vui lòng thử lại.';
}

async function handleSubmit(event) {
  event.preventDefault();
  clearErrors();
  const values = getFormValues();
  if (!VALID_STATUSES.includes(values.status)) values.status = 'PUBLISHED';
  if (!validateForm(values)) return;

  const uploadedPaths = { thumbnails: [], videos: [] };
  try {
    if (isEditMode) await saveVideoChanges(values, uploadedPaths);
    else await createVideo(values, uploadedPaths);
    setFlashToast(isEditMode ? 'Đã cập nhật video.' : 'Đã thêm video.');
    location.href = 'videos.html';
  } catch (error) {
    await rollbackUploads(uploadedPaths);
    showFormMessage(getFriendlySaveError(error));
    setSubmitting(false);
  }
}

// ---------- Render ----------

function renderCategoryOptions(categories) {
  categories.forEach((category) => {
    const option = createElement('option', '', category.name);
    option.value = category.id;
    elements.form.elements.category.appendChild(option);
  });
}

function renderVideoMeta(video) {
  const items = [
    ['Nguồn', isYouTubeVideo(video) ? 'YouTube' : 'Tải tệp lên'],
    ['Lượt xem', formatNumber(video.views)],
    ['Dung lượng tệp', video.file_size ? formatBytes(video.file_size) : '—'],
    ['Thời lượng', formatDuration(video.duration)],
    ['Ngày tạo', formatDate(video.created_at)],
  ];
  elements.videoMeta.replaceChildren(...items.flatMap(([label, value]) => [
    createElement('dt', '', label),
    createElement('dd', '', value),
  ]));
  elements.videoMeta.hidden = false;
}

async function renderCurrentVideo(video) {
  if (isYouTubeVideo(video)) return;
  elements.videoCurrentGroup.hidden = false;
  if (!video.storage_path) {
    elements.videoCurrentWrapper.hidden = true;
    elements.videoCurrentHint.textContent = 'Video này chưa có tệp.';
    return;
  }
  elements.videoCurrentHint.textContent = 'Tệp video không thay đổi khi chỉnh sửa.';
  try {
    elements.videoCurrent.src = await createSignedUrl(BUCKETS.videos, video.storage_path);
  } catch {
    elements.videoCurrentWrapper.hidden = true;
    elements.videoCurrentHint.textContent = 'Không tải được bản xem trước video.';
  }
}

function fillForm(video) {
  const { form } = elements;
  form.elements.title.value = video.title;
  form.elements.description.value = video.description || '';
  form.elements.category.value = video.category_id ?? '';
  form.elements.status.value = VALID_STATUSES.includes(video.status) ? video.status : 'PUBLISHED';
  elements.thumbnailPreview.src = video.thumbnail_url || THUMBNAIL_PLACEHOLDER;
  elements.sourceGroup.hidden = true;
  showSourceGroups(video.video_source);
  if (isYouTubeVideo(video)) {
    form.elements.youtubeUrl.value = video.video_url;
    updateYouTubePreview();
  }
  renderVideoMeta(video);
  renderCurrentVideo(video);
}

function showPageState(type, options) {
  elements.form.hidden = true;
  elements.pageState.hidden = false;
  const card = createElement('div', 'card');
  card.appendChild(createStateView(type, options));
  elements.pageState.replaceChildren(card);
}

// ---------- Init ----------

function cacheElements() {
  elements.form = document.getElementById('video-form');
  elements.fieldset = elements.form.querySelector('fieldset');
  elements.submitButton = elements.form.querySelector('button[type="submit"]');
  elements.pageState = document.getElementById('page-state');
  elements.thumbnailPreview = document.getElementById('thumbnail-preview');
  elements.videoPreview = document.getElementById('video-preview');
  elements.videoPreviewWrapper = document.getElementById('video-preview-wrapper');
  elements.videoUploadGroup = document.getElementById('video-upload-group');
  elements.videoCurrentGroup = document.getElementById('video-current-group');
  elements.videoCurrentWrapper = document.getElementById('video-current-wrapper');
  elements.videoCurrent = document.getElementById('video-current');
  elements.videoCurrentHint = document.getElementById('video-current-hint');
  elements.videoMeta = document.getElementById('video-meta');
  elements.sourceGroup = document.getElementById('source-group');
  elements.youtubeGroup = document.getElementById('youtube-group');
  elements.youtubePreview = document.getElementById('youtube-preview');
  elements.youtubePreviewWrapper = document.getElementById('youtube-preview-wrapper');
}

function bindEvents() {
  const { form } = elements;
  form.addEventListener('submit', handleSubmit);
  form.elements.thumbnail.addEventListener('change', handleThumbnailChange);
  form.elements.video.addEventListener('change', handleVideoChange);
  form.elements.source.forEach((radio) => radio.addEventListener('change', handleSourceChange));
  form.elements.youtubeUrl.addEventListener('input', handleYouTubeUrlInput);
  form.elements.youtubeUrl.addEventListener('input', debounce(updateYouTubePreview, 300));
  elements.videoPreview.addEventListener('loadedmetadata', handleVideoMetadata);
  elements.thumbnailPreview.addEventListener('error', () => {
    elements.thumbnailPreview.src = THUMBNAIL_PLACEHOLDER;
  });
  window.addEventListener('pagehide', () => objectUrls.forEach((url) => URL.revokeObjectURL(url)));
}

async function loadPageData() {
  showPageState('loading');
  try {
    const [categories, video] = await Promise.all([
      fetchCategories(),
      isEditMode ? fetchVideo(videoId) : Promise.resolve(null),
    ]);
    if (isEditMode && !video) {
      showPageState('empty', {
        message: 'Không tìm thấy video.',
        actionLabel: 'Về danh sách',
        onAction: () => { location.href = 'videos.html'; },
      });
      return;
    }
    renderCategoryOptions(categories);
    currentVideo = video;
    if (video) fillForm(video);
    elements.pageState.hidden = true;
    elements.form.hidden = false;
  } catch {
    showPageState('error', { actionLabel: 'Thử lại', onAction: loadPageData });
  }
}

async function initVideoEditPage() {
  currentProfile = await initLayout(isEditMode ? 'Sửa video' : 'Thêm video');
  if (!currentProfile) return;
  cacheElements();
  bindEvents();
  await loadPageData();
}

initVideoEditPage();
