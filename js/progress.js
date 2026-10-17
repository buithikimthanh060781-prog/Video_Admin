// Thanh tiến độ học tập (dùng ở "Khóa học của tôi" và trang học)
import { createElement } from './utils.js?v=202610171935';

// lessonIds: id các bài đang hiển thị của khóa học; completedIds: Set id bài đã học xong
export function computeProgress(lessonIds, completedIds) {
  const total = lessonIds.length;
  const completed = lessonIds.filter((id) => completedIds.has(id)).length;
  const percent = total === 0 ? 0 : Math.round((completed * 100) / total);
  return { completed, total, percent };
}

export function createProgressBar({ completed, total, percent }, { label = 'Tiến độ', compact = false } = {}) {
  const block = createElement('div', compact ? 'progress-block progress-compact' : 'progress-block');

  const head = createElement('div', 'progress-head');
  head.append(
    createElement('span', 'progress-label', label),
    createElement('strong', percent === 100 ? 'progress-value is-done' : 'progress-value', `${percent}%`),
  );

  const track = createElement('div', 'progress-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(percent));
  track.setAttribute('aria-label', `${label}: ${percent}%`);
  const fill = createElement('div', percent === 100 ? 'progress-fill is-done' : 'progress-fill');
  // CSSOM (không phải inline style attribute) nên không vi phạm CSP style-src
  fill.style.width = `${percent}%`;
  track.appendChild(fill);

  block.append(head, track, createElement('small', 'progress-caption', `${completed}/${total} bài học`));
  return block;
}
