// Quản lý thành viên: danh sách, tìm kiếm, lọc, xem chi tiết, kích hoạt / ngừng kích hoạt (chỉ ADMIN)
// Thành viên mới đăng ký ở trạng thái PENDING, cần ADMIN kích hoạt mới đăng nhập và đăng ký học được.
import { supabase } from './supabase.js?v=202610172049';
import { MEMBER_STATUSES, ROLE_LABELS } from './auth.js?v=202610172049';
import { initLayout, createAvatar, refreshPendingBadge } from './layout.js?v=202610172049';
import { confirmModal, createBadge, createPagedTable, openModal, showToast } from './components.js?v=202610172049';
import { createElement, debounce, escapeLikePattern, formatDate } from './utils.js?v=202610172049';

const COLUMN_COUNT = 9;
const STATUS_PENDING = 'PENDING';
const STATUS_ACTIVE = 'ACTIVE';
const STATUS_INACTIVE = 'INACTIVE';

// Chỉ lấy các cột hiển thị. profiles không chứa password/token.
const USER_COLUMNS = 'id, username, email, phone, full_name, avatar_url, role, status, created_at';
const USER_COLUMNS_WITHOUT_PHONE = 'id, username, email, full_name, avatar_url, role, status, created_at';
const UNDEFINED_COLUMN = '42703';
// false khi database chưa có cột profiles.phone (chưa chạy 15_member_phone.sql): vẫn hiện danh sách, không có số điện thoại
let hasPhoneColumn = true;

const urlStatus = new URLSearchParams(location.search).get('status');
const filters = {
  search: '',
  role: '',
  status: MEMBER_STATUSES[urlStatus] ? urlStatus : '',
};

const elements = {};
let table = null;
let currentAdminId = null;

// Nút đổi trạng thái + hộp xác nhận theo trạng thái đích
const STATUS_ACTIONS = {
  [STATUS_ACTIVE]: {
    label: 'Kích hoạt',
    variant: 'primary',
    title: 'Kích hoạt thành viên?',
    message: (user) => `Tài khoản "${user.username}" sẽ đăng nhập được và đăng ký học được.`,
    success: 'Đã kích hoạt thành viên.',
  },
  [STATUS_INACTIVE]: {
    label: 'Ngừng kích hoạt',
    variant: 'danger',
    title: 'Ngừng kích hoạt thành viên?',
    message: (user) => `Tài khoản "${user.username}" sẽ bị đăng xuất và không đăng nhập được cho đến khi được kích hoạt lại. Dữ liệu học tập vẫn được giữ nguyên.`,
    success: 'Đã ngừng kích hoạt thành viên.',
  },
};

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
    .select(hasPhoneColumn ? USER_COLUMNS : USER_COLUMNS_WITHOUT_PHONE, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (filters.search) {
    const value = buildOrSearchValue(filters.search);
    const phoneSearch = hasPhoneColumn ? `,phone.ilike.${value}` : '';
    query = query.or(`username.ilike.${value},email.ilike.${value}${phoneSearch}`);
  }
  if (filters.role) query = query.eq('role', filters.role);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error, count } = await query;
  if (error?.code === UNDEFINED_COLUMN && hasPhoneColumn) {
    hasPhoneColumn = false;
    return fetchUsers({ page, pageSize });
  }
  if (error) throw error;
  return { rows: data, total: count ?? 0 };
}

async function countPendingMembers() {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('status', STATUS_PENDING);
  if (error) throw error;
  return count ?? 0;
}

// RLS (profiles_update_admin) + trigger prevent_role_change: chỉ ADMIN đổi được, không tự đổi chính mình
async function updateUserStatus(id, status) {
  const { data, error } = await supabase.from('profiles').update({ status }).eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('not updated');
}

// ---------- Status actions ----------

// Trạng thái đích của nút thao tác: đang hoạt động -> ngừng; chờ kích hoạt / đã ngừng -> kích hoạt
function getNextStatus(user) {
  return user.status === STATUS_ACTIVE ? STATUS_INACTIVE : STATUS_ACTIVE;
}

