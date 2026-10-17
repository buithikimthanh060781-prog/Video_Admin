// course-catalog module: danh sách khóa học công khai (PUBLISHED)
// Dùng cho login.html (trang chủ công khai) và explore.html (trong hệ thống, body[data-layout="app"]).
// Hỗ trợ tham số URL: ?q=từ-khóa, ?category=ID, ?price=free (dùng bởi header và nút ở hero).
import { supabase } from './supabase.js?v=202610172049';
import { initLayout } from './layout.js?v=202610172049';
import { initPublicLayout } from './public-layout.js?v=202610172049';
import { createBadge, createPagedList, createStateView, showToast } from './components.js?v=202610172049';
import { createPriceView } from './course-view.js?v=202610172049';
import { getCategoryArt, setCourseImage } from './course-art.js?v=202610172049';
import { ENROLLMENT_STATUSES, fetchMyEnrollmentMap } from './enrollment.js?v=202610172049';
import { createIcon } from './icons.js?v=202610172049';
import { createElement, debounce, escapeLikePattern } from './utils.js?v=202610172049';

const PAGE_SIZE_OPTIONS = [12, 24, 48];
const CARD_COLUMNS = 'id, slug, title, thumbnail_url, instructor_name, price, sale_price, course_categories(name), course_sections(course_lessons(count))';
// Khóa học miễn phí = giá niêm yết 0 hoặc giá khuyến mại 0
const FREE_FILTER = 'price.eq.0,sale_price.eq.0';
const PRICE_FREE = 'free';

const isAppLayout = document.body.dataset.layout === 'app';
const DETAIL_PAGE = isAppLayout ? 'explore-detail.html' : 'course-detail.html';

const urlParams = new URLSearchParams(location.search);
const filters = {
  search: (urlParams.get('q') || '').trim().slice(0, 100),
  categoryId: /^\d+$/.test(urlParams.get('category') || '') ? urlParams.get('category') : '',
  price: urlParams.get('price') === PRICE_FREE ? PRICE_FREE : '',
};
const elements = {};
let list = null;
// course_id -> trạng thái đăng ký của người đang xem (rỗng nếu chưa đăng nhập)
let enrollmentByCourse = new Map();

// ---------- Data ----------

// Chỉ lấy khóa học PUBLISHED (RLS cũng chặn khách xem khóa học nháp / ẩn)
async function fetchPublishedCourses({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('courses')
    .select(CARD_COLUMNS, { count: 'exact' })
    .eq('status', 'PUBLISHED')
    .order('sort_order')
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (filters.search) query = query.ilike('title', `%${escapeLikePattern(filters.search)}%`);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.price === PRICE_FREE) query = query.or(FREE_FILTER);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

async function fetchCategories() {
  const { data, error } = await supabase
    .from('course_categories')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
}

async function countFreeCourses() {
  const { count, error } = await supabase
    .from('courses')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'PUBLISHED')
    .or(FREE_FILTER);
  if (error) throw error;
  return count ?? 0;
}

// category_id -> số khóa học PUBLISHED (tính từ dữ liệu thật)
async function fetchCourseCountsByCategory() {
  const { data, error } = await supabase
    .from('courses')
    .select('category_id')
    .eq('status', 'PUBLISHED');
  if (error) throw error;
  const counts = new Map();
  data.forEach(({ category_id: categoryId }) => {
    if (categoryId !== null) counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
  });
  return counts;
}

function getLessonCount(course) {
  return (course.course_sections || []).reduce((total, section) => total + (section.course_lessons?.[0]?.count ?? 0), 0);
}

// ---------- Render ----------

function createCardThumbnail(course) {
  const wrapper = createElement('div', 'course-card-thumb');
  const image = createElement('img');
  image.alt = '';
  image.width = 640;
  image.height = 360;
  image.loading = 'lazy';
  image.decoding = 'async';
  setCourseImage(image, course.thumbnail_url, course.course_categories?.name);
  wrapper.appendChild(image);

  const enrollment = ENROLLMENT_STATUSES[enrollmentByCourse.get(course.id)];
  if (enrollment) {
    const badge = createBadge(enrollment.label, enrollment.badge);
    badge.classList.add('course-card-status');
    wrapper.appendChild(badge);
  }
  return wrapper;
}

function createMetaItem(iconName, text) {
  const item = createElement('span', 'course-card-meta-item');
  item.append(createIcon(iconName, 16), createElement('span', '', text));
  return item;
}

// Chỉ hiển thị thông tin có dữ liệu thật (giảng viên, số bài học)
function createCourseCard(course) {
  const card = createElement('a', 'course-card');
  card.href = `${DETAIL_PAGE}?slug=${encodeURIComponent(course.slug)}`;

  const body = createElement('div', 'course-card-body');
  if (course.course_categories?.name) body.appendChild(createElement('span', 'course-card-category', course.course_categories.name));
  body.appendChild(createElement('h3', 'course-card-title', course.title));

  const meta = createElement('div', 'course-card-meta');
  if (course.instructor_name) meta.appendChild(createMetaItem('account', course.instructor_name));
  const lessonCount = getLessonCount(course);
  if (lessonCount > 0) meta.appendChild(createMetaItem('play', `${lessonCount} bài học`));
  if (meta.childElementCount > 0) body.appendChild(meta);

  const footer = createElement('div', 'course-card-footer');
  footer.append(createPriceView(course), createElement('span', 'course-card-cta', 'Xem chi tiết'));
  body.appendChild(footer);

  card.append(createCardThumbnail(course), body);
  return card;
}

