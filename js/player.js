// Trình phát video: file upload (signed URL, bucket private) hoặc nhúng YouTube
import { createStateView, openModal } from './components.js';
import { BUCKETS, createSignedUrl } from './storage.js';
import { createElement } from './utils.js';

export const VIDEO_SOURCES = {
  upload: 'UPLOAD',
  youtube: 'YOUTUBE',
};

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const YOUTUBE_PATH_KINDS = new Set(['embed', 'shorts', 'live', 'v']);
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// ---------- YouTube ----------

function extractYouTubeCandidate(url) {
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') return url.pathname.split('/')[1];
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const [, kind, value] = url.pathname.split('/');
  return YOUTUBE_PATH_KINDS.has(kind) ? value : null;
}

// Trả về mã video 11 ký tự hoặc null. Chỉ chấp nhận đúng domain YouTube (so khớp chính xác hostname).
export function parseYouTubeVideoId(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const candidate = extractYouTubeCandidate(url);
  return YOUTUBE_ID_PATTERN.test(candidate || '') ? candidate : null;
}

// Dạng chuẩn lưu trong database (khớp ràng buộc videos_youtube_url_check)
export function buildYouTubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYouTubeThumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function isYouTubeThumbnail(url) {
  return Boolean(url) && url.startsWith('https://i.ytimg.com/');
}

export function getYouTubeEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}

export function isYouTubeVideo(video) {
  return video?.video_source === VIDEO_SOURCES.youtube;
}

// ---------- Player ----------

function createYouTubePlayer(video) {
  const videoId = parseYouTubeVideoId(video.video_url);
  if (!videoId) throw new Error('invalid youtube url');
  const frame = createElement('iframe');
  frame.src = getYouTubeEmbedUrl(videoId);
  frame.title = video.title;
  frame.allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  return frame;
}

async function createUploadPlayer(video) {
  if (!video.storage_path) throw new Error('no file');
  const player = createElement('video');
  player.controls = true;
  player.preload = 'metadata';
  player.src = await createSignedUrl(BUCKETS.videos, video.storage_path);
  return player;
}

// Trả về element phát video (iframe hoặc <video>). Throw nếu không phát được.
export async function createVideoPlayer(video) {
  const element = isYouTubeVideo(video) ? createYouTubePlayer(video) : await createUploadPlayer(video);
  element.classList.add('player-media');
  return element;
}

const PLAYBACK_ERROR = { message: 'Không thể phát video này. File có thể bị lỗi hoặc định dạng không được trình duyệt hỗ trợ.' };
const NO_FILE_ERROR = { message: 'Video này chưa có file để phát.' };

function hasPlayableSource(video) {
  return isYouTubeVideo(video) || Boolean(video.storage_path);
}

// Vẽ trình phát vào container (có loading/error). Trả về true nếu tạo được trình phát.
export async function renderPlayerInto(container, video) {
  if (!hasPlayableSource(video)) {
    container.replaceChildren(createStateView('empty', NO_FILE_ERROR));
    return false;
  }
  container.replaceChildren(createStateView('loading'));
  try {
    const player = await createVideoPlayer(video);
    player.addEventListener('error', () => container.replaceChildren(createStateView('error', PLAYBACK_ERROR)));
    container.replaceChildren(player);
    return true;
  } catch {
    container.replaceChildren(createStateView('error', PLAYBACK_ERROR));
    return false;
  }
}

// Mở modal xem video. video: { title, video_source, video_url, storage_path }
export function openVideoModal(video) {
  const container = createElement('div', 'player');
  openModal({
    title: video.title,
    body: container,
    size: 'lg',
    actions: [{ label: 'Close', variant: 'secondary' }],
  });
  return renderPlayerInto(container, video);
}
