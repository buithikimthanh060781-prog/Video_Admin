// videos module: danh sách, tìm kiếm, lọc, phân trang, xóa video
import { supabase } from './supabase.js?v=202610171935';
import { initLayout } from './layout.js?v=202610171935';
import {
  confirmModal,
  createBadge,
  createPagedTable,
  showFlashToast,
  showToast,
} from './components.js?v=202610171935';
import { openVideoModal, isYouTubeVideo } from './player.js?v=202610171935';
import { BUCKETS, getPathFromPublicUrl, removeFiles } from './storage.js?v=202610171935';
import { VIDEO_STATUSES } from './course-utils.js?v=202610171935';
import { createElement, debounce, escapeLikePattern, formatDate, formatNumber } from './utils.js?v=202610171935';

const COLUMN_COUNT = 8;
const THUMBNAIL_PLACEHOLDER = 'assets/thumbnail-placeholder.svg';

const filters = {
  search: '',
  categoryId: '',
  status: '',
};

const elements = {};
let table = null;

// ---------- Data ----------

async function fetchVideos({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('videos')
    .select('id, title, thumbnail_url, storage_path, video_source, video_url, views, status, created_at, video_categories(name), course_lessons(count)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (filters.search) query = query.ilike('title', `%${escapeLikePattern(filters.search)}%`);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

async function fetchCategories() {
  const { data, error } = await supabase.from('video_categories').select('id, name').order('name');
  if (error) throw error;
  return data;
}

async function deleteVideoRecord(id) {
  const { data, error } = await supabase.from('videos').delete().eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('not deleted');
}

async function updateVideoStatus(id, status) {
  const { data, error } = await supabase.from('videos').update({ status }).eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('not updated');
}

// Số bài học (trong các khóa học) đang dùng video. > 0 thì không được xóa, chỉ ngừng kích hoạt.
function getLessonCount(video) {
  return video.course_lessons?.[0]?.count ?? 0;
}

// ---------- Render ----------

function createThumbnailCell(url) {
  const cell = createElement('td');
  const image = createElement('img', 'table-thumb');
  image.src = url || THUMBNAIL_PLACEHOLDER;
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => { image.src = THUMBNAIL_PLACEHOLDER; }, { once: true });
  cell.appendChild(image);
  return cell;
}

function createActionsCell(video) {
  const cell = createElement('td');
  const wrapper = createElement('div', 'table-actions');

  const watchButton = createElement('button', 'btn btn-secondary btn-sm', 'Xem');
  watchButton.type = 'button';
  watchButton.addEventListener('click', () => openVideoModal(video));

  const editLink = createElement('a', 'btn btn-secondary btn-sm', 'Sửa');
  editLink.href = `video-edit.html?id=${encodeURIComponent(video.id)}`;

  wrapper.append(watchButton, editLink);

  // Video thuộc khóa học: không xóa, chỉ Ngừng kích hoạt / Kích hoạt lại
  if (getLessonCount(video) > 0) {
    const isActive = video.status === 'PUBLISHED';
    const toggleButton = createElement('button', isActive ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm', isActive ? 'Ngừng kích hoạt' : 'Kích hoạt lại');
    toggleButton.type = 'button';
    toggleButton.addEventListener('click', () => handleToggleActive(video, isActive ? 'HIDDEN' : 'PUBLISHED', toggleButton));
    wrapper.appendChild(toggleButton);
  } else {
    const deleteButton = createElement('button', 'btn btn-danger btn-sm', 'Xóa');
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => handleDelete(video, deleteButton));
    wrapper.appendChild(deleteButton);
  }
  cell.appendChild(wrapper);
  return cell;
}

function createTitleCell(video) {
  const cell = createElement('td', 'cell-title', video.title);
  if (isYouTubeVideo(video)) cell.appendChild(createBadge('YouTube', 'danger'));
  const lessonCount = getLessonCount(video);
  if (lessonCount > 0) {
    const badge = createBadge(`Khóa học · ${lessonCount} bài`, 'primary');
    badge.title = 'Video đang được dùng trong khóa học: không thể xóa, chỉ ngừng kích hoạt.';
    cell.appendChild(badge);
  }
  return cell;
}

function createVideoRow(video) {
  const row = document.createElement('tr');
  const statusCell = createElement('td');
  const status = VIDEO_STATUSES[video.status] || { label: video.status, badge: 'default' };
  statusCell.appendChild(createBadge(status.label, status.badge));

  row.append(
    createElement('td', 'text-secondary', String(video.id)),
    createThumbnailCell(video.thumbnail_url),
    createTitleCell(video),
    createElement('td', '', video.video_categories?.name || '—'),
    createElement('td', 'text-right', formatNumber(video.views)),
    statusCell,
    createElement('td', 'text-secondary', formatDate(video.created_at)),
    createActionsCell(video),
  );
  return row;
}

function hasActiveFilters() {
  return Boolean(filters.search || filters.categoryId || filters.status);
}

function getEmptyState() {
  if (hasActiveFilters()) return { message: 'Không tìm thấy video phù hợp.' };
  return {
    message: 'Chưa có video nào.',
    actionLabel: 'Thêm video',
    onAction: () => { location.href = 'video-edit.html'; },
  };
}

// ---------- Actions ----------

async function deleteVideoFiles(video) {
  const thumbnailPath = getPathFromPublicUrl(BUCKETS.thumbnails, video.thumbnail_url);
  const results = await Promise.all([
    removeFiles(BUCKETS.thumbnails, [thumbnailPath]),
    removeFiles(BUCKETS.videos, [video.storage_path]),
  ]);
  return results.every(Boolean);
}

async function handleDelete(video, button) {
  const confirmed = await confirmModal({
    title: 'Xóa video?',
    message: 'Hành động này không thể hoàn tác.',
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await deleteVideoRecord(video.id);
    const filesRemoved = await deleteVideoFiles(video);
    showToast(filesRemoved ? 'Đã xóa video.' : 'Đã xóa video, nhưng chưa xóa được tệp trên kho lưu trữ.', filesRemoved ? 'success' : 'warning');
    await table.load();
  } catch {
    // Database chặn xóa nếu video vừa được gắn vào khóa học (RLS + khóa ngoại RESTRICT)
    showToast('Không thể xóa video. Nếu video đang dùng trong khóa học, hãy dùng "Ngừng kích hoạt".', 'error', 4500);
    await table.load();
  }
}

const TOGGLE_CONFIRMS = {
  HIDDEN: {
    title: 'Ngừng kích hoạt video?',
    message: (count) => `Video đang dùng trong ${count} bài học. Học viên sẽ không xem được video này cho đến khi bạn kích hoạt lại. Video và các bài học không bị xóa.`,
    confirmText: 'Ngừng kích hoạt',
    success: 'Đã ngừng kích hoạt video.',
  },
  PUBLISHED: {
    title: 'Kích hoạt lại video?',
    message: (count) => `Video sẽ hiển thị trở lại trong ${count} bài học của khóa học.`,
    confirmText: 'Kích hoạt lại',
    success: 'Đã kích hoạt lại video.',
  },
};

async function handleToggleActive(video, nextStatus, button) {
  const config = TOGGLE_CONFIRMS[nextStatus];
  const confirmed = await confirmModal({
    title: config.title,
    message: config.message(getLessonCount(video)),
    confirmText: config.confirmText,
    cancelText: 'Hủy',
    variant: 'primary',
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await updateVideoStatus(video.id, nextStatus);
    showToast(config.success, 'success');
    await table.load();
  } catch {
    button.disabled = false;
    showToast('Không thể cập nhật trạng thái video. Vui lòng thử lại.', 'error');
  }
}

// ---------- Filters ----------

async function loadCategoryOptions() {
  try {
    const categories = await fetchCategories();
    categories.forEach((category) => {
      const option = createElement('option', '', category.name);
      option.value = category.id;
      elements.categoryFilter.appendChild(option);
    });
  } catch {
    showToast('Không tải được danh sách danh mục.', 'error');
  }
}

function initFilters() {
  elements.searchInput.addEventListener('input', debounce(() => {
    filters.search = elements.searchInput.value.trim();
    table.loadFirstPage();
  }, 350));
  elements.categoryFilter.addEventListener('change', () => {
    filters.categoryId = elements.categoryFilter.value;
    table.loadFirstPage();
  });
  elements.statusFilter.addEventListener('change', () => {
    filters.status = elements.statusFilter.value;
    table.loadFirstPage();
  });
}

// ---------- Init ----------

async function initVideosPage() {
  const profile = await initLayout('Quản lý video');
  if (!profile) return;

  elements.searchInput = document.getElementById('search-input');
  elements.categoryFilter = document.getElementById('category-filter');
  elements.statusFilter = document.getElementById('status-filter');

  table = createPagedTable({
    tbody: document.getElementById('videos-body'),
    paginationContainer: document.getElementById('pagination'),
    columnCount: COLUMN_COUNT,
    fetchPage: fetchVideos,
    renderRow: createVideoRow,
    getEmptyState,
  });

  showFlashToast();
  initFilters();
  await Promise.all([loadCategoryOptions(), table.load()]);
}

initVideosPage();
