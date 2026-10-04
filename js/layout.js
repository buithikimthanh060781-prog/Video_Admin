// Layout dùng chung: Sidebar + Header + User menu + Mobile menu
import { requireAuth, isAdmin, signOut, getHomePage } from './auth.js';
import { createIcon } from './icons.js';
import { showToast } from './components.js';
import { createElement, debounce, getInitials } from './utils.js';

const MENU_ITEMS = [
  { href: 'index.html', label: 'Dashboard', icon: 'dashboard', adminOnly: true },
  { href: 'videos.html', label: 'Videos', icon: 'video', adminOnly: true, activeFor: ['video-edit.html'] },
  { href: 'categories.html', label: 'Categories', icon: 'category', adminOnly: true },
  { href: 'users.html', label: 'Users', icon: 'users', adminOnly: true },
  { href: 'library.html', label: 'Library', icon: 'play', adminOnly: false, activeFor: ['watch.html'] },
  { href: 'account.html', label: 'Account', icon: 'account', adminOnly: false },
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
  button.title = 'Logout';
  button.append(createIcon('logout'), createElement('span', 'sidebar-label', 'Logout'));
  button.addEventListener('click', signOut);
  return button;
}

export function renderSidebar(profile) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const currentPage = getCurrentPage();

  const logo = createElement('a', 'sidebar-logo');
  logo.href = getHomePage(profile);
  logo.append(createIcon('video', 22), createElement('span', 'sidebar-label', 'Video Admin'));

  const nav = createElement('nav', 'sidebar-nav');
  nav.setAttribute('aria-label', 'Menu chính');
  MENU_ITEMS
    .filter((item) => !item.adminOnly || isAdmin(profile))
    .forEach((item) => nav.appendChild(createMenuLink(item, currentPage)));

  const bottom = createElement('div', 'sidebar-bottom');
  bottom.appendChild(createLogoutButton());

  sidebar.replaceChildren(logo, nav, bottom);
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

function createNotificationButton() {
  const button = createElement('button', 'icon-button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Thông báo');
  button.appendChild(createIcon('bell'));
  button.addEventListener('click', () => showToast('Không có thông báo mới.', 'info'));
  return button;
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

  const accountLink = createElement('a', 'user-dropdown-item', 'Account');
  accountLink.href = 'account.html';
  accountLink.setAttribute('role', 'menuitem');

  const logoutButton = createElement('button', 'user-dropdown-item text-danger', 'Logout');
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
  right.append(createNotificationButton(), createUserMenu(profile));

  header.replaceChildren(left, right);
  document.title = `${title} - Video Admin`;
}

// Kiểm tra session + role rồi mới hiển thị layout. Trả về profile hoặc null (đã redirect).
// options: { adminOnly, searchPlaceholder, onSearch }
export async function initLayout(title, { adminOnly = true, ...headerOptions } = {}) {
  const profile = await requireAuth({ adminOnly });
  if (!profile) return null;
  renderSidebar(profile);
  renderHeader(title, profile, headerOptions);
  initMobileMenu();
  document.body.classList.remove('auth-pending');
  return profile;
}
