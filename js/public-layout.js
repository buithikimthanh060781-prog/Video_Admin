// Header cho trang công khai (login.html, course-detail.html) — khách chưa đăng nhập vẫn xem được.
// Desktop: logo · menu (Trang chủ, Khóa học, Danh mục ▾, Giới thiệu) · tìm kiếm · Đăng nhập · Đăng ký miễn phí.
// Mobile (≤ 960px, css/landing.css): logo + nút hamburger mở bảng menu.
// Dropdown "Danh mục" và menu mobile dùng được bằng chuột, cảm ứng và bàn phím.
import { supabase } from './supabase.js?v=202610171951';
import { getCurrentProfile, getHomePage, getSession, isActive } from './auth.js?v=202610171951';
import { openLoginModal } from './login-modal.js?v=202610171951';
import { openRegisterModal } from './register-modal.js?v=202610171951';
import { showFlashToast } from './components.js?v=202610171951';
import { createIcon } from './icons.js?v=202610171951';
import { createElement } from './utils.js?v=202610171951';

// login.html là trang chủ công khai: banner + danh sách khóa học + nút Đăng nhập (popup)
export const HOME_PAGE = 'login.html';
const REGISTER_PAGE = 'register.html';
const COURSES_ANCHOR = '#courses';
const ABOUT_ANCHOR = '#gioi-thieu';
const MOBILE_QUERY = '(max-width: 960px)';

// Trang chủ có sẵn ô tìm kiếm / lọc lĩnh vực của danh sách khóa học
function getCatalogControls() {
  return {
    search: document.getElementById('search-input'),
    category: document.getElementById('category-filter'),
  };
}

function scrollToCourses() {
  const section = document.querySelector(COURSES_ANCHOR);
  if (!section) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

async function getActiveProfile() {
  try {
    const session = await getSession();
    if (!session) return null;
    const profile = await getCurrentProfile(session.user.id);
    return profile && isActive(profile) ? profile : null;
  } catch {
    return null;
  }
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

function getCurrentPageKey() {
  const page = location.pathname.split('/').pop() || HOME_PAGE;
  if (page === 'course-detail.html') return 'courses';
  return page === HOME_PAGE ? 'home' : '';
}

// ---------- Logo ----------

function createBrand() {
  const brand = createElement('a', 'public-brand');
  brand.href = HOME_PAGE;
  brand.setAttribute('aria-label', 'Học Vèo - Trang chủ');
  const text = createElement('span', 'brand-text');
  text.append(createElement('span', 'brand-hoc', 'Học'), document.createTextNode(' '), createElement('span', 'brand-veo', 'Vèo'));
  brand.append(createIcon('zap', 20), text);
  return brand;
}

// ---------- Dropdown "Danh mục" ----------

function createCategoryDropdown(closeMobileMenu) {
  const item = createElement('li', 'ph-dropdown');
  const toggle = createElement('button', 'ph-link ph-dropdown-toggle');
  toggle.type = 'button';
  toggle.id = 'ph-category-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'ph-category-menu');
  toggle.append(createElement('span', '', 'Danh mục'), createIcon('chevronDown', 16));

  const menu = createElement('ul', 'ph-dropdown-menu');
  menu.id = 'ph-category-menu';
  menu.hidden = true;
  menu.setAttribute('aria-labelledby', toggle.id);
  menu.appendChild(createElement('li', 'ph-dropdown-note', 'Đang tải danh mục...'));
  item.append(toggle, menu);

  const getLinks = () => [...menu.querySelectorAll('a')];

  function setOpen(isOpen, { focusFirst = false } = {}) {
    menu.hidden = !isOpen;
    toggle.setAttribute('aria-expanded', String(isOpen));
    item.classList.toggle('is-open', isOpen);
    if (isOpen && focusFirst) getLinks()[0]?.focus();
  }

  toggle.addEventListener('click', () => setOpen(menu.hidden));
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true, { focusFirst: true });
    }
  });
  menu.addEventListener('keydown', (event) => {
    const links = getLinks();
    const index = links.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      links[(next + links.length) % links.length]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      toggle.focus();
    }
  });
  // Rời khỏi dropdown (Tab ra ngoài hoặc bấm chỗ khác) thì đóng
  item.addEventListener('focusout', (event) => {
    if (!item.contains(event.relatedTarget)) setOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (!item.contains(event.target)) setOpen(false);
  });

  function selectCategory(event, category) {
    const { category: select } = getCatalogControls();
    setOpen(false);
    closeMobileMenu();
    if (!select) return; // trang khác: điều hướng theo href
    event.preventDefault();
    select.value = String(category.id);
    select.dispatchEvent(new Event('change'));
    history.replaceState(null, '', `${HOME_PAGE}?category=${encodeURIComponent(category.id)}${COURSES_ANCHOR}`);
    scrollToCourses();
  }

  fetchCategories()
    .then((categories) => {
      if (categories.length === 0) {
        menu.replaceChildren(createElement('li', 'ph-dropdown-note', 'Chưa có danh mục nào.'));
        return;
      }
      menu.replaceChildren(...categories.map((category) => {
        const li = createElement('li');
        const link = createElement('a', 'ph-dropdown-link', category.name);
        link.href = `${HOME_PAGE}?category=${encodeURIComponent(category.id)}${COURSES_ANCHOR}`;
        link.addEventListener('click', (event) => selectCategory(event, category));
        li.appendChild(link);
        return li;
      }));
    })
    .catch(() => {
      menu.replaceChildren(createElement('li', 'ph-dropdown-note', 'Không tải được danh mục.'));
    });

  return { item, close: () => setOpen(false) };
}

// ---------- Menu ----------

