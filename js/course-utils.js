// Hằng số + hàm dùng chung cho module khóa học (danh sách, chỉnh sửa)
import { supabase } from './supabase.js?v=202610180851';

export const COURSE_STATUSES = {
  DRAFT: { label: 'Bản nháp', badge: 'warning' },
  PUBLISHED: { label: 'Công khai', badge: 'success' },
  HIDDEN: { label: 'Ẩn', badge: 'default' },
};

// Trạng thái của video gốc (bảng videos), dùng khi hiển thị cảnh báo trong bài học
export const VIDEO_STATUSES = {
  PUBLISHED: { label: 'Công khai', badge: 'success' },
  DRAFT: { label: 'Bản nháp', badge: 'warning' },
  HIDDEN: { label: 'Ẩn', badge: 'default' },
};

export const COURSE_LEVELS = {
  BEGINNER: 'Cơ bản',
  INTERMEDIATE: 'Trung cấp',
  ADVANCED: 'Nâng cao',
};

export const COURSE_LANGUAGES = {
  vi: 'Tiếng Việt',
  en: 'Tiếng Anh',
};

export const MAX_PRICE = 10_000_000_000;

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

export function generateCourseCode() {
  return `KH${Date.now().toString(36).toUpperCase()}`;
}

// Danh sách thông tin còn thiếu để được xuất bản (rỗng = đủ điều kiện)
export function getPublishMissing(course) {
  const missing = [];
  if (!course.title?.trim()) missing.push('Tên khóa học');
  if (!course.category_id) missing.push('Lĩnh vực');
  if (!course.thumbnail_url?.trim()) missing.push('Ảnh bìa');
  return missing;
}

export async function updateCourseStatus(id, status) {
  const { data, error } = await supabase.from('courses').update({ status }).eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('not updated');
}

export function getFriendlyCourseError(error, fallback = 'Không thể lưu khóa học. Vui lòng thử lại.') {
  const message = error?.message || '';
  if (message.includes('courses_publish_requirements')) return 'Cần chọn lĩnh vực và có ảnh bìa trước khi xuất bản.';
  if (message.includes('courses_slug_key')) return 'Đường dẫn (slug) đã tồn tại.';
  if (message.includes('courses_code_key')) return 'Mã khóa học đã tồn tại.';
  if (error?.code === UNIQUE_VIOLATION) return 'Mã khóa học hoặc đường dẫn (slug) đã tồn tại.';
  if (message.includes('courses_sale_price_check')) return 'Giá khuyến mại không được lớn hơn giá niêm yết.';
  if (error?.code === CHECK_VIOLATION) return 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.';
  if (error?.code === FOREIGN_KEY_VIOLATION) return 'Lĩnh vực không còn tồn tại. Vui lòng chọn lại.';
  return fallback;
}
