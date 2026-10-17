// Chuông thông báo trong header: số chưa đọc + danh sách thông báo mới nhất
// Thông báo do database tạo (trigger khi ADMIN kích hoạt / từ chối / thu hồi đăng ký học).
import { supabase } from './supabase.js?v=202610171935';
import { createStateView, showToast } from './components.js?v=202610171935';
import { createIcon } from './icons.js?v=202610171935';
import { createElement, formatDate } from './utils.js?v=202610171935';

const LIST_LIMIT = 10;
const SAFE_LINK = /^[a-z0-9-]+\.html(\?[A-Za-z0-9=&_%.-]*)?$/;
const SESSION_TOAST_KEY = 'notifications-toast-shown';

const TYPE_ICONS = {
  ENROLLMENT_ACTIVE: { icon: 'check', variant: 'success' },
  ENROLLMENT_REJECTED: { icon: 'close', variant: 'danger' },
  ENROLLMENT_REVOKED: { icon: 'close', variant: 'default' },
};

// ---------- Data ----------

async function fetchUnreadCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

async function fetchLatest(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, message, link, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return data;
}

async function markAllRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}

async function markRead(id) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// Hiện toast 1 lần mỗi phiên trình duyệt khi có thông báo chưa đọc
function showSessionToast(count) {
  try {
    if (count === 0 || sessionStorage.getItem(SESSION_TOAST_KEY)) return;
    sessionStorage.setItem(SESSION_TOAST_KEY, '1');
  } catch {
    return;
  }
  showToast(`Bạn có ${count} thông báo mới. Bấm vào chuông để xem.`, 'info', 4500);
}

// ---------- Render ----------

function createItem(notification, onOpen) {
  const isUnread = !notification.read_at;
  const hasLink = SAFE_LINK.test(notification.link || '');
  const item = createElement('li');
  const entry = createElement(hasLink ? 'a' : 'div', isUnread ? 'notify-item is-unread' : 'notify-item');
  if (hasLink) entry.href = notification.link;

  const type = TYPE_ICONS[notification.type] || { icon: 'bell', variant: 'default' };
  const icon = createElement('span', `notify-icon notify-icon-${type.variant}`);
  icon.appendChild(createIcon(type.icon, 16));

  const content = createElement('div', 'notify-content');
  content.append(createElement('strong', 'notify-title', notification.title));
  if (notification.message) content.appendChild(createElement('span', 'notify-message', notification.message));
  content.appendChild(createElement('small', 'notify-date', formatDate(notification.created_at)));

  entry.append(icon, content);
  entry.addEventListener('click', (event) => onOpen(event, notification, hasLink));
  item.appendChild(entry);
  return item;
}

// Trả về element chuông. profile: người đang đăng nhập.
export function createNotificationBell(profile) {
  const wrapper = createElement('div', 'notify-menu');

  const button = createElement('button', 'icon-button notify-button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Thông báo');
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  const badge = createElement('span', 'notify-badge');
  badge.hidden = true;
  button.append(createIcon('bell'), badge);

  const panel = createElement('div', 'notify-dropdown');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Thông báo');
  const markAllButton = createElement('button', 'notify-mark-all', 'Đánh dấu đã đọc');
  markAllButton.type = 'button';
  const head = createElement('div', 'notify-head');
  head.append(createElement('strong', '', 'Thông báo'), markAllButton);
  const list = createElement('ul', 'notify-list');
  panel.append(head, list);
  wrapper.append(button, panel);

  function renderBadge(count) {
    badge.hidden = count === 0;
    badge.textContent = count > 9 ? '9+' : String(count);
    button.setAttribute('aria-label', count > 0 ? `Thông báo: ${count} chưa đọc` : 'Thông báo');
    markAllButton.disabled = count === 0;
  }

  async function refreshCount() {
    try {
      const count = await fetchUnreadCount(profile.id);
      renderBadge(count);
      return count;
    } catch {
      return 0;
    }
  }

  async function openItem(event, notification, hasLink) {
    if (notification.read_at) return;
    if (hasLink) event.preventDefault();
    try {
      await markRead(notification.id);
    } catch {
      // vẫn mở link dù chưa đánh dấu được
    }
    if (hasLink) location.href = notification.link;
    else loadList();
  }

  async function loadList() {
    list.replaceChildren(createStateView('loading'));
    try {
      const items = await fetchLatest(profile.id);
      if (items.length === 0) {
        list.replaceChildren(createStateView('empty', { message: 'Bạn chưa có thông báo nào.' }));
      } else {
        list.replaceChildren(...items.map((item) => createItem(item, openItem)));
      }
      await refreshCount();
    } catch {
      list.replaceChildren(createStateView('error', { actionLabel: 'Thử lại', onAction: loadList }));
    }
  }

  function setOpen(isOpen) {
    panel.hidden = !isOpen;
    button.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) loadList();
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(panel.hidden);
  });
  markAllButton.addEventListener('click', async () => {
    markAllButton.disabled = true;
    try {
      await markAllRead(profile.id);
      await loadList();
    } catch {
      showToast('Không thể cập nhật thông báo. Vui lòng thử lại.', 'error');
      markAllButton.disabled = false;
    }
  });
  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  refreshCount().then(showSessionToast);
  return wrapper;
}
