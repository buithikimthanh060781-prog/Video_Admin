// users module: danh sách users, tìm kiếm, lọc, xem chi tiết (chỉ ADMIN)
import { supabase } from './supabase.js';
import { initLayout, createAvatar } from './layout.js';
import { createBadge, createPagedTable, openModal } from './components.js';
import { createElement, debounce, escapeLikePattern, formatDate } from './utils.js';

const COLUMN_COUNT = 8;
const ROLE_BADGES = { ADMIN: 'primary', USER: 'default' };
const STATUS_BADGES = { ACTIVE: 'success', INACTIVE: 'danger' };

// Chỉ lấy các cột hiển thị. profiles không chứa password/token.
const USER_COLUMNS = 'id, username, email, full_name, avatar_url, role, status, created_at';

const filters = {
  search: '',
  role: '',
  status: '',
};

const elements = {};
let table = null;

// ---------- Data ----------

// Giá trị trong bộ lọc or() của PostgREST: LIKE-escape rồi bọc trong dấu nháy kép (escape \ và ")
function buildOrSearchValue(text) {
  const escaped = escapeLikePattern(text).replace(/["\\]/g, (char) => `\\${char}`);
  return `"%${escaped}%"`;
}

async function fetchUsers({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  let query = supabase
    .from('profiles')
    .select(USER_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (filters.search) {
    const value = buildOrSearchValue(filters.search);
    query = query.or(`username.ilike.${value},email.ilike.${value}`);
  }
  if (filters.role) query = query.eq('role', filters.role);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

// ---------- Render ----------

function createBadgeCell(text, variants) {
  const cell = createElement('td');
  cell.appendChild(createBadge(text, variants[text] || 'default'));
  return cell;
}

function createIdCell(id) {
  const cell = createElement('td', 'text-secondary cell-id', `${id.slice(0, 8)}…`);
  cell.title = id;
  return cell;
}

function createAvatarCell(user) {
  const cell = createElement('td');
  cell.appendChild(createAvatar(user, 'avatar'));
  return cell;
}

function createActionsCell(user) {
  const cell = createElement('td');
  const button = createElement('button', 'btn btn-secondary btn-sm', 'View');
  button.type = 'button';
  button.addEventListener('click', () => showUserDetail(user));
  cell.appendChild(button);
  return cell;
}

function createUserRow(user) {
  const row = document.createElement('tr');
  row.append(
    createIdCell(user.id),
    createAvatarCell(user),
    createElement('td', 'cell-title', user.username),
    createElement('td', '', user.email),
    createBadgeCell(user.role, ROLE_BADGES),
    createElement('td', 'text-secondary', formatDate(user.created_at)),
    createBadgeCell(user.status, STATUS_BADGES),
    createActionsCell(user),
  );
  return row;
}

function getEmptyState() {
  const hasFilters = Boolean(filters.search || filters.role || filters.status);
  return { message: hasFilters ? 'Không tìm thấy user phù hợp.' : 'Chưa có user nào.' };
}

// ---------- User detail ----------

function createDetailItem(label, valueNode) {
  const value = typeof valueNode === 'string' ? document.createTextNode(valueNode) : valueNode;
  const dd = createElement('dd');
  dd.appendChild(value);
  return [createElement('dt', '', label), dd];
}

// Chỉ hiển thị thông tin hồ sơ. Không hiển thị password, auth token hoặc session token.
function showUserDetail(user) {
  const body = createElement('div', 'user-detail');

  const header = createElement('div', 'user-detail-header');
  const titleBox = createElement('div');
  titleBox.append(
    createElement('div', 'user-detail-name', user.username),
    createElement('div', 'text-secondary', user.full_name || ''),
  );
  header.append(createAvatar(user, 'avatar avatar-lg'), titleBox);

  const list = createElement('dl', 'info-list');
  list.append(
    ...createDetailItem('Username', user.username),
    ...createDetailItem('Email', user.email),
    ...createDetailItem('Role', createBadge(user.role, ROLE_BADGES[user.role] || 'default')),
    ...createDetailItem('Status', createBadge(user.status, STATUS_BADGES[user.status] || 'default')),
    ...createDetailItem('Created date', formatDate(user.created_at)),
  );

  const note = createElement('p', 'form-hint user-detail-note', 'Password được quản lý bởi Supabase Auth và không hiển thị tại đây.');
  body.append(header, list, note);

  openModal({
    title: 'User detail',
    body,
    actions: [{ label: 'Close', variant: 'secondary' }],
  });
}

// ---------- Filters ----------

function initFilters() {
  elements.searchInput.addEventListener('input', debounce(() => {
    filters.search = elements.searchInput.value.trim();
    table.loadFirstPage();
  }, 350));
  elements.roleFilter.addEventListener('change', () => {
    filters.role = elements.roleFilter.value;
    table.loadFirstPage();
  });
  elements.statusFilter.addEventListener('change', () => {
    filters.status = elements.statusFilter.value;
    table.loadFirstPage();
  });
}

// ---------- Init ----------

async function initUsersPage() {
  const profile = await initLayout('Users');
  if (!profile) return;

  elements.searchInput = document.getElementById('search-input');
  elements.roleFilter = document.getElementById('role-filter');
  elements.statusFilter = document.getElementById('status-filter');

  table = createPagedTable({
    tbody: document.getElementById('users-body'),
    paginationContainer: document.getElementById('pagination'),
    columnCount: COLUMN_COUNT,
    fetchPage: fetchUsers,
    renderRow: createUserRow,
    getEmptyState,
  });

  initFilters();
  await table.load();
}

initUsersPage();
