// Trang Tổng quan: thống kê, 10 video xem nhiều nhất, biểu đồ lượt xem
import { supabase } from './supabase.js?v=202610172049';
import { initLayout } from './layout.js?v=202610172049';
import { createIcon } from './icons.js?v=202610172049';
import { createStateView, renderTableState, showToast } from './components.js?v=202610172049';
import { createElement, formatBytes, formatNumber } from './utils.js?v=202610172049';

const TOP_LIMIT = 10;
const PRIMARY_COLOR = '#ea580c';
const PRIMARY_SOFT = 'rgba(234, 88, 12, 0.12)';
const THUMBNAIL_PLACEHOLDER = 'assets/thumbnail-placeholder.svg';
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const STAT_FORMATTERS = {
  total_videos: formatNumber,
  total_views: formatNumber,
  storage_used: formatBytes,
  total_users: formatNumber,
};

const charts = { top: null, views: null };

// ---------- Statistics ----------

function renderStatIcons() {
  document.querySelectorAll('.stat-card').forEach((card) => {
    const icon = createElement('span', 'stat-icon');
    icon.appendChild(createIcon(card.dataset.icon, 24));
    card.prepend(icon);
  });
}

function setStatValues(getText) {
  document.querySelectorAll('.stat-card').forEach((card) => {
    card.querySelector('.stat-value').textContent = getText(card.dataset.stat);
  });
}

async function loadStats() {
  setStatValues(() => '...');
  try {
    const { data, error } = await supabase.rpc('get_dashboard_stats');
    if (error) throw error;
    setStatValues((key) => STAT_FORMATTERS[key](data[key]));
  } catch {
    setStatValues(() => '—');
    throw new Error('stats');
  }
}

// ---------- Top 10 videos ----------

async function fetchTopVideos() {
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, thumbnail_url, views')
    .order('views', { ascending: false })
    .limit(TOP_LIMIT);
  if (error) throw error;
  return data;
}

function createThumbnail(url) {
  const image = createElement('img', 'table-thumb');
  image.src = url || THUMBNAIL_PLACEHOLDER;
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => { image.src = THUMBNAIL_PLACEHOLDER; }, { once: true });
  return image;
}

function createTopVideoRow(video, index) {
  const row = document.createElement('tr');
  const rankCell = createElement('td');
  rankCell.appendChild(createElement('span', `rank rank-${index + 1}`, String(index + 1)));
  const thumbCell = createElement('td');
  thumbCell.appendChild(createThumbnail(video.thumbnail_url));
  const titleCell = createElement('td', 'cell-title', video.title);
  const viewsCell = createElement('td', 'text-right', formatNumber(video.views));
  row.append(rankCell, thumbCell, titleCell, viewsCell);
  return row;
}

function renderTopTable(videos) {
  const tbody = document.getElementById('top-videos-body');
  tbody.replaceChildren(...videos.map(createTopVideoRow));
}

function truncate(text, maxLength = 18) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function renderTopChart(videos) {
  if (!isChartAvailable()) return showContainerState('top-chart-container', 'error', CHART_UNAVAILABLE);
  const canvas = resetChartContainer('top-chart-container');
  charts.top?.destroy();
  charts.top = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: videos.map((video) => truncate(video.title)),
      datasets: [{
        label: 'Lượt xem',
        data: videos.map((video) => video.views),
        backgroundColor: PRIMARY_COLOR,
        borderRadius: 6,
        maxBarThickness: 36,
      }],
    },
    options: {
      ...baseChartOptions(),
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (items) => videos[items[0].dataIndex].title } },
      },
    },
  });
}

async function loadTopVideos() {
  const tbody = document.getElementById('top-videos-body');
  showTableState(tbody, 'loading');
  showContainerState('top-chart-container', 'loading');
  try {
    const videos = await fetchTopVideos();
    if (videos.length === 0) {
      showTableState(tbody, 'empty', { message: 'Chưa có video nào.' });
      showContainerState('top-chart-container', 'empty', { message: 'Chưa có video nào.' });
      return;
    }
    renderTopTable(videos);
    renderTopChart(videos);
  } catch {
    const retry = { actionLabel: 'Thử lại', onAction: loadTopVideos };
    showTableState(tbody, 'error', retry);
    showContainerState('top-chart-container', 'error', retry);
  }
}

