// Trình phát video: tệp tải lên (signed URL, bucket private) hoặc nhúng YouTube
import { createStateView, openModal } from './components.js?v=202610180851';
import { BUCKETS, createSignedUrl } from './storage.js?v=202610180851';
import { createElement } from './utils.js?v=202610180851';

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
const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const YOUTUBE_STATE_ENDED = 0;
// Xem tới 95% thời lượng (hoặc hết video) thì coi là đã học xong bài
const WATCHED_RATIO = 0.95;

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

// enableApi: bật kênh postMessage của trình phát để biết khi nào xem xong (dùng ở trang học)
export function getYouTubeEmbedUrl(videoId, { enableApi = false } = {}) {
  const url = new URL(`${YOUTUBE_EMBED_ORIGIN}/embed/${videoId}`);
  url.searchParams.set('rel', '0');
  if (enableApi) {
    url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('origin', location.origin);
  }
  return url.href;
}

export function isYouTubeVideo(video) {
  return video?.video_source === VIDEO_SOURCES.youtube;
}

// ---------- Player ----------

function hasWatchedEnough(currentTime, duration) {
  return duration > 0 && currentTime / duration >= WATCHED_RATIO;
}

// Theo dõi video YouTube nhúng qua postMessage (không tải script API của YouTube, vốn bị CSP chặn).
// Gọi onWatched() đúng 1 lần khi video kết thúc hoặc đã xem >= 95%.
function watchYouTubeProgress(frame, onWatched) {
  let isDone = false;
  let duration = 0;

  function finish() {
    if (isDone) return;
    isDone = true;
    window.removeEventListener('message', handleMessage);
    onWatched();
  }

  function handleMessage(event) {
    if (!frame.isConnected) {
      window.removeEventListener('message', handleMessage);
      return;
    }
    if (event.origin !== YOUTUBE_EMBED_ORIGIN || event.source !== frame.contentWindow) return;
    let data;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (data?.event === 'onStateChange' && data.info === YOUTUBE_STATE_ENDED) {
      finish();
      return;
    }
    const info = data?.event === 'infoDelivery' || data?.event === 'initialDelivery' ? data.info : null;
    if (!info) return;
    if (info.duration > 0) duration = info.duration;
    if (info.playerState === YOUTUBE_STATE_ENDED || hasWatchedEnough(info.currentTime, duration)) finish();
  }

  window.addEventListener('message', handleMessage);
  // Đăng ký nhận sự kiện từ trình phát sau khi iframe tải xong
  frame.addEventListener('load', () => {
    const post = (message) => frame.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: 'widget' }), YOUTUBE_EMBED_ORIGIN);
    post({ event: 'listening' });
    post({ event: 'command', func: 'addEventListener', args: ['onStateChange'] });
  });
}

function createYouTubePlayer(video, onWatched) {
  const videoId = parseYouTubeVideoId(video.video_url);
  if (!videoId) throw new Error('invalid youtube url');
  const frame = createElement('iframe');
  frame.src = getYouTubeEmbedUrl(videoId, { enableApi: Boolean(onWatched) });
  frame.title = video.title;
  frame.allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  if (onWatched) watchYouTubeProgress(frame, onWatched);
  return frame;
}

async function createUploadPlayer(video, onWatched) {
  if (!video.storage_path) throw new Error('no file');
  const player = createElement('video');
  player.controls = true;
  player.preload = 'metadata';
  player.src = await createSignedUrl(BUCKETS.videos, video.storage_path);
  if (onWatched) {
    let isDone = false;
    const finish = () => {
      if (isDone) return;
      isDone = true;
      onWatched();
    };
    player.addEventListener('ended', finish);
    player.addEventListener('timeupdate', () => {
      if (hasWatchedEnough(player.currentTime, player.duration)) finish();
    });
  }
  return player;
}

// Trả về element phát video (iframe hoặc <video>). Throw nếu không phát được.
// onWatched(): gọi 1 lần khi người học xem hết / xem >= 95% (dùng để tự đánh dấu đã học).
export async function createVideoPlayer(video, { onWatched } = {}) {
  const element = isYouTubeVideo(video) ? createYouTubePlayer(video, onWatched) : await createUploadPlayer(video, onWatched);
  element.classList.add('player-media');
  return element;
}

const PLAYBACK_ERROR = { message: 'Không thể phát video này. Tệp có thể bị lỗi hoặc định dạng không được trình duyệt hỗ trợ.' };
const NO_FILE_ERROR = { message: 'Video này chưa có tệp để phát.' };

function hasPlayableSource(video) {
  return isYouTubeVideo(video) || Boolean(video.storage_path);
}

// Vẽ trình phát vào container (có loading/error). Trả về true nếu tạo được trình phát.
export async function renderPlayerInto(container, video, { onWatched } = {}) {
  if (!hasPlayableSource(video)) {
    container.replaceChildren(createStateView('empty', NO_FILE_ERROR));
    return false;
  }
  container.replaceChildren(createStateView('loading'));
  try {
    const player = await createVideoPlayer(video, { onWatched });
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
    actions: [{ label: 'Đóng', variant: 'secondary' }],
  });
  return renderPlayerInto(container, video);
}
