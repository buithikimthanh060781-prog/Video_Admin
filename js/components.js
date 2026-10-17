// Reusable components: Toast, Modal, Pagination, Table states
import { createElement } from './utils.js?v=202610172049';
import { createIcon } from './icons.js?v=202610172049';

// ---------- Toast ----------

function getToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = createElement('div', 'toast-container');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

// type: 'success' | 'error' | 'warning' | 'info'
export function showToast(message, type = 'info', duration = 3000) {
  const toast = createElement('div', `toast toast-${type}`, message);
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  getToastContainer().appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Toast hiển thị ở trang kế tiếp (sau redirect)
const FLASH_KEY = 'flash-toast';

export function setFlashToast(message, type = 'success', duration = 3000) {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, type, duration }));
  } catch {
    // sessionStorage không khả dụng: bỏ qua
  }
}

export function showFlashToast() {
  try {
    const flash = JSON.parse(sessionStorage.getItem(FLASH_KEY));
    sessionStorage.removeItem(FLASH_KEY);
    if (flash?.message) showToast(flash.message, flash.type, flash.duration);
  } catch {
    // dữ liệu hỏng hoặc không đọc được: bỏ qua
  }
}

// ---------- Modal ----------

function createModalCloseButton() {
  const button = createElement('button', 'icon-button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Đóng');
  button.appendChild(createIcon('close', 18));
  return button;
}

function createModalBody(body) {
  const content = createElement('div', 'modal-body');
  if (body instanceof Node) content.appendChild(body);
  else if (body) content.appendChild(createElement('p', 'modal-text', body));
  return content;
}

// onClick của action trả về false để giữ modal mở.
function createModalActionButton(action, close) {
  const button = createElement('button', `btn btn-${action.variant || 'secondary'}`, action.label);
  button.type = 'button';
  button.addEventListener('click', async () => {
    const result = await action.onClick?.();
    if (result !== false) close();
  });
  return button;
}

function createModalElements({ title, body, size }) {
  const backdrop = createElement('div', 'modal-backdrop');
  const dialog = createElement('div', size === 'lg' ? 'modal modal-lg' : 'modal');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const closeButton = createModalCloseButton();
  const header = createElement('div', 'modal-header');
  header.append(createElement('h2', 'modal-title', title || ''), closeButton);
  const footer = createElement('div', 'modal-footer');

  dialog.append(header, createModalBody(body), footer);
  backdrop.appendChild(dialog);
  return { backdrop, dialog, closeButton, footer };
}

// body: Node hoặc string. size: 'lg' cho modal rộng. actions: [{ label, variant, onClick }]
export function openModal({ title, body, size, actions = [], onClose } = {}) {
  const { backdrop, dialog, closeButton, footer } = createModalElements({ title, body, size });
  const previousFocus = document.activeElement;

  function close() {
    document.removeEventListener('keydown', handleKeydown);
    backdrop.remove();
    previousFocus?.focus?.();
    onClose?.();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') close();
  }

  footer.append(...actions.map((action) => createModalActionButton(action, close)));
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', handleKeydown);
  document.body.appendChild(backdrop);
  (footer.lastElementChild || closeButton).focus();

  return { element: dialog, close };
}

// Trả về Promise<boolean>
export function confirmModal({
  title = 'Xác nhận xóa?',
  message = 'Hành động này không thể hoàn tác.',
  confirmText = 'Xóa',
  cancelText = 'Hủy',
  variant = 'danger',
} = {}) {
  return new Promise((resolve) => {
    let confirmed = false;
    openModal({
      title,
      body: message,
      actions: [
        { label: cancelText, variant: 'secondary' },
        { label: confirmText, variant, onClick: () => { confirmed = true; } },
      ],
      onClose: () => resolve(confirmed),
    });
  });
}

// ---------- Pagination ----------

function getVisiblePages(currentPage, totalPages) {
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
}

function createPageButton(label, page, { disabled = false, active = false, onPageChange }) {
  const button = createElement('button', 'page-button', label);
  button.type = 'button';
  button.disabled = disabled;
  if (active) {
    button.classList.add('active');
    button.setAttribute('aria-current', 'page');
  }
  button.addEventListener('click', () => onPageChange(page));
  return button;
}

function createPageSizeSelect(pageSize, pageSizeOptions, onPageSizeChange) {
  const label = createElement('label', 'page-size');
  const select = document.createElement('select');
  pageSizeOptions.forEach((size) => {
    const option = createElement('option', '', String(size));
    option.value = size;
    option.selected = size === pageSize;
    select.appendChild(option);
  });
  select.addEventListener('change', () => onPageSizeChange(Number(select.value)));
  label.append(select, document.createTextNode(' / trang'));
  return label;
}