// ---------- Views over time ----------

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// Trả về { from, to, interval } theo filter
function getDateRange(range) {
  const now = new Date();
  const today = startOfDay(now);
  const ranges = {
    '7days': { from: addDays(today, -6), interval: 'day' },
    '30days': { from: addDays(today, -29), interval: 'day' },
    thisMonth: { from: new Date(now.getFullYear(), now.getMonth(), 1), interval: 'day' },
    thisYear: { from: new Date(now.getFullYear(), 0, 1), interval: 'month' },
  };
  return { ...ranges[range], to: now };
}

async function fetchViewsOverTime({ from, to, interval }) {
  const { data, error } = await supabase.rpc('get_views_over_time', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_interval: interval,
    p_timezone: TIMEZONE,
  });
  if (error) throw error;
  return data;
}

function formatBucket(bucket, interval) {
  const [year, month, day] = bucket.split('-');
  return interval === 'month' ? `${month}/${year}` : `${day}/${month}`;
}

function renderViewsChart(rows, interval) {
  if (!isChartAvailable()) return showContainerState('views-chart-container', 'error', CHART_UNAVAILABLE);
  const canvas = resetChartContainer('views-chart-container');
  charts.views?.destroy();
  charts.views = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map((row) => formatBucket(row.bucket, interval)),
      datasets: [{
        label: 'Lượt xem',
        data: rows.map((row) => row.views),
        borderColor: PRIMARY_COLOR,
        backgroundColor: PRIMARY_SOFT,
        fill: true,
        tension: 0.3,
        pointRadius: rows.length > 31 ? 0 : 3,
        pointHoverRadius: 5,
      }],
    },
    options: { ...baseChartOptions(), plugins: { legend: { display: false } } },
  });
}

async function loadViewsOverTime(range) {
  showContainerState('views-chart-container', 'loading');
  try {
    const dateRange = getDateRange(range);
    const rows = await fetchViewsOverTime(dateRange);
    const totalViews = rows.reduce((sum, row) => sum + Number(row.views), 0);
    if (totalViews === 0) {
      showContainerState('views-chart-container', 'empty', { message: 'Chưa có lượt xem trong khoảng thời gian này.' });
      return;
    }
    renderViewsChart(rows, dateRange.interval);
  } catch {
    showContainerState('views-chart-container', 'error', {
      actionLabel: 'Thử lại',
      onAction: () => loadViewsOverTime(range),
    });
  }
}

function initRangeFilter() {
  const group = document.getElementById('views-range');
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-range]');
    if (!button || button.classList.contains('active')) return;
    group.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
    loadViewsOverTime(button.dataset.range);
  });
}

// ---------- Chart helpers ----------

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { display: false }, ticks: { color: '#6b7280', maxRotation: 45, autoSkip: true } },
      y: { beginAtZero: true, grid: { color: '#e5e7eb' }, ticks: { color: '#6b7280', precision: 0 } },
    },
  };
}

function resetChartContainer(containerId) {
  const container = document.getElementById(containerId);
  const canvas = document.createElement('canvas');
  container.replaceChildren(canvas);
  return canvas;
}

function showContainerState(containerId, type, options) {
  const key = containerId.startsWith('top') ? 'top' : 'views';
  charts[key]?.destroy();
  charts[key] = null;
  document.getElementById(containerId).replaceChildren(createStateView(type, options));
}

function showTableState(tbody, type, options) {
  renderTableState(tbody, 4, type, options);
}

function isChartAvailable() {
  return typeof Chart !== 'undefined';
}

const CHART_UNAVAILABLE = { message: 'Không tải được thư viện biểu đồ.' };

// ---------- Init ----------

async function initDashboardPage() {
  const profile = await initLayout('Tổng quan');
  if (!profile) return;

  renderStatIcons();
  initRangeFilter();

  const [statsResult] = await Promise.allSettled([
    loadStats(),
    loadTopVideos(),
    loadViewsOverTime('7days'),
  ]);
  if (statsResult.status === 'rejected') {
    showToast('Không thể tải thống kê. Vui lòng thử lại.', 'error');
  }
}

initDashboardPage();
