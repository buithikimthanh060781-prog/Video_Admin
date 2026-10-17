// courses module: danh sách, tìm kiếm, lọc, phân trang, xuất bản/ẩn, xóa khóa học (chỉ ADMIN)
import { supabase } from './supabase.js?v=202610171935';
import { initLayout } from './layout.js?v=202610171935';
import { confirmModal, createBadge, createPagedTable, showFlashToast, showToast } from './components.js?v=202610171935';
import { BUCKETS, getPathFromPublicUrl, removeFiles } from './storage.js?v=202610171935';
import { COURSE_STATUSES, getFriendlyCourseError, getPublishMissing, updateCourseStatus } from './course-utils.js?v=202610171935';
import { duplicateCourse } from './course-duplicate.js?v=202610171935';
import { createElement, debounce, escapeLikePattern, formatCurrency, formatDate } from './utils.js?v=202610171935';

const COLUMN_COUNT = 8;
const THUMBNAIL_PLACEHOLDER = 'assets/thumbnail-placeholder.svg';

const filters = { search: '', categoryId: '', status: '' };

const elements = {};
let table = null;
let currentProfile = null;

// ---------- Data ----------

// Bỏ ký tự làm hỏng cú pháp bộ lọc .or() của PostgREST
function toOrSafePattern(text) {
  return escapeLikePattern(text).replace(/[,()*"]/g, ' ').trim();
}

async function fetchCourses({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('courses')
    .select('id, code, title, instructor_name, thumbnail_url, category_id, price, sale_price, status, updated_at, course_categories(name)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, from + pageSize - 1);

  const keyword = toOrSafePattern(filters.search);
  if (keyword) query = query.or(`title.ilike.%${keyword}%,code.ilike.%${keyword}%`);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

async function fetchCategories() {
  const { data, error } = await supabase
    .from('course_categories')
    .select('id, name')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
}

async function deleteCourseRecord(id) {
  const { data, error } = await supabase.from('courses').delete().eq('id', id).select('id');
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

function createTitleCell(course) {
  const cell = createElement('td', 'cell-title');
  cell.appendChild(createElement('span', '', course.title));
  if (course.instructor_name) cell.appendChild(createElement('small', 'cell-subtitle', course.instructor_name));
  return cell;
}

function createPriceCell(course) {
  const cell = createElement('td', 'text-right cell-price');
  const hasSale = course.sale_price !== null && course.sale_price < course.price;
  const finalPrice = hasSale ? course.sale_price : course.price;
  cell.appendChild(createElement('strong', '', finalPrice > 0 ? formatCurrency(finalPrice) : 'Miễn phí'));
  if (hasSale) cell.appendChild(createElement('small', 'price-old', formatCurrency(course.price)));
  return cell;
}

function createActionsCell(course) {
  const cell = createElement('td');
  const wrapper = createElement('div', 'table-actions');

  const editLink = createElement('a', 'btn btn-secondary btn-sm', 'Sửa');
  editLink.href = `course-edit.html?id=${encodeURIComponent(course.id)}`;

  const isPublished = course.status === 'PUBLISHED';
  const statusButton = createElement('button', 'btn btn-secondary btn-sm', isPublished ? 'Ẩn' : 'Xuất bản');
  statusButton.type = 'button';
  statusButton.addEventListener('click', () => handleStatusChange(course, isPublished ? 'HIDDEN' : 'PUBLISHED', statusButton));

  const duplicateButton = createElement('button', 'btn btn-secondary btn-sm', 'Sao chép');
  duplicateButton.type = 'button';
  duplicateButton.addEventListener('click', () => handleDuplicate(course, duplicateButton));

  const deleteButton = createElement('button', 'btn btn-danger btn-sm', 'Xóa');
  deleteButton.type = 'button';
  deleteButton.addEventListener('click', () => handleDelete(course, deleteButton));

  wrapper.append(editLink, duplicateButton, statusButton, deleteButton);
  cell.appendChild(wrapper);
  return cell;
}

function createCourseRow(course) {
  const row = document.createElement('tr');
  const status = COURSE_STATUSES[course.status] || { label: course.status, badge: 'default' };
  const statusCell = createElement('td');
  statusCell.appendChild(createBadge(status.label, status.badge));

  row.append(
    createThumbnailCell(course.thumbnail_url),
    createElement('td', 'cell-id', course.code),
    createTitleCell(course),
    createElement('td', '', course.course_categories?.name || '—'),
    createPriceCell(course),
    statusCell,
    createElement('td', 'text-secondary', formatDate(course.updated_at)),
    createActionsCell(course),
  );
  return row;
}

function hasActiveFilters() {
  return Boolean(filters.search || filters.categoryId || filters.status);
}

function getEmptyState() {
  if (hasActiveFilters()) return { message: 'Không tìm thấy khóa học phù hợp.' };
  return {
    message: 'Chưa có khóa học nào.',
    actionLabel: 'Thêm khóa học',
    onAction: () => { location.href = 'course-edit.html'; },
  };
}

// ---------- Actions ----------

async function handleStatusChange(course, nextStatus, button) {
  if (nextStatus === 'PUBLISHED') {
    const missing = getPublishMissing(course);
    if (missing.length > 0) {
      showToast(`Chưa thể xuất bản. Còn thiếu: ${missing.join(', ')}.`, 'warning');
      return;
    }
  }
  const isPublishing = nextStatus === 'PUBLISHED';
  const confirmed = await confirmModal({
    title: isPublishing ? 'Xuất bản khóa học?' : 'Ẩn khóa học?',
    message: isPublishing
      ? 'Khóa học sẽ hiển thị công khai cho khách tham khảo.'
      : 'Khóa học sẽ không còn hiển thị với khách. Dữ liệu không bị xóa.',
    confirmText: isPublishing ? 'Xuất bản' : 'Ẩn',
    cancelText: 'Hủy',
    variant: 'primary',
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await updateCourseStatus(course.id, nextStatus);
    showToast(isPublishing ? 'Đã xuất bản khóa học.' : 'Đã ẩn khóa học.', 'success');
    await table.load();
  } catch (error) {
    button.disabled = false;
    showToast(getFriendlyCourseError(error, 'Không thể đổi trạng thái. Vui lòng thử lại.'), 'error');
  }
}

async function handleDuplicate(course, button) {
  const confirmed = await confirmModal({
    title: 'Sao chép khóa học?',
    message: `Tạo bản nháp mới từ "${course.title}" gồm thông tin, chương và bài học. Video không bị sao chép, các bài học dùng chung video gốc.`,
    confirmText: 'Sao chép',
    cancelText: 'Hủy',
    variant: 'primary',
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    const { thumbnailCopied } = await duplicateCourse(course.id, currentProfile.id);
    showToast(
      thumbnailCopied ? 'Đã sao chép khóa học (bản nháp).' : 'Đã sao chép khóa học, nhưng chưa sao chép được ảnh bìa. Hãy chọn lại ảnh.',
      thumbnailCopied ? 'success' : 'warning',
    );
    await table.loadFirstPage();
  } catch {
    button.disabled = false;
    showToast('Không thể sao chép khóa học. Vui lòng thử lại.', 'error');
  }
}

async function handleDelete(course, button) {
  const confirmed = await confirmModal({
    title: 'Xóa khóa học?',
    message: `Khóa học "${course.title}" cùng chương và bài học sẽ bị xóa. Video gốc trong kho không bị xóa. Hành động này không thể hoàn tác.`,
    confirmText: 'Xóa',
    cancelText: 'Hủy',
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await deleteCourseRecord(course.id);
    const thumbnailPath = getPathFromPublicUrl(BUCKETS.thumbnails, course.thumbnail_url);
    const filesRemoved = await removeFiles(BUCKETS.thumbnails, [thumbnailPath]);
    showToast(
      filesRemoved ? 'Đã xóa khóa học.' : 'Đã xóa khóa học, nhưng chưa xóa được ảnh bìa trên kho lưu trữ.',
      filesRemoved ? 'success' : 'warning',
    );
    await table.load();
  } catch {
    button.disabled = false;
    showToast('Không thể xóa khóa học. Vui lòng thử lại.', 'error');
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
    showToast('Không tải được danh sách lĩnh vực.', 'error');
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

async function initCoursesPage() {
  const profile = await initLayout('Quản lý khóa học');
  if (!profile) return;
  currentProfile = profile;

  elements.searchInput = document.getElementById('search-input');
  elements.categoryFilter = document.getElementById('category-filter');
  elements.statusFilter = document.getElementById('status-filter');

  table = createPagedTable({
    tbody: document.getElementById('courses-body'),
    paginationContainer: document.getElementById('pagination'),
    columnCount: COLUMN_COUNT,
    fetchPage: fetchCourses,
    renderRow: createCourseRow,
    getEmptyState,
  });

  showFlashToast();
  initFilters();
  await Promise.all([loadCategoryOptions(), table.load()]);
}

initCoursesPage();