export function renderPagination(container, {
  page,
  pageSize,
  total,
  pageSizeOptions = [10, 20, 50],
  onPageChange,
  onPageSizeChange,
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const summary = createElement('div', 'pagination-summary', `Hiển thị ${from}–${to} / ${total}`);
  const controls = createElement('div', 'pagination-controls');

  if (onPageSizeChange) controls.appendChild(createPageSizeSelect(pageSize, pageSizeOptions, onPageSizeChange));

  controls.appendChild(createPageButton('‹', page - 1, { disabled: page <= 1, onPageChange }));
  let previousPage = 0;
  getVisiblePages(page, totalPages).forEach((pageNumber) => {
    if (pageNumber - previousPage > 1) controls.appendChild(createElement('span', 'page-ellipsis', '…'));
    controls.appendChild(createPageButton(String(pageNumber), pageNumber, { active: pageNumber === page, onPageChange }));
    previousPage = pageNumber;
  });
  controls.appendChild(createPageButton('›', page + 1, { disabled: page >= totalPages, onPageChange }));

  container.className = 'pagination';
  container.replaceChildren(summary, controls);
}

// ---------- Table states ----------

const DEFAULT_STATE_MESSAGES = {
  loading: 'Đang tải dữ liệu...',
  empty: 'Không có dữ liệu.',
  error: 'Không thể tải dữ liệu. Vui lòng thử lại.',
};

// Hiển thị loading / empty / error trong vùng chứa bất kỳ (div, card...)
export function createStateView(type, { message, actionLabel, onAction } = {}) {
  const view = createElement('div', `state-view state-${type}`);
  if (type === 'loading') view.appendChild(createElement('span', 'spinner'));
  view.appendChild(createElement('p', 'state-message', message || DEFAULT_STATE_MESSAGES[type]));
  if (actionLabel && onAction) {
    const button = createElement('button', type === 'error' ? 'btn btn-secondary' : 'btn btn-primary', actionLabel);
    button.type = 'button';
    button.addEventListener('click', onAction);
    view.appendChild(button);
  }
  return view;
}

// Hiển thị state trong <tbody> chiếm toàn bộ số cột
export function renderTableState(tbody, colspan, type, options = {}) {
  const row = document.createElement('tr');
  row.className = 'table-state-row';
  const cell = document.createElement('td');
  cell.colSpan = colspan;
  cell.appendChild(createStateView(type, options));
  row.appendChild(cell);
  tbody.replaceChildren(row);
}

// Badge cho role / status
export function createBadge(text, variant = 'default') {
  return createElement('span', `badge badge-${variant}`, text);
}

// ---------- Paged list / table ----------

// Danh sách có phân trang + loading/empty/error + chống response cũ ghi đè response mới.
// fetchPage({ page, pageSize }) => Promise<{ rows, total }>
// renderItem(row) => Node; renderState(type, options) vẽ loading/empty/error vào container.
// getEmptyState() => options cho trạng thái trống (message, actionLabel, onAction).
export function createPagedList({
  container,
  paginationContainer,
  fetchPage,
  renderItem,
  renderState,
  getEmptyState,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50],
}) {
  const state = { page: 1, pageSize };
  let latestRequestId = 0;

  function renderPaginationBar(total) {
    renderPagination(paginationContainer, {
      page: state.page,
      pageSize: state.pageSize,
      pageSizeOptions,
      total,
      onPageChange: (page) => {
        state.page = page;
        load();
      },
      onPageSizeChange: (newPageSize) => {
        state.pageSize = newPageSize;
        state.page = 1;
        load();
      },
    });
  }

  function renderItems(rows) {
    if (rows.length === 0) renderState('empty', getEmptyState?.());
    else container.replaceChildren(...rows.map(renderItem));
  }

  async function load() {
    const requestId = ++latestRequestId;
    renderState('loading');
    try {
      const { rows, total } = await fetchPage({ page: state.page, pageSize: state.pageSize });
      if (requestId !== latestRequestId) return;
      const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
      if (state.page > totalPages) {
        state.page = totalPages;
        await load();
        return;
      }
      renderItems(rows);
      renderPaginationBar(total);
    } catch {
      if (requestId !== latestRequestId) return;
      paginationContainer.replaceChildren();
      renderState('error', { actionLabel: 'Thử lại', onAction: load });
    }
  }

  function loadFirstPage() {
    state.page = 1;
    return load();
  }

  return { load, loadFirstPage };
}

// Bảng: trạng thái loading/empty/error hiển thị thành 1 dòng chiếm toàn bộ số cột
export function createPagedTable({ tbody, columnCount, renderRow, ...options }) {
  return createPagedList({
    ...options,
    container: tbody,
    renderItem: renderRow,
    renderState: (type, stateOptions) => renderTableState(tbody, columnCount, type, stateOptions),
  });
}
