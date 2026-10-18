// Bộ chọn video từ kho video hiện có (bảng videos). Không upload, không sao chép video.
// Hiển thị bên trong modal bài học (không mở modal chồng modal).
import { supabase } from './supabase.js?v=202610180851';
import { createBadge, createPagedTable, showToast } from './components.js?v=202610180851';
import { VIDEO_STATUSES } from './course-utils.js?v=202610180851';
import { isYouTubeVideo } from './player.js?v=202610180851';
import { createElement, debounce, escapeLikePattern, formatDuration } from './utils.js?v=202610180851';

const PAGE_SIZE_OPTIONS = [5, 10, 20];
const COLUMN_COUNT = 6;
const THUMBNAIL_PLACEHOLDER = 'assets/thumbnail-placeholder.svg';
export const PICKER_VIDEO_COLUMNS = 'id, title, thumbnail_url, video_source, video_url, storage_path, duration, status, video_categories(name)';

async function fetchCategories() {
  const { data, error } = await supabase.from('video_categories').select('id, name').order('name');
  if (error) throw error;
  return data;
}

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

// onSelect(video): gọi khi chọn video. onCancel(): gọi khi bấm "Quay lại".
export function createVideoPicker({ onSelect, onCancel }) {
  const filters = { search: '', categoryId: '' };
  let isCategoriesLoaded = false;

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Tìm video theo tên...';
  searchInput.setAttribute('aria-label', 'Tìm video theo tên');

  const categoryFilter = document.createElement('select');
  categoryFilter.setAttribute('aria-label', 'Lọc theo danh mục video');
  categoryFilter.appendChild(createElement('option', '', 'Tất cả danh mục'));
  categoryFilter.firstChild.value = '';

  const backButton = createElement('button', 'btn btn-secondary', '← Quay lại');
  backButton.type = 'button';
  backButton.addEventListener('click', () => onCancel());

  const filterBox = createElement('div', 'toolbar-filters');
  filterBox.append(searchInput, categoryFilter);
  const toolbar = createElement('div', 'toolbar');
  toolbar.append(filterBox, backButton);

  const tbody = document.createElement('tbody');
  const headRow = document.createElement('tr');
  ['Ảnh', 'Tiêu đề', 'Danh mục', 'Thời lượng', 'Trạng thái', ''].forEach((label) => {
    headRow.appendChild(createElement('th', '', label));
  });
  const thead = document.createElement('thead');
  thead.appendChild(headRow);
  const tableElement = createElement('table', 'table table-compact');
  tableElement.append(thead, tbody);
  const tableWrapper = createElement('div', 'table-wrapper');
  tableWrapper.appendChild(tableElement);

  const pagination = document.createElement('div');
  const element = createElement('div', 'video-picker');
  element.append(
    createElement('p', 'form-hint', 'Chọn một video có sẵn trong kho. Video không bị sao chép hay tải lên lại.'),
    toolbar,
    tableWrapper,
    pagination,
  );

  async function fetchVideos({ page, pageSize }) {
    const from = (page - 1) * pageSize;
    let query = supabase
      .from('videos')
      .select(PICKER_VIDEO_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (filters.search) query = query.ilike('title', `%${escapeLikePattern(filters.search)}%`);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);

    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: data, total: count ?? 0 };
  }

  function createRow(video) {
    const row = document.createElement('tr');
    const status = VIDEO_STATUSES[video.status] || { label: video.status, badge: 'default' };
    const titleCell = createElement('td', 'cell-title', video.title);
    if (isYouTubeVideo(video)) titleCell.appendChild(createBadge('YouTube', 'danger'));
    const statusCell = createElement('td');
    statusCell.appendChild(createBadge(status.label, status.badge));

    const selectButton = createElement('button', 'btn btn-primary btn-sm', 'Chọn');
    selectButton.type = 'button';
    selectButton.addEventListener('click', () => onSelect(video));
    const actionCell = createElement('td');
    actionCell.appendChild(selectButton);

    row.append(
      createThumbnailCell(video.thumbnail_url),
      titleCell,
      createElement('td', '', video.video_categories?.name || '—'),
      createElement('td', 'text-secondary', formatDuration(video.duration)),
      statusCell,
      actionCell,
    );
    return row;
  }

  const table = createPagedTable({
    tbody,
    paginationContainer: pagination,
    columnCount: COLUMN_COUNT,
    fetchPage: fetchVideos,
    renderRow: createRow,
    getEmptyState: () => ({
      message: filters.search || filters.categoryId ? 'Không tìm thấy video phù hợp.' : 'Kho chưa có video nào.',
    }),
    pageSize: PAGE_SIZE_OPTIONS[0],
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  });

  searchInput.addEventListener('input', debounce(() => {
    filters.search = searchInput.value.trim();
    table.loadFirstPage();
  }, 350));
  categoryFilter.addEventListener('change', () => {
    filters.categoryId = categoryFilter.value;
    table.loadFirstPage();
  });

  async function loadCategories() {
    if (isCategoriesLoaded) return;
    try {
      const categories = await fetchCategories();
      categories.forEach((category) => {
        const option = createElement('option', '', category.name);
        option.value = category.id;
        categoryFilter.appendChild(option);
      });
      isCategoriesLoaded = true;
    } catch {
      showToast('Không tải được danh mục video.', 'error');
    }
  }

  return {
    element,
    load: () => Promise.all([loadCategories(), table.load()]),
  };
}