function renderGridState(type, options) {
  elements.grid.replaceChildren(createStateView(type, options));
}

function getEmptyState() {
  const hasFilters = Boolean(filters.search || filters.categoryId || filters.price);
  return { message: hasFilters ? 'Không tìm thấy khóa học phù hợp.' : 'Chưa có khóa học nào được công khai.' };
}

// ---------- Filters ----------

async function loadCategories() {
  let categories;
  try {
    categories = await fetchCategories();
  } catch {
    showToast('Không tải được danh sách lĩnh vực.', 'error');
    return;
  }
  categories.forEach((category) => {
    const option = createElement('option', '', category.name);
    option.value = category.id;
    elements.categoryFilter.appendChild(option);
  });
  elements.categoryFilter.value = filters.categoryId;
  await renderCategorySection(categories);
}

function scrollToCourses() {
  const section = document.getElementById('courses');
  if (!section) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

// ---------- Section "Khám phá lĩnh vực" (chỉ có ở trang chủ) ----------

// Bấm thẻ lĩnh vực = chọn lĩnh vực đó trong bộ lọc sẵn có của danh sách khóa học
function selectCategory(categoryId) {
  elements.categoryFilter.value = String(categoryId);
  elements.categoryFilter.dispatchEvent(new Event('change'));
  history.replaceState(null, '', `?category=${encodeURIComponent(categoryId)}#courses`);
  scrollToCourses();
}

function createCategoryCard(category, courseCount) {
  const item = createElement('li');
  const link = createElement('a', 'category-card');
  link.href = `?category=${encodeURIComponent(category.id)}#courses`;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    selectCategory(category.id);
  });

  const media = createElement('span', 'category-card-media');
  const image = createElement('img');
  image.src = getCategoryArt(category.name);
  image.alt = '';
  image.width = 640;
  image.height = 360;
  image.loading = 'lazy';
  image.decoding = 'async';
  media.appendChild(image);

  const text = createElement('span', 'category-card-text');
  text.appendChild(createElement('span', 'category-card-name', category.name));
  if (courseCount) text.appendChild(createElement('span', 'category-card-count', `${courseCount} khóa học`));

  const body = createElement('span', 'category-card-body');
  const arrow = createIcon('arrowRight', 18);
  arrow.classList.add('category-card-arrow');
  body.append(text, arrow);

  link.append(media, body);
  item.appendChild(link);
  return item;
}

// Chỉ hiện lĩnh vực đang có khóa học công khai. Không đếm được thì vẫn hiện, không kèm số lượng.
async function renderCategorySection(categories) {
  const section = document.getElementById('danh-muc');
  const grid = document.getElementById('category-grid');
  if (!section || !grid) return;

  const counts = await fetchCourseCountsByCategory().catch(() => null);
  const visible = counts ? categories.filter((category) => counts.get(category.id) > 0) : categories;
  if (visible.length === 0) return;

  grid.replaceChildren(...visible.map((category) => createCategoryCard(category, counts?.get(category.id))));
  section.hidden = false;
}

function initFilters() {
  elements.searchInput.value = filters.search;
  elements.searchInput.addEventListener('input', debounce(() => {
    filters.search = elements.searchInput.value.trim();
    list.loadFirstPage();
  }, 350));
  elements.categoryFilter.addEventListener('change', () => {
    filters.categoryId = elements.categoryFilter.value;
    list.loadFirstPage();
  });
  if (elements.priceFilter) {
    elements.priceFilter.value = filters.price;
    elements.priceFilter.addEventListener('change', () => {
      filters.price = elements.priceFilter.value;
      list.loadFirstPage();
    });
  }
}

// Nút "Xem khóa học miễn phí" ở hero: chỉ hiện khi thật sự có khóa học miễn phí
async function initFreeCoursesCta() {
  const cta = document.getElementById('free-courses-cta');
  if (!cta || !elements.priceFilter) return;
  try {
    if ((await countFreeCourses()) === 0) return;
  } catch {
    return;
  }
  cta.hidden = false;
  cta.addEventListener('click', (event) => {
    event.preventDefault();
    elements.priceFilter.value = PRICE_FREE;
    elements.priceFilter.dispatchEvent(new Event('change'));
    scrollToCourses();
  });
}

// ---------- Init ----------

async function initViewer() {
  if (isAppLayout) return initLayout('Khóa học', { adminOnly: false });
  const { profile } = await initPublicLayout();
  return profile;
}

async function initCatalogPage() {
  const profile = await initViewer();
  if (isAppLayout && !profile) return;
  if (profile) enrollmentByCourse = await fetchMyEnrollmentMap(profile.id);

  elements.grid = document.getElementById('course-grid');
  elements.searchInput = document.getElementById('search-input');
  elements.categoryFilter = document.getElementById('category-filter');
  elements.priceFilter = document.getElementById('price-filter');

  list = createPagedList({
    container: elements.grid,
    paginationContainer: document.getElementById('pagination'),
    fetchPage: fetchPublishedCourses,
    renderItem: createCourseCard,
    renderState: renderGridState,
    getEmptyState,
    pageSize: PAGE_SIZE_OPTIONS[0],
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  });

  initFilters();
  await Promise.all([loadCategories(), list.load(), initFreeCoursesCta()]);
}

initCatalogPage();