function createNavLink(text, href, isCurrent, onClick) {
  const li = createElement('li');
  const link = createElement('a', 'ph-link', text);
  link.href = href;
  if (isCurrent) link.setAttribute('aria-current', 'page');
  if (onClick) link.addEventListener('click', onClick);
  li.appendChild(link);
  return li;
}

function createSearchForm(closeMobileMenu) {
  const form = createElement('form', 'ph-search');
  form.setAttribute('role', 'search');
  const input = document.createElement('input');
  input.type = 'search';
  input.name = 'q';
  input.maxLength = 100;
  input.placeholder = 'Tìm khóa học...';
  input.setAttribute('aria-label', 'Tìm khóa học');
  input.autocomplete = 'off';
  form.append(createIcon('search', 18), input);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const keyword = input.value.trim();
    const { search } = getCatalogControls();
    closeMobileMenu();
    if (search) {
      // Trang chủ: dùng luôn ô tìm kiếm của danh sách khóa học
      search.value = keyword;
      search.dispatchEvent(new Event('input'));
      scrollToCourses();
      return;
    }
    location.href = `${HOME_PAGE}${keyword ? `?q=${encodeURIComponent(keyword)}` : ''}${COURSES_ANCHOR}`;
  });
  return form;
}

// Chưa đăng nhập: "Đăng nhập" (phụ) + "Đăng ký miễn phí" (chính). Đã đăng nhập: "Vào hệ thống".
function createHeaderActions(profile, closeMobileMenu) {
  const actions = createElement('div', 'public-header-actions');
  if (profile) {
    const link = createElement('a', 'btn btn-primary btn-sm', 'Vào hệ thống');
    link.href = getHomePage(profile);
    actions.appendChild(link);
    return actions;
  }

  const loginButton = createElement('button', 'btn btn-secondary btn-sm header-login', 'Đăng nhập');
  loginButton.type = 'button';
  loginButton.addEventListener('click', () => {
    closeMobileMenu();
    openLoginModal();
  });

  // Mở popup đăng ký ngay trên trang; href giữ lại để vẫn dùng được khi JavaScript lỗi
  const registerLink = createElement('a', 'btn btn-primary btn-sm header-register', 'Đăng ký miễn phí');
  registerLink.href = REGISTER_PAGE;
  registerLink.addEventListener('click', (event) => {
    event.preventDefault();
    closeMobileMenu();
    openRegisterModal();
  });

  actions.append(loginButton, registerLink);
  return actions;
}

// Các link "Đăng ký" khác trên trang (vd ở footer) có data-register-popup: mở popup thay vì chuyển trang
function bindRegisterPopupLinks() {
  document.querySelectorAll('[data-register-popup]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openRegisterModal();
    });
  });
}

function createBurger() {
  const button = createElement('button', 'icon-button ph-burger');
  button.type = 'button';
  button.setAttribute('aria-controls', 'public-nav');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Mở menu');
  button.appendChild(createIcon('menu', 22));
  return button;
}

// ---------- Init ----------

// Trả về { isLoggedIn, profile }. Popup đăng nhập KHÔNG tự mở: chỉ mở khi bấm nút "Đăng nhập".
export async function initPublicLayout() {
  // Thông báo chuyển từ trang trước (vd: "Đăng ký thành công, chờ kích hoạt")
  showFlashToast();
  bindRegisterPopupLinks();
  const header = document.getElementById('public-header');
  const profile = await getActiveProfile();
  if (!header) return { isLoggedIn: Boolean(profile), profile };

  const pageKey = getCurrentPageKey();
  const burger = createBurger();
  const nav = createElement('nav', 'ph-nav');
  nav.id = 'public-nav';
  nav.setAttribute('aria-label', 'Điều hướng chính');

  let dropdown = null;
  function setMobileOpen(isOpen) {
    header.classList.toggle('is-open', isOpen);
    burger.setAttribute('aria-expanded', String(isOpen));
    burger.setAttribute('aria-label', isOpen ? 'Đóng menu' : 'Mở menu');
    if (!isOpen) dropdown?.close();
  }
  const closeMobileMenu = () => setMobileOpen(false);

  // Trên trang chủ, "Khóa học" cuộn mượt tới danh sách thay vì nhảy
  const onCoursesClick = (event) => {
    closeMobileMenu();
    if (!document.querySelector(COURSES_ANCHOR)) return;
    event.preventDefault();
    scrollToCourses();
  };

  dropdown = createCategoryDropdown(closeMobileMenu);
  const menu = createElement('ul', 'ph-menu');
  menu.append(
    createNavLink('Trang chủ', HOME_PAGE, pageKey === 'home', closeMobileMenu),
    createNavLink('Khóa học', `${HOME_PAGE}${COURSES_ANCHOR}`, pageKey === 'courses', onCoursesClick),
    dropdown.item,
    createNavLink('Giới thiệu', `${HOME_PAGE}${ABOUT_ANCHOR}`, false, closeMobileMenu),
  );
  nav.append(menu, createSearchForm(closeMobileMenu), createHeaderActions(profile, closeMobileMenu));

  const inner = createElement('div', 'ph-inner');
  inner.append(createBrand(), nav, burger);
  header.replaceChildren(inner);

  burger.addEventListener('click', () => setMobileOpen(!header.classList.contains('is-open')));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('is-open')) {
      closeMobileMenu();
      burger.focus();
    }
  });
  window.matchMedia(MOBILE_QUERY).addEventListener('change', (event) => {
    if (!event.matches) closeMobileMenu();
  });

  // Bóng mờ dưới header khi đã cuộn
  const updateShadow = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
  updateShadow();
  window.addEventListener('scroll', updateShadow, { passive: true });

  return { isLoggedIn: Boolean(profile), profile };
}