async function changeStatus(user, nextStatus, button) {
  const action = STATUS_ACTIONS[nextStatus];
  const confirmed = await confirmModal({
    title: action.title,
    message: action.message(user),
    confirmText: action.label,
    cancelText: 'Hủy',
    variant: action.variant,
  });
  if (!confirmed) return false;

  if (button) button.disabled = true;
  try {
    await updateUserStatus(user.id, nextStatus);
    showToast(action.success, 'success');
    await Promise.all([table.load(), renderPendingNote(), refreshPendingBadge()]);
    return true;
  } catch {
    if (button) button.disabled = false;
    showToast('Không thể cập nhật trạng thái thành viên. Vui lòng thử lại.', 'error');
    return false;
  }
}

function createStatusButton(user) {
  const nextStatus = getNextStatus(user);
  const action = STATUS_ACTIONS[nextStatus];
  const variant = nextStatus === STATUS_ACTIVE ? 'btn-primary' : 'btn-secondary';
  const button = createElement('button', `btn ${variant} btn-sm`, action.label);
  button.type = 'button';
  button.addEventListener('click', () => changeStatus(user, nextStatus, button));
  return button;
}

// ---------- Render ----------

function getRole(user) {
  return ROLE_LABELS[user.role] || { label: user.role, badge: 'default' };
}

function getStatus(user) {
  return MEMBER_STATUSES[user.status] || { label: user.status, badge: 'default' };
}

function createBadgeCell({ label, badge }) {
  const cell = createElement('td');
  cell.appendChild(createBadge(label, badge));
  return cell;
}

function createIdCell(id) {
  const cell = createElement('td', 'text-secondary cell-id', `${id.slice(0, 8)}…`);
  cell.title = id;
  return cell;
}

// Số điện thoại bấm được để gọi (trên điện thoại); tài khoản cũ chưa có số thì hiện "—"
function createPhoneLink(phone) {
  const link = createElement('a', 'cell-phone', phone);
  link.href = `tel:${phone.replace(/[^0-9+]/g, '')}`;
  return link;
}

function createPhoneCell(phone) {
  const cell = createElement('td', phone ? '' : 'text-secondary');
  if (phone) cell.appendChild(createPhoneLink(phone));
  else cell.textContent = '—';
  return cell;
}

function createAvatarCell(user) {
  const cell = createElement('td');
  cell.appendChild(createAvatar(user, 'avatar'));
  return cell;
}

function createActionsCell(user) {
  const cell = createElement('td');
  const wrapper = createElement('div', 'table-actions');
  const viewButton = createElement('button', 'btn btn-secondary btn-sm', 'Xem');
  viewButton.type = 'button';
  viewButton.addEventListener('click', () => showUserDetail(user));
  wrapper.appendChild(viewButton);

  // Không tự ngừng kích hoạt chính mình (database cũng chặn)
  if (user.id === currentAdminId) wrapper.appendChild(createElement('span', 'text-secondary cell-note', 'Tài khoản của bạn'));
  else wrapper.appendChild(createStatusButton(user));

  cell.appendChild(wrapper);
  return cell;
}

function createUserRow(user) {
  const row = document.createElement('tr');
  if (user.status === STATUS_PENDING) row.classList.add('row-pending');
  row.append(
    createIdCell(user.id),
    createAvatarCell(user),
    createElement('td', 'cell-title', user.username),
    createElement('td', '', user.email),
    createPhoneCell(user.phone),
    createBadgeCell(getRole(user)),
    createElement('td', 'text-secondary', formatDate(user.created_at)),
    createBadgeCell(getStatus(user)),
    createActionsCell(user),
  );
  return row;
}

function getEmptyState() {
  if (filters.status === STATUS_PENDING && !filters.search && !filters.role) {
    return { message: 'Không có thành viên nào đang chờ kích hoạt.' };
  }
  const hasFilters = Boolean(filters.search || filters.role || filters.status);
  return { message: hasFilters ? 'Không tìm thấy thành viên phù hợp.' : 'Chưa có thành viên nào.' };
}

