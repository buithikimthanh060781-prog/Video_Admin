// videos module: danh sách, tìm kiếm, lọc, phân trang, xóa video
import { supabase } from './supabase.js';
import { initLayout } from './layout.js';
import {
  confirmModal,
  createBadge,
  createPagedTable,
  showFlashToast,
  showToast,
} from './components.js';
import { openVideoModal, isYouTubeVideo } from './player.js';
import { BUCKETS, getPathFromPublicUrl, removeFiles } from './storage.js';
import { createElement, debounce, escapeLikePattern, formatDate, formatNumber } from './utils.js';

const COLUMN_COUNT = 8;
const THUMBNAIL_PLACEHOLDER = 'assets/thumbnail-placeholder.svg';

const STATUS_BADGES = {
  PUBLISHED: 'success',
  DRAFT: 'warning',
  HIDDEN: 'default',
};

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
    .select('id, title, thumbnail_url, storage_path, video_source, video_url, views, status, created_at, video_categories(name)', { count: 'exact' })
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

  const watchButton = createElement('button', 'btn btn-secondary btn-sm', 'Watch');
  watchButton.type = 'button';
  watchButton.addEventListener('click', () => openVideoModal(video));

  const editLink = createElement('a', 'btn btn-secondary btn-sm', 'Edit');
  editLink.href = `video-edit.html?id=${encodeURIComponent(video.id)}`;

  const deleteButton = createElement('button', 'btn btn-danger btn-sm', 'Delete');
  deleteButton.type = 'button';
  deleteButton.addEventListener('click', () => handleDelete(video, deleteButton));

  wrapper.append(watchButton, editLink, deleteButton);
  cell.appendChild(wrapper);
  return cell;
}

function createTitleCell(video) {
  const cell = createElement('td', 'cell-title', video.title);
  if (isYouTubeVideo(video)) cell.appendChild(createBadge('YouTube', 'danger'));
  return cell;
}

function createVideoRow(video) {
  const row = document.createElement('tr');
  const statusCell = createElement('td');
  statusCell.appendChild(createBadge(video.status, STATUS_BADGES[video.status] || 'default'));

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
    actionLabel: 'Add Video',
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
    title: 'Delete video?',
    message: 'This action cannot be undone.',
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await deleteVideoRecord(video.id);
    const filesRemoved = await deleteVideoFiles(video);
    showToast(filesRemoved ? 'Đã xóa video.' : 'Đã xóa video, nhưng chưa xóa được file trên Storage.', filesRemoved ? 'success' : 'warning');
    await table.load();
  } catch {
    button.disabled = false;
    showToast('Không thể xóa video. Vui lòng thử lại.', 'error');
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
    showToast('Không tải được danh sách category.', 'error');
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
  const profile = await initLayout('Videos');
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
