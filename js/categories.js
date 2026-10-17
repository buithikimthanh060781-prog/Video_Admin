// Danh mục video: danh sách, thêm, sửa, xóa (chỉ ADMIN)
import { supabase } from './supabase.js?v=202610172049';
import { initLayout } from './layout.js?v=202610172049';
import { confirmModal, createPagedTable, openModal, showToast } from './components.js?v=202610172049';
import { createElement, debounce, escapeLikePattern, formatDate, formatNumber, slugify } from './utils.js?v=202610172049';

const COLUMN_COUNT = 7;
const NAME_MAX_LENGTH = 100;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UNIQUE_VIOLATION = '23505';

const filters = { search: '' };

const elements = {};
let table = null;

// ---------- Data ----------

async function fetchCategories({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('video_categories')
    .select('id, name, slug, description, created_at, videos(count)', { count: 'exact' })
    .order('name')
    .range(from, from + pageSize - 1);
  if (filters.search) query = query.ilike('name', `%${escapeLikePattern(filters.search)}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

async function saveCategory(id, payload) {
  const request = id
    ? supabase.from('video_categories').update(payload).eq('id', id).select('id')
    : supabase.from('video_categories').insert(payload).select('id');
  const { data, error } = await request;
  if (error) throw error;
  if (data.length === 0) throw new Error('not saved');
}

async function deleteCategory(id) {
  const { data, error } = await supabase.from('video_categories').delete().eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('not deleted');
}

function getVideoCount(category) {
  return category.videos?.[0]?.count ?? 0;
}

// ---------- Category form (modal) ----------

function createField({ name, label, type = 'input', value = '', hint = '', required = false }) {
  const group = createElement('div', 'form-group');
  const labelElement = createElement('label', '', label);
  labelElement.htmlFor = `category-${name}`;
  if (required) labelElement.appendChild(createElement('span', 'required', ' *'));

  const input = document.createElement(type);
  input.id = `category-${name}`;
  input.name = name;
  input.value = value;
  if (type === 'textarea') input.rows = 3;

  group.append(labelElement, input);
  if (hint) group.appendChild(createElement('small', 'form-hint', hint));
  const error = createElement('small', 'field-error');
  error.dataset.errorFor = name;
  group.appendChild(error);
  return group;
}

function createCategoryForm(category) {
  const form = createElement('form', 'category-form');
  form.noValidate = true;
  form.append(
    createElement('div', 'form-message form-message-error'),
    createField({ name: 'name', label: 'Tên danh mục', value: category?.name, required: true }),
    createField({ name: 'slug', label: 'Đường dẫn (slug)', value: category?.slug, hint: 'Chỉ gồm a-z, 0-9 và dấu "-". Để trống để tự tạo từ tên.' }),
    createField({ name: 'description', label: 'Mô tả', type: 'textarea', value: category?.description || '' }),
  );
  form.querySelector('.form-message').hidden = true;

  // Tự tạo slug từ name khi người dùng chưa sửa slug
  let isSlugEdited = Boolean(category);
  form.elements.slug.addEventListener('input', () => {
    isSlugEdited = true;
    setFormError(form, 'slug', '');
  });
  form.elements.name.addEventListener('input', () => {
    setFormError(form, 'name', '');
    if (!isSlugEdited) form.elements.slug.value = slugify(form.elements.name.value);
  });
  return form;
}

function setFormError(form, name, message) {
  const errorElement = form.querySelector(`[data-error-for="${name}"]`);
  errorElement.textContent = message;
  form.elements[name].classList.toggle('is-invalid', Boolean(message));
}

function readCategoryForm(form) {
  const name = form.elements.name.value.trim();
  return {
    name,
    slug: form.elements.slug.value.trim() || slugify(name),
    description: form.elements.description.value.trim() || null,
  };
}

function validateCategoryForm(form, values) {
  setFormError(form, 'name', '');
  setFormError(form, 'slug', '');
  let isValid = true;
  if (!values.name) {
    setFormError(form, 'name', 'Vui lòng nhập tên danh mục.');
    isValid = false;
  } else if (values.name.length > NAME_MAX_LENGTH) {
    setFormError(form, 'name', `Tên tối đa ${NAME_MAX_LENGTH} ký tự.`);
    isValid = false;
  }
  if (values.name && !SLUG_PATTERN.test(values.slug)) {
    setFormError(form, 'slug', 'Đường dẫn (slug) không hợp lệ.');
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
  return 'Không thể lưu danh mục. Vui lòng thử lại.';
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
      await saveCategory(category?.id, values);
      showToast(category ? 'Đã cập nhật danh mục.' : 'Đã thêm danh mục.', 'success');
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
    title: category ? 'Sửa danh mục' : 'Thêm danh mục',
    body: form,
    actions: [
      { label: 'Hủy', variant: 'secondary' },
      { label: 'Lưu', variant: 'primary', onClick: submit },
    ],
  });
  form.elements.name.focus();
}

// ---------- Delete ----------

async function handleDelete(category, button) {
  const videoCount = getVideoCount(category);
  const message = videoCount > 0
    ? `Danh mục đang có ${videoCount} video. Các video này sẽ không còn danh mục. Hành động này không thể hoàn tác.`
    : 'Hành động này không thể hoàn tác.';
  const confirmed = await confirmModal({ title: 'Xóa danh mục?', message });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await deleteCategory(category.id);
    showToast('Đã xóa danh mục.', 'success');
    await table.load();
  } catch {
    button.disabled = false;
    showToast('Không thể xóa danh mục. Vui lòng thử lại.', 'error');
  }
}

// ---------- Render ----------

function createActionsCell(category) {
  const cell = createElement('td');
  const wrapper = createElement('div', 'table-actions');

  const editButton = createElement('button', 'btn btn-secondary btn-sm', 'Sửa');
  editButton.type = 'button';
  editButton.addEventListener('click', () => openCategoryModal(category));

  const deleteButton = createElement('button', 'btn btn-danger btn-sm', 'Xóa');
  deleteButton.type = 'button';
  deleteButton.addEventListener('click', () => handleDelete(category, deleteButton));

  wrapper.append(editButton, deleteButton);
  cell.appendChild(wrapper);
  return cell;
}

function createCategoryRow(category) {
  const row = document.createElement('tr');
  row.append(
    createElement('td', 'text-secondary', String(category.id)),
    createElement('td', 'cell-title', category.name),
    createElement('td', 'cell-id', category.slug),
    createElement('td', 'cell-description text-secondary', category.description || '—'),
    createElement('td', 'text-right', formatNumber(getVideoCount(category))),
    createElement('td', 'text-secondary', formatDate(category.created_at)),
    createActionsCell(category),
  );
  return row;
}

function getEmptyState() {
  if (filters.search) return { message: 'Không tìm thấy danh mục phù hợp.' };
  return { message: 'Chưa có danh mục nào.', actionLabel: 'Thêm danh mục', onAction: () => openCategoryModal() };
}

// ---------- Init ----------

async function initCategoriesPage() {
  const profile = await initLayout('Danh mục video');
  if (!profile) return;

  elements.searchInput = document.getElementById('search-input');
  table = createPagedTable({
    tbody: document.getElementById('categories-body'),
    paginationContainer: document.getElementById('pagination'),
    columnCount: COLUMN_COUNT,
    fetchPage: fetchCategories,
    renderRow: createCategoryRow,
    getEmptyState,
  });

  document.getElementById('add-category').addEventListener('click', () => openCategoryModal());
  elements.searchInput.addEventListener('input', debounce(() => {
    filters.search = elements.searchInput.value.trim();
    table.loadFirstPage();
  }, 350));

  await table.load();
}

initCategoriesPage();
