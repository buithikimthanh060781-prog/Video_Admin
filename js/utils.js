// Helper dùng chung

export function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size === 0) return '0 Bytes';
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

export function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('vi-VN');
}

export function debounce(callback, delay = 300) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => callback(...args), delay);
  };
}

export function getInitials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

// Tạo element với class + text an toàn (textContent, không dùng innerHTML).
export function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== '') element.textContent = text;
  return element;
}

// Bỏ dấu tiếng Việt và ký tự đặc biệt để tên file an toàn trong URL
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Escape ký tự đặc biệt của LIKE để tìm kiếm đúng nghĩa đen
export function escapeLikePattern(text) {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Giây -> "m:ss" (hoặc "h:mm:ss" khi >= 1 giờ)
export function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (!total) return '—';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}
