// Layout dùng chung: Sidebar + Header + User menu + Mobile menu
import { supabase } from './supabase.js?v=202610171935';
import { requireAuth, isAdmin, signOut, getHomePage } from './auth.js?v=202610171935';
import { createIcon } from './icons.js?v=202610171935';
import { createNotificationBell } from './notifications.js?v=202610171935';
import { createElement, debounce, getInitials } from './utils.js?v=202610171935';

const ENROLLMENTS_PAGE = 'enrollments.html';
const USERS_PAGE = 'users.html';
const ACCOUNT_PAGE = 'account.html';

// Menu chia theo nhóm quản lý. title rỗng = không hiện tiêu đề nhóm.
const MENU_GROUPS = [
  {
    title: '',
    adminOnly: true,
    items: [{ href: 'index.html', label: 'Tổng quan', icon: 'dashboard' }],
  },
  {
    title: 'Quản lý khóa học',
    adminOnly: true,
    items: [
      { href: 'courses.html', label: 'Khóa học', icon: 'course', activeFor: ['course-edit.html'] },
      { href: 'course-categories.html', label: 'Lĩnh vực khóa học', icon: 'layers' },
      { href: ENROLLMENTS_PAGE, label: 'Duyệt đăng ký học', icon: 'inbox' },
    ],
  },
  {
    title: 'Quản lý video',
    adminOnly: true,
    items: [
      { href: 'videos.html', label: 'Video', icon: 'video', activeFor: ['video-edit.html'] },
      { href: 'categories.html', label: 'Danh mục video', icon: 'category' },
    ],
  },
  {
    title: 'Quản lý thành viên',
    adminOnly: true,
    items: [{ href: USERS_PAGE, label: 'Thành viên', icon: 'users' }],
  },
  {
    title: 'Học tập',
    adminOnly: false,
    items: [
      { href: 'explore.html', label: 'Khám phá khóa học', icon: 'compass', activeFor: ['explore-detail.html'] },
      { href: 'my-courses.html', label: 'Khóa học của tôi', icon: 'graduation', activeFor: ['learn.html'] },
      { href: 'library.html', label: 'Thư viện video', icon: 'play', activeFor: ['watch.html'] },
    ],
  },
];

function getCurrentPage() {
  return location.pathname.split('/').pop() || 'index.html';
}

// ---------- Sidebar ----------

function createMenuLink(item, currentPage) {
  const link = createElement('a', 'sidebar-link');
  link.href = item.href;
  link.title = item.label;
  link.append(createIcon(item.icon), createElement('span', 'sidebar-label', item.label));
  if (item.href === currentPage || item.activeFor?.includes(currentPage)) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function createLogoutButton() {
  const button = createElement('button', 'sidebar-link sidebar-logout');
  button.type = 'button';
  button.title = 'Đăng xuất';
  button.append(createIcon('logout'), createElement('span', 'sidebar-label', 'Đăng xuất'));
  button.addEventListener('click', signOut);
  return button;
}

function createMenuGroup(group, currentPage, index) {
  const section = createElement('div', 'sidebar-group');
  if (group.title) {
    const heading = createElement('p', 'sidebar-group-title sidebar-label', group.title);
    heading.id = `sidebar-group-${index}`;
    section.setAttribute('role', 'group');
    section.setAttribute('aria-labelledby', heading.id);
    section.appendChild(heading);
  }
  section.append(...group.items.map((item) => createMenuLink(item, currentPage)));
  return section;
}

export function renderSidebar(profile) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const currentPage = getCurrentPage();

  const logo = createElement('a', 'sidebar-logo');
  logo.href = getHomePage(profile);
  logo.append(createIcon('zap', 20), createElement('span', 'sidebar-label', 'Học Vèo'));

  const nav = createElement('nav', 'sidebar-nav');
  nav.setAttribute('aria-label', 'Menu chính');
  MENU_GROUPS
    .filter((group) => !group.adminOnly || isAdmin(profile))
    .forEach((group, index) => nav.appendChild(createMenuGroup(group, currentPage, index)));

  const bottom = createElement('div', 'sidebar-bottom');
  bottom.append(createMenuLink({ href: ACCOUNT_PAGE, label: 'Tài khoản', icon: 'account' }, currentPage), createLogoutButton());

  sidebar.replaceChildren(logo, nav, bottom);
}

function setSidebarBadge(href, count, ariaLabel) {
  const link = document.querySelector(`.sidebar-link[href="${href}"]`);
  if (!link) return;
  link.querySelector('.sidebar-badge')?.remove();
  if (!count) return;
  const badge = createElement('span', 'sidebar-badge', count > 99 ? '99+' : String(count));
  badge.setAttribute('aria-label', ariaLabel(count));
  link.appendChild(badge);
}

async function countRows(table, status) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('status', status);
  if (error) throw error;
  return count ?? 0;
}