// Thông báo "Có N thành viên đang chờ kích hoạt" + nút lọc nhanh
async function renderPendingNote() {
  const note = elements.pendingNote;
  const count = await countPendingMembers().catch(() => 0);
  if (count === 0 || filters.status === STATUS_PENDING) {
    note.hidden = true;
    return;
  }
  const button = createElement('button', 'btn btn-primary btn-sm', 'Xem danh sách chờ');
  button.type = 'button';
  button.addEventListener('click', () => setStatusFilter(STATUS_PENDING));
  note.replaceChildren(createElement('span', '', `Có ${count} thành viên mới đang chờ kích hoạt.`), button);
  note.hidden = false;
}

// ---------- User detail ----------

function createDetailItem(label, valueNode) {
  const value = typeof valueNode === 'string' ? document.createTextNode(valueNode) : valueNode;
  const dd = createElement('dd');
  dd.appendChild(value);
  return [createElement('dt', '', label), dd];
}

// Chỉ hiển thị thông tin hồ sơ. Không hiển thị mật khẩu hoặc mã phiên đăng nhập.
function showUserDetail(user) {
  const body = createElement('div', 'user-detail');

  const header = createElement('div', 'user-detail-header');
  const titleBox = createElement('div');
  titleBox.append(
    createElement('div', 'user-detail-name', user.username),
    createElement('div', 'text-secondary', user.full_name || ''),
  );
  header.append(createAvatar(user, 'avatar avatar-lg'), titleBox);

  const role = getRole(user);
  const status = getStatus(user);
  const list = createElement('dl', 'info-list');
  list.append(
    ...createDetailItem('Tên đăng nhập', user.username),
    ...createDetailItem('Email', user.email),
    ...createDetailItem('Số điện thoại', user.phone ? createPhoneLink(user.phone) : 'Chưa có'),
    ...createDetailItem('Vai trò', createBadge(role.label, role.badge)),
    ...createDetailItem('Trạng thái', createBadge(status.label, status.badge)),
    ...createDetailItem('Ngày đăng ký', formatDate(user.created_at)),
  );

  const note = createElement('p', 'form-hint user-detail-note', 'Mật khẩu được Supabase Auth quản lý và không hiển thị tại đây.');
  body.append(header, list, note);

  const actions = [{ label: 'Đóng', variant: 'secondary' }];
  if (user.id !== currentAdminId) {
    const nextStatus = getNextStatus(user);
    const action = STATUS_ACTIONS[nextStatus];
    actions.push({
      label: action.label,
      variant: nextStatus === STATUS_ACTIVE ? 'primary' : 'danger',
      // Đóng chi tiết trước, rồi mới hỏi xác nhận
      onClick: () => { setTimeout(() => changeStatus(user, nextStatus), 0); },
    });
  }
  openModal({ title: 'Thông tin thành viên', body, actions });
}

// ---------- Filters ----------

function setStatusFilter(status) {
  filters.status = status;
  elements.statusFilter.value = status;
  table.loadFirstPage();
  renderPendingNote();
}

function initFilters() {
  elements.statusFilter.value = filters.status;
  elements.searchInput.addEventListener('input', debounce(() => {
    filters.search = elements.searchInput.value.trim();
    table.loadFirstPage();
  }, 350));
  elements.roleFilter.addEventListener('change', () => {
    filters.role = elements.roleFilter.value;
    table.loadFirstPage();
  });
  elements.statusFilter.addEventListener('change', () => setStatusFilter(elements.statusFilter.value));
}

// ---------- Init ----------

async function initUsersPage() {
  const profile = await initLayout('Quản lý thành viên');
  if (!profile) return;
  currentAdminId = profile.id;

  elements.searchInput = document.getElementById('search-input');
  elements.roleFilter = document.getElementById('role-filter');
  elements.statusFilter = document.getElementById('status-filter');
  elements.pendingNote = document.getElementById('pending-members-note');

  table = createPagedTable({
    tbody: document.getElementById('users-body'),
    paginationContainer: document.getElementById('pagination'),
    columnCount: COLUMN_COUNT,
    fetchPage: fetchUsers,
    renderRow: createUserRow,
    getEmptyState,
  });

  initFilters();
  await Promise.all([table.load(), renderPendingNote()]);
}

initUsersPage();
