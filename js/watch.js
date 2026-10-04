// watch module: xem 1 video đã công khai + ghi nhận lượt xem + video khác
import { supabase } from './supabase.js';
import { initLayout } from './layout.js';
import { createBadge, createStateView } from './components.js';
import { isYouTubeVideo, renderPlayerInto } from './player.js';
import { createElement, formatDate, formatDuration, formatNumber } from './utils.js';

const THUMBNAIL_PLACEHOLDER = 'assets/thumbnail-placeholder.svg';
const RELATED_LIMIT = 6;
// Cùng 1 video chỉ tính 1 lượt xem trong 30 phút trên mỗi trình duyệt (mọi tab)
const VIEW_DEDUPE_MS = 30 * 60 * 1000;
const VIDEO_COLUMNS = 'id, title, description, thumbnail_url, storage_path, video_source, video_url, duration, views, created_at, category_id, video_categories(name)';
const RELATED_COLUMNS = 'id, title, thumbnail_url, video_source, duration, views';

const videoId = new URLSearchParams(location.search).get('id');
const elements = {};

// ---------- Data ----------

async function fetchVideo(id) {
  if (!/^\d+$/.test(id || '')) return null;
  const { data, error } = await supabase
    .from('videos')
    .select(VIDEO_COLUMNS)
    .eq('id', id)
    .eq('status', 'PUBLISHED')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchVideosExcept(excludedId, categoryId) {
  let query = supabase
    .from('videos')
    .select(RELATED_COLUMNS)
    .eq('status', 'PUBLISHED')
    .neq('id', excludedId)
    .order('views', { ascending: false })
    .limit(RELATED_LIMIT);
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Ưu tiên video cùng category; nếu không có thì lấy video xem nhiều nhất
async function fetchRelatedVideos(video) {
  const sameCategory = video.category_id ? await fetchVideosExcept(video.id, video.category_id) : [];
  return sameCategory.length > 0 ? sameCategory : fetchVideosExcept(video.id, null);
}

// Trigger trg_video_views_increment tự tăng videos.views. Không cần SELECT lại bảng video_views.
async function insertView(id, userId) {
  const { error } = await supabase.from('video_views').insert({ video_id: id, user_id: userId });
  if (error) throw error;
}

// ---------- View tracking ----------

function getViewKey(id) {
  return `viewed-video-${id}`;
}

function wasViewedRecently(id) {
  try {
    const viewedAt = Number(localStorage.getItem(getViewKey(id)));
    return Boolean(viewedAt) && Date.now() - viewedAt < VIEW_DEDUPE_MS;
  } catch {
    return false;
  }
}

function markViewed(id) {
  try {
    localStorage.setItem(getViewKey(id), String(Date.now()));
  } catch {
    // localStorage không khả dụng: bỏ qua chống trùng
  }
}

// Ghi lượt xem; lỗi không ảnh hưởng việc xem video
async function recordView(video, profile) {
  if (wasViewedRecently(video.id)) return;
  try {
    await insertView(video.id, profile.id);
    markViewed(video.id);
    renderViews(Number(video.views) + 1);
  } catch {
    // Không hiển thị lỗi cho người xem
  }
}

// ---------- Render ----------

function renderViews(views) {
  elements.views.textContent = `${formatNumber(views)} lượt xem`;
}

function renderVideoInfo(video) {
  document.title = `${video.title} - Video Admin`;
  elements.title.textContent = video.title;
  const categoryName = video.video_categories?.name;
  elements.category.replaceChildren(...(categoryName ? [createBadge(categoryName, 'primary')] : []));
  renderViews(video.views);
  elements.date.textContent = formatDate(video.created_at);
  elements.description.textContent = video.description || '';
}

function createRelatedThumbnail(video) {
  const wrapper = createElement('div', 'related-thumb');
  const image = createElement('img');
  image.src = video.thumbnail_url || THUMBNAIL_PLACEHOLDER;
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => { image.src = THUMBNAIL_PLACEHOLDER; }, { once: true });
  wrapper.appendChild(image);
  if (!isYouTubeVideo(video) && video.duration) {
    wrapper.appendChild(createElement('span', 'duration-badge', formatDuration(video.duration)));
  }
  return wrapper;
}

function createRelatedItem(video) {
  const item = createElement('a', 'related-item');
  item.href = `watch.html?id=${encodeURIComponent(video.id)}`;
  const info = createElement('div', 'related-info');
  info.append(
    createElement('span', 'related-title', video.title),
    createElement('span', 'video-card-meta', `${formatNumber(video.views)} lượt xem`),
  );
  item.append(createRelatedThumbnail(video), info);
  return item;
}

async function loadRelated(video) {
  elements.related.replaceChildren(createStateView('loading'));
  try {
    const videos = await fetchRelatedVideos(video);
    if (videos.length === 0) {
      elements.related.replaceChildren(createStateView('empty', { message: 'Chưa có video khác.' }));
      return;
    }
    elements.related.replaceChildren(...videos.map(createRelatedItem));
  } catch {
    elements.related.replaceChildren(createStateView('error', {
      actionLabel: 'Thử lại',
      onAction: () => loadRelated(video),
    }));
  }
}

function showPageState(type, options) {
  elements.layout.hidden = true;
  elements.pageState.hidden = false;
  const card = createElement('div', 'card');
  card.appendChild(createStateView(type, options));
  elements.pageState.replaceChildren(card);
}

function showNotFound() {
  showPageState('empty', {
    message: 'Không tìm thấy video hoặc video chưa được công khai.',
    actionLabel: 'Về thư viện',
    onAction: () => { location.href = 'library.html'; },
  });
}

// ---------- Init ----------

function cacheElements() {
  elements.pageState = document.getElementById('page-state');
  elements.layout = document.getElementById('watch-layout');
  elements.player = document.getElementById('player');
  elements.title = document.getElementById('watch-title');
  elements.category = document.getElementById('watch-category');
  elements.views = document.getElementById('watch-views');
  elements.date = document.getElementById('watch-date');
  elements.description = document.getElementById('watch-description');
  elements.related = document.getElementById('related-list');
}

async function loadWatchPage(profile) {
  showPageState('loading');
  try {
    const video = await fetchVideo(videoId);
    if (!video) return showNotFound();

    renderVideoInfo(video);
    elements.pageState.hidden = true;
    elements.layout.hidden = false;

    const [isPlayable] = await Promise.all([
      renderPlayerInto(elements.player, video),
      loadRelated(video),
    ]);
    if (isPlayable) await recordView(video, profile);
  } catch {
    showPageState('error', { actionLabel: 'Thử lại', onAction: () => loadWatchPage(profile) });
  }
}

async function initWatchPage() {
  const profile = await initLayout('Watch', { adminOnly: false });
  if (!profile) return;
  cacheElements();
  await loadWatchPage(profile);
}

initWatchPage();
