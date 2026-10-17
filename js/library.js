// library module: thư viện video đã công khai (USER và ADMIN đều xem được)
import { supabase } from './supabase.js?v=202610172049';
import { initLayout } from './layout.js?v=202610172049';
import { createBadge, createPagedList, createStateView, showToast } from './components.js?v=202610172049';
import { isYouTubeVideo } from './player.js?v=202610172049';
import {
  createElement,
  debounce,
  escapeLikePattern,
  formatDate,
  formatDuration,
  formatNumber,
} from './utils.js?v=202610172049';

const PAGE_SIZE_OPTIONS = [12, 24, 48];
const THUMBNAIL_PLACEHOLDER = 'assets/thumbnail-placeholder.svg';
const CARD_COLUMNS = 'id, title, thumbnail_url, video_source, duration, views, created_at, video_categories(name)';

const filters = { search: '', categoryId: '' };
const elements = {};
let list = null;

// ---------- Data ----------

// Chỉ lấy video PUBLISHED (RLS cũng chặn USER xem video chưa công khai)
async function fetchPublishedVideos({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('videos')
    .select(CARD_COLUMNS, { count: 'exact' })
    .eq('status', 'PUBLISHED')
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (filters.search) query = query.ilike('title', `%${escapeLikePattern(filters.search)}%`);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

async function fetchCategories() {
  const { data, error } = await supabase.from('video_categories').select('id, name').order('name');
  if (error) throw error;
  return data;
}

// ---------- Render ----------

function createCardThumbnail(video) {
  const wrapper = createElement('div', 'video-card-thumb');
  const image = createElement('img');
  image.src = video.thumbnail_url || THUMBNAIL_PLACEHOLDER;
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => { image.src = THUMBNAIL_PLACEHOLDER; }, { once: true });
  wrapper.appendChild(image);

  if (isYouTubeVideo(video)) wrapper.appendChild(createBadge('YouTube', 'danger'));
  else if (video.duration) wrapper.appendChild(createElement('span', 'duration-badge', formatDuration(video.duration)));
  return wrapper;
}

function createVideoCard(video) {
  const card = createElement('a', 'video-card');
  card.href = `watch.html?id=${encodeURIComponent(video.id)}`;

  const meta = [
    video.video_categories?.name,
    `${formatNumber(video.views)} lượt xem`,
    formatDate(video.created_at),
  ].filter(Boolean).join(' · ');

  card.append(
    createCardThumbnail(video),
    createElement('span', 'video-card-title', video.title),
    createElement('span', 'video-card-meta', meta),
  );
  return card;
}

function renderGridState(type, options) {
  elements.grid.replaceChildren(createStateView(type, options));
}

function getEmptyState() {
  const hasFilters = Boolean(filters.search || filters.categoryId);
  return { message: hasFilters ? 'Không tìm thấy video phù hợp.' : 'Chưa có video nào được công khai.' };
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
    list.loadFirstPage();
  }, 350));
  elements.categoryFilter.addEventListener('change', () => {
    filters.categoryId = elements.categoryFilter.value;
    list.loadFirstPage();
  });
}

// ---------- Init ----------

async function initLibraryPage() {
  const profile = await initLayout('Thư viện video', { adminOnly: false });
  if (!profile) return;

  elements.grid = document.getElementById('video-grid');
  elements.searchInput = document.getElementById('search-input');
  elements.categoryFilter = document.getElementById('category-filter');

  list = createPagedList({
    container: elements.grid,
    paginationContainer: document.getElementById('pagination'),
    fetchPage: fetchPublishedVideos,
    renderItem: createVideoCard,
    renderState: renderGridState,
    getEmptyState,
    pageSize: PAGE_SIZE_OPTIONS[0],
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  });

  initFilters();
  await Promise.all([loadCategoryOptions(), list.load()]);
}

initLibraryPage();
