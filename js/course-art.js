// Ảnh minh họa theo lĩnh vực (SVG trong assets/images/categories).
// Dùng cho thẻ danh mục ở trang chủ và làm ảnh dự phòng khi khóa học chưa có thumbnail hoặc ảnh lỗi.
// Chỉ đổi ảnh hiển thị trên trình duyệt, KHÔNG ghi gì vào database.
import { slugify } from './utils.js?v=202610172049';

const ART_DIR = 'assets/images/categories';
const DEFAULT_ART = `${ART_DIR}/general.svg`;

// So khớp theo tên lĩnh vực đã bỏ dấu (slugify). Thứ tự quan trọng: nhóm đứng trước được ưu tiên.
const CATEGORY_ART = [
  { file: 'numerology', keywords: ['than-so-hoc', 'so-hoc', 'numerology', 'chiem-tinh', 'tu-vi', 'phong-thuy', 'tarot'] },
  { file: 'technology', keywords: ['ai', 'tri-tue-nhan-tao', 'chatgpt', 'cong-nghe', 'lap-trinh', 'tin-hoc', 'cntt', 'may-tinh', 'code', 'coding', 'python', 'javascript', 'web', 'du-lieu', 'data', 'tu-dong-hoa', 'automation', 'excel'] },
  { file: 'language', keywords: ['ngoai-ngu', 'ngon-ngu', 'tieng', 'english', 'ielts', 'toeic'] },
  { file: 'finance', keywords: ['tai-chinh', 'dau-tu', 'chung-khoan', 'ke-toan', 'kinh-te', 'ngan-hang', 'crypto', 'finance'] },
  { file: 'marketing', keywords: ['marketing', 'ban-hang', 'kinh-doanh', 'quang-cao', 'mang-xa-hoi', 'facebook', 'tiktok', 'seo', 'thuong-mai-dien-tu', 'sales', 'content'] },
  { file: 'design', keywords: ['thiet-ke', 'do-hoa', 'design', 'photoshop', 'canva', 'my-thuat', 'hoi-hoa', 've-tranh', 'nhiep-anh', 'dung-video', 'sang-tao'] },
  { file: 'personal-development', keywords: ['ky-nang', 'phat-trien-ban-than', 'ban-than', 'tu-duy', 'lanh-dao', 'giao-tiep', 'quan-ly-thoi-gian', 'tam-ly', 'thanh-cong'] },
];

// Khớp nguyên cụm từ (vd "ai" không khớp "tai-chinh")
function hasKeyword(slug, keyword) {
  return `-${slug}-`.includes(`-${keyword}-`);
}

export function getCategoryArt(categoryName) {
  const slug = slugify(categoryName || '');
  if (!slug) return DEFAULT_ART;
  const match = CATEGORY_ART.find((group) => group.keywords.some((keyword) => hasKeyword(slug, keyword)));
  return match ? `${ART_DIR}/${match.file}.svg` : DEFAULT_ART;
}

// Ảnh khóa học: ưu tiên thumbnail thật; chưa có hoặc tải lỗi thì dùng ảnh theo lĩnh vực
export function setCourseImage(image, thumbnailUrl, categoryName) {
  const fallback = getCategoryArt(categoryName);
  image.src = thumbnailUrl || fallback;
  image.addEventListener('error', () => {
    if (!image.src.endsWith(fallback)) image.src = fallback;
  }, { once: true });
}
