// course-categories module: danh sách, thêm, sửa, bật/tắt, xóa lĩnh vực khóa học (chỉ ADMIN)
import { supabase } from './supabase.js?v=202610180851';
import { initLayout } from './layout.js?v=202610180851';
import { confirmModal, createBadge, createPagedTable, openModal, showToast } from './components.js?v=202610180851';
import { createElement, debounce, escapeLikePattern, formatDate, formatNumber, slugify } from './utils.js?v=202610180851';

const COLUMN_COUNT = 9;
const NAME_MAX_LENGTH = 100;
const SORT_ORDER_MAX = 100000;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

const filters = { search: '', status: '' };

const elements = {};
let table = null;

// ---------- Data ----------

async function fetchCourseCategories({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('course_categories')
    .select('id, name, slug, description, sort_order, is_active, created_at, courses(count)', { count: 'exact' })
    .order('sort_order')
    .order('name')
    .range(from, from + pageSize - 1);
  if (filters.search) query = query.ilike('name', `%${escapeLikePattern(filters.search)}%`);
  if (filters.status) query = query.eq('is_active', filters.status === 'active');

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

async function saveCourseCategory(id, payload) {
  const request = id
    ? supabase.from('course_categories').update(payload).eq('id', id).select('id')
    : supabase.from('course_categories').insert(payload).select('id');
  const { data, error } = await request;
  if (error) throw error;
  if (data.length === 0) throw new Error('not saved');
}

async function deleteCourseCategory(id) {
  const { data, error } = await supabase.from('course_categories').delete().eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('not deleted');
}

function getCourseCount(category) {
  return category.courses?.[0]?.count ?? 0;
}

// ---------- Form (modal) ----------

function createField({ name, label, type = 'input', inputType, value = '', hint = '', required = false, options = null }) {
  const group = createElement('div', 'form-group');
  const labelElement = createElement('label', '', label);
  labelElement.htmlFor = `course-category-${name}`;
  if (required) labelElement.appendChild(createElement('span', 'required', ' *'));

  const input = document.createElement(type);
  input.id = `course-category-${name}`;
  input.name = name;
  if (inputType) input.type = inputType;
  if (type === 'textarea') input.rows = 3;
  if (options) {
    options.forEach(({ value: optionValue, label: optionLabel }) => {
      const option = createElement('option', '', optionLabel);
      option.value = optionValue;
      input.appendChild(option);
    });
  }
  input.value = value;

  group.append(labelElement, input);
  if (hint) group.appendChild(createElement('small', 'form-hint', hint));
  const error = createElement('small', 'field-error');
  error.dataset.errorFor = name;
  group.appendChild(error);
  return group;
}

function setFormError(form, name, message) {
  const errorElement = form.querySelector(`[data-error-for="${name}"]`);
  errorElement.textContent = message;
  form.elements[name].classList.toggle('is-invalid', Boolean(message));
}

function createCategoryForm(category) {
  const form = createElement('form', 'category-form');
  form.noValidate = true;
  form.append(
    createElement('div', 'form-message form-message-error'),
    createField({ name: 'name', label: 'Tên lĩnh vực', value: category?.name, required: true }),
    createField({ name: 'slug', label: 'Đường dẫn (slug)', value: category?.slug, hint: 'Chỉ gồm a-z, 0-9 và dấu "-". Để trống để tự tạo từ tên.' }),
    createField({ name: 'description', label: 'Mô tả', type: 'textarea', value: category?.description || '' }),
    createField({
      name: 'sort_order',
      label: 'Thứ tự hiển thị',
      inputType: 'number',
      value: String(category?.sort_order ?? 0),
      hint: 'Số nhỏ hiển thị trước.',
    }),
    createField({
      name: 'is_active',
      label: 'Trạng thái',
      type: 'select',
      value: String(category?.is_active ?? true),
      options: [
        { value: 'true', label: 'Hiển thị' },
        { value: 'false', label: 'Ẩn' },
      ],
    }),
  );
  form.querySelector('.form-message').hidden = true;

  // Tự tạo slug từ tên khi người dùng chưa sửa slug
  let isSlugEdited = Boolean(category);
  form.elements.slug.addEventListener('input', () => {
    isSlugEdited = true;
    setFormError(form, 'slug', '');
  });
  form.elements.name.addEventListener('input', () => {
    setFormError(form, 'name', '');
    if (!isSlugEdited) form.elements.slug.value = slugify(form.elements.name.value);
  });
  form.elements.sort_order.addEventListener('input', () => setFormError(form, 'sort_order', ''));
  return form;
}

function readCategoryForm(form) {
  const name = form.elements.name.value.trim();
  return {
    name,
    slug: form.elements.slug.value.trim() || slugify(name),
    description: form.elements.description.value.trim() || null,
    sort_order: Number(form.elements.sort_order.value),
    is_active: form.elements.is_active.value === 'true',
  };
}

function validateCategoryForm(form, values) {
  ['name', 'slug', 'sort_order'].forEach((name) => setFormError(form, name, ''));
  let isValid = true;
  if (!values.name) {
    setFormError(form, 'name', 'Vui lòng nhập tên lĩnh vực.');
    isValid = false;
  } else if (values.name.length > NAME_MAX_LENGTH) {
    setFormError(form, 'name', `Tên tối đa ${NAME_MAX_LENGTH} ký tự.`);
    isValid = false;
  }
  if (values.name && !SLUG_PATTERN.test(values.slug)) {
    setFormError(form, 'slug', 'Đường dẫn (slug) không hợp lệ.');
    isValid = false;
  }
  if (!form.elements.sort_order.value.trim() || !Number.isInteger(values.sort_order)
    || Math.abs(values.sort_order) > SORT_ORDER_MAX) {
    setFormError(form, 'sort_order', `Thứ tự phải là số nguyên từ -${SORT_ORDER_MAX} đến ${SORT_ORDER_MAX}.`);
    isValid = false;
  }
  return isValid;
}

function showFormMessage(form, message) {
  const box = form.querySelector('.form-message');
  box.textContent = message;
  box.hidden = !message;
}

function getFriendlySaveError(error) {
  if (error?.code === UNIQUE_VIOLATION) return 'Tên hoặc đường dẫn (slug) đã tồn tại.';
  return 'Không thể lưu lĩnh vực. Vui lòng thử lại.';
}

function openCategoryModal(category = null) {
  const form = createCategoryForm(category);
  let isSaving = false;

  async function submit() {
    if (isSaving) return false;
    const values = readCategoryForm(form);
    showFormMessage(form, '');
    if (!validateCategoryForm(form, values)) return false;

    isSaving = true;
    try {
      await saveCourseCategory(category?.id, values);
      showToast(category ? 'Đã cập nhật lĩnh vực.' : 'Đã thêm lĩnh vực.', 'success');
      table.load();
      return true;
    } catch (error) {
      showFormMessage(form, getFriendlySaveError(error));
      return false;
    } finally {
      isSaving = false;
    }
  }

  openModal({
    title: category ? 'Sửa lĩnh vực' : 'Thêm lĩnh vực',
    body: form,
    actions: [
      { label: 'Hủy', variant: 'secondary' },
      { label: 'Lưu', variant: 'primary', onClick: submit },
    ],
  });
  form.elements.name.focus();
}

// ---------- Toggle / Delete ----------

async function handleToggleActive(category, button) {
  const nextActive = !category.is_active;
  if (!nextActive) {
    const confirmed = await confirmModal({
      title: 'Ẩn lĩnh vực?',
      message: 'Lĩnh vực bị ẩn sẽ không hiển thị với khách. Các khóa học thuộc lĩnh vực này không bị xóa.',
      confirmText: 'Ẩn',
      variant: 'primary',
    });
    if (!confirmed) return;
  }

  button.disabled = true;
  try {
    await saveCourseCategory(category.id, { is_active: nextActive });
    showToast(nextActive ? 'Đã hiển thị lĩnh vực.' : 'Đã ẩn lĩnh vực.', 'success');
    await table.load();
  } catch {
    button.disabled = false;
    showToast('Không thể đổi trạng thái. Vui lòng thử lại.', 'error');
  }
}

async function handleDelete(category, button) {
  const courseCount = getCourseCount(category);
  if (courseCount > 0) {
    showToast(`Lĩnh vực đang có ${courseCount} khóa học. Hãy chuyển hoặc xóa các khóa học trước.`, 'warning');
    return;
  }
  const confirmed = await confirmModal({
    title: 'Xóa lĩnh vực?',
    message: 'Hành động này không thể hoàn tác.',
    confirmText: 'Xóa',
    cancelText: 'Hủy',
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await deleteCourseCategory(category.id);
    showToast('Đã xóa lĩnh vực.', 'success');
    await table.load();
  } catch (error) {
    button.disabled = false;
    const message = error?.code === FOREIGN_KEY_VIOLATION
      ? 'Lĩnh vực đang có khóa học liên quan, không thể xóa.'
      : 'Không thể xóa lĩnh vực. Vui lòng thử lại.';
    showToast(message, 'error');
  }
}

// ---------- Render ----------

function createActionsCell(category) {
  const cell = createElement('td');
  const wrapper = createElement('div', 'table-actions');

  const editButton = createElement('button', 'btn btn-secondary btn-sm', 'Sửa');
  editButton.type = 'button';
  editButton.addEventListener('click', () => openCategoryModal(category));

  const toggleButton = createElement('button', 'btn btn-secondary btn-sm', category.is_active ? 'Ẩn' : 'Hiện');
  toggleButton.type = 'button';
  toggleButton.addEventListener('click', () => handleToggleActive(category, toggleButton));

  const deleteButton = createElement('button', 'btn btn-danger btn-sm', 'Xóa');
  deleteButton.type = 'button';
  deleteButton.addEventListener('click', () => handleDelete(category, deleteButton));

  wrapper.append(editButton, toggleButton, deleteButton);
  cell.appendChild(wrapper);
  return cell;
}

function createCategoryRow(category) {
  const row = document.createElement('tr');
  const statusCell = createElement('td');
  statusCell.appendChild(createBadge(category.is_active ? 'Hiển thị' : 'Ẩn', category.is_active ? 'success' : 'default'));

  row.append(
    createElement('td', 'text-secondary', String(category.id)),
    createElement('td', 'cell-title', category.name),
    createElement('td', 'cell-id', category.slug),
    createElement('td', 'cell-description text-secondary', category.description || '—'),
    createElement('td', 'text-right cell-sort', String(category.sort_order)),
    statusCell,
    createElement('td', 'text-right', formatNumber(getCourseCount(category))),
    createElement('td', 'text-secondary', formatDate(category.created_at)),
    createActionsCell(category),
  );
  return row;
}

function getEmptyState() {
  if (filters.search || filters.status) return { message: 'Không tìm thấy lĩnh vực phù hợp.' };
  return { message: 'Chưa có lĩnh vực nào.', actionLabel: 'Thêm lĩnh vực', onAction: () => openCategoryModal() };
}

// ---------- Init ----------

async function initCourseCategoriesPage() {
  const profile = await initLayout('Lĩnh vực khóa học');
  if (!profile) return;

  elements.searchInput = document.getElementById('search-input');
  elements.statusFilter = document.getElementById('status-filter');
  table = createPagedTable({
    tbody: document.getElementById('course-categories-body'),
    paginationContainer: document.getElementById('pagination'),
    columnCount: COLUMN_COUNT,
    fetchPage: fetchCourseCategories,
    renderRow: createCategoryRow,
    getEmptyState,
  });

  document.getElementById('add-course-category').addEventListener('click', () => openCategoryModal());
  elements.searchInput.addEventListener('input', debounce(() => {
    filters.search = elements.searchInput.value.trim();
    table.loadFirstPage();
  }, 350));
  elements.statusFilter.addEventListener('change', () => {
    filters.status = elements.statusFilter.value;
    table.loadFirstPage();
  });

  await table.load();
}

initCourseCategoriesPage();
