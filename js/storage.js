// Supabase Storage helpers: validate, upload, public/signed URL, remove
import { supabase, SUPABASE_URL } from './supabase.js?v=202610180851';
import { slugify } from './utils.js?v=202610180851';

export const BUCKETS = {
  thumbnails: 'thumbnails',
  videos: 'videos',
  avatars: 'avatars',
};

const MB = 1024 * 1024;

export const FILE_RULES = {
  thumbnail: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    maxSize: 5 * MB,
    label: 'JPG, PNG, WEBP',
  },
  avatar: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    maxSize: 2 * MB,
    label: 'JPG, PNG, WEBP',
  },
  video: {
    mimeTypes: ['video/mp4', 'video/webm'],
    extensions: ['mp4', 'webm'],
    maxSize: 50 * MB,
    label: 'MP4, WEBM',
  },
};

function getExtension(fileName) {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

// Kiểm tra MIME type, extension và dung lượng. Trả về thông báo lỗi hoặc ''.
export function validateFile(file, rules) {
  if (!file) return '';
  const extension = getExtension(file.name);
  if (!rules.mimeTypes.includes(file.type) || !rules.extensions.includes(extension)) {
    return `Định dạng không hợp lệ. Chỉ chấp nhận ${rules.label}.`;
  }
  if (file.size > rules.maxSize) {
    return `Tệp quá lớn. Tối đa ${Math.round(rules.maxSize / MB)} MB.`;
  }
  return '';
}

function sanitizeFileName(fileName) {
  const extension = getExtension(fileName);
  const baseName = slugify(fileName.slice(0, fileName.length - extension.length - 1)) || 'file';
  return `${baseName}.${extension}`;
}

// Format: userId/timestamp-originalFileName
export function buildStoragePath(userId, file) {
  return `${userId}/${Date.now()}-${sanitizeFileName(file.name)}`;
}

export async function uploadFile(bucket, path, file) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (error) throw error;
  return path;
}

// Sao chép file trong cùng bucket (dùng khi nhân bản khóa học để mỗi khóa học có thumbnail riêng)
export async function copyFile(bucket, fromPath, toPath) {
  const { error } = await supabase.storage.from(bucket).copy(fromPath, toPath);
  if (error) throw error;
  return toPath;
}

export function getPublicUrl(bucket, path) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// URL cố định (cần đăng nhập) của object trong bucket private
export function getAuthenticatedUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${path}`;
}

// Lấy path từ public URL của bucket. Trả về null nếu URL không thuộc Storage của project.
export function getPathFromPublicUrl(bucket, url) {
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
  return url?.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
}

export async function createSignedUrl(bucket, path, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// Xóa file; không throw để không chặn luồng chính. Trả về true nếu thành công.
export async function removeFiles(bucket, paths) {
  const validPaths = paths.filter(Boolean);
  if (validPaths.length === 0) return true;
  try {
    const { error } = await supabase.storage.from(bucket).remove(validPaths);
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}

export function getFriendlyStorageError(error) {
  const message = (error?.message || '').toLowerCase();
  if (message.includes('exceeded the maximum') || message.includes('too large') || error?.statusCode === '413') {
    return 'Tệp vượt quá dung lượng cho phép.';
  }
  if (message.includes('mime type') || message.includes('invalid_mime_type')) return 'Định dạng tệp không được hỗ trợ.';
  if (message.includes('row-level security') || message.includes('unauthorized')) return 'Bạn không có quyền tải tệp lên.';
  return 'Tải tệp lên thất bại. Vui lòng thử lại.';
}