// Số việc đang chờ ADMIN xử lý, hiện cạnh menu: yêu cầu đăng ký học + thành viên chờ kích hoạt. Lỗi thì không hiện.
export async function refreshPendingBadge() {
  if (!document.querySelector(`.sidebar-link[href="${ENROLLMENTS_PAGE}"]`)) return;
  const [enrollments, members] = await Promise.allSettled([
    countRows('course_enrollments', 'PENDING'),
    countRows('profiles', 'PENDING'),
  ]);
  if (enrollments.status === 'fulfilled') setSidebarBadge(ENROLLMENTS_PAGE, enrollments.value, (count) => `${count} yêu cầu chờ duyệt`);
  if (members.status === 'fulfilled') setSidebarBadge(USERS_PAGE, members.value, (count) => `${count} thành viên chờ kích hoạt`);
}

// ---------- Mobile menu ----------

function setSidebarOpen(isOpen) {
  document.body.classList.toggle('sidebar-open', isOpen);
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', String(isOpen));
}

function initMobileMenu() {
  const overlay = createElement('div', 'sidebar-overlay');
  overlay.addEventListener('click', () => setSidebarOpen(false));
  document.body.appendChild(overlay);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSidebarOpen(false);
  });
}

function createMenuToggle() {
  const button = createElement('button', 'icon-button menu-toggle');
  button.id = 'menu-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'Mở menu');
  button.setAttribute('aria-expanded', 'false');
  button.appendChild(createIcon('menu'));
  button.addEventListener('click', () => {
    setSidebarOpen(!document.body.classList.contains('sidebar-open'));
  });
  return button;
}

// ---------- Header ----------

function createSearchBox(placeholder, onSearch) {
  const box = createElement('label', 'header-search');
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'header-search';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  input.addEventListener('input', debounce(() => onSearch(input.value.trim()), 350));
  box.append(createIcon('search', 18), input);
  return box;
}

export function createAvatar(profile, className = 'avatar') {
  const avatar = createElement('span', className);
  if (profile?.avatar_url) {
    const image = document.createElement('img');
    image.src = profile.avatar_url;
    image.alt = '';
    image.addEventListener('error', () => image.replaceWith(getInitials(profile.username)));
    avatar.appendChild(image);
  } else {
    avatar.textContent = getInitials(profile?.username);
  }
  return avatar;
}

function createUserDropdown(profile) {
  const dropdown = createElement('div', 'user-dropdown');
  dropdown.hidden = true;
  dropdown.setAttribute('role', 'menu');

  const info = createElement('div', 'user-dropdown-info');
  info.append(
    createElement('strong', '', profile.username),
    createElement('span', 'text-secondary', profile.email),
  );

  const accountLink = createElement('a', 'user-dropdown-item', 'Tài khoản');
  accountLink.href = ACCOUNT_PAGE;
  accountLink.setAttribute('role', 'menuitem');

  const logoutButton = createElement('button', 'user-dropdown-item text-danger', 'Đăng xuất');
  logoutButton.type = 'button';
  logoutButton.setAttribute('role', 'menuitem');
  logoutButton.addEventListener('click', signOut);

  dropdown.append(info, accountLink, logoutButton);
  return dropdown;
}

function createUserMenu(profile) {
  const wrapper = createElement('div', 'user-menu');
  const trigger = createElement('button', 'user-menu-trigger');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.append(
    createAvatar(profile),
    createElement('span', 'user-menu-name', profile.username),
    createIcon('chevronDown', 16),
  );

  const dropdown = createUserDropdown(profile);
  const setOpen = (isOpen) => {
    dropdown.hidden = !isOpen;
    trigger.setAttribute('aria-expanded', String(isOpen));
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(dropdown.hidden);
  });
  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  wrapper.append(trigger, dropdown);
  return wrapper;
}

export function renderHeader(title, profile, { searchPlaceholder = 'Tìm kiếm...', onSearch } = {}) {
  const header = document.getElementById('header');
  if (!header) return;

  const left = createElement('div', 'header-left');
  left.append(createMenuToggle(), createElement('h1', 'header-title', title));

  const right = createElement('div', 'header-right');
  if (onSearch) right.appendChild(createSearchBox(searchPlaceholder, onSearch));
  right.append(createNotificationBell(profile), createUserMenu(profile));

  header.replaceChildren(left, right);
  document.title = `${title} - Học Vèo`;
}

// Kiểm tra session + role rồi mới hiển thị layout. Trả về profile hoặc null (đã redirect).
// options: { adminOnly, searchPlaceholder, onSearch }
export async function initLayout(title, { adminOnly = true, ...headerOptions } = {}) {
  const profile = await requireAuth({ adminOnly });
  if (!profile) return null;
  renderSidebar(profile);
  if (isAdmin(profile)) refreshPendingBadge();
  renderHeader(title, profile, headerOptions);
  initMobileMenu();
  document.body.classList.remove('auth-pending');
  return profile;
}
