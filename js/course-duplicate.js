// Sao chép khóa học: thông tin, chương, bài học. KHÔNG sao chép file video (bài học trỏ cùng video gốc).
// Bản sao luôn là DRAFT, có mã/slug mới và thumbnail riêng (copy file trong Storage).
import { supabase } from './supabase.js?v=202610171935';
import { BUCKETS, copyFile, getPathFromPublicUrl, getPublicUrl, removeFiles } from './storage.js?v=202610171935';
import { generateCourseCode } from './course-utils.js?v=202610171935';
import { slugify } from './utils.js?v=202610171935';

const TITLE_MAX_LENGTH = 200;
const COPY_SUFFIX = ' (bản sao)';

const COURSE_COLUMNS = 'id, title, slug, category_id, instructor_name, short_description, description, target_audience, learning_outcomes, requirements, level, language, thumbnail_url, price, sale_price, sort_order, course_sections(id, title, description, sort_order, course_lessons(video_id, title, description, sort_order, is_preview, is_active))';

async function fetchSourceCourse(courseId) {
  const { data, error } = await supabase.from('courses').select(COURSE_COLUMNS).eq('id', courseId).single();
  if (error) throw error;
  return data;
}

// Trả về URL thumbnail mới (file được copy), hoặc null nếu không copy được / không có thumbnail
async function copyThumbnail(thumbnailUrl, userId, copiedPaths) {
  const sourcePath = getPathFromPublicUrl(BUCKETS.thumbnails, thumbnailUrl);
  if (!sourcePath) return thumbnailUrl || null;
  const newPath = `${userId}/${Date.now()}-copy-${sourcePath.split('/').pop()}`;
  await copyFile(BUCKETS.thumbnails, sourcePath, newPath);
  copiedPaths.push(newPath);
  return getPublicUrl(BUCKETS.thumbnails, newPath);
}

async function insertCopy(source, userId, thumbnailUrl) {
  const { data, error } = await supabase
    .from('courses')
    .insert({
      code: generateCourseCode(),
      title: `${source.title.slice(0, TITLE_MAX_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`,
      slug: `${slugify(source.title) || 'khoa-hoc'}-copy-${Date.now().toString(36)}`,
      category_id: source.category_id,
      instructor_name: source.instructor_name,
      short_description: source.short_description,
      description: source.description,
      target_audience: source.target_audience,
      learning_outcomes: source.learning_outcomes,
      requirements: source.requirements,
      level: source.level,
      language: source.language,
      thumbnail_url: thumbnailUrl,
      price: source.price,
      sale_price: source.sale_price,
      sort_order: source.sort_order,
      status: 'DRAFT',
      created_by: userId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function copySections(source, newCourseId) {
  const sections = [...source.course_sections].sort((a, b) => a.sort_order - b.sort_order);
  for (const section of sections) {
    const { data, error } = await supabase
      .from('course_sections')
      .insert({
        course_id: newCourseId,
        title: section.title,
        description: section.description,
        sort_order: section.sort_order,
      })
      .select('id')
      .single();
    if (error) throw error;

    if (section.course_lessons.length === 0) continue;
    const { error: lessonError } = await supabase.from('course_lessons').insert(
      section.course_lessons.map((lesson) => ({
        section_id: data.id,
        video_id: lesson.video_id,
        title: lesson.title,
        description: lesson.description,
        sort_order: lesson.sort_order,
        is_preview: lesson.is_preview,
        is_active: lesson.is_active,
      })),
    );
    if (lessonError) throw lessonError;
  }
}

// Trả về { id, thumbnailCopied }. Lỗi giữa chừng sẽ dọn sạch khóa học và file đã tạo rồi throw.
export async function duplicateCourse(courseId, userId) {
  const source = await fetchSourceCourse(courseId);
  const copiedPaths = [];
  let newCourseId = null;
  let thumbnailCopied = true;

  try {
    let thumbnailUrl = null;
    try {
      thumbnailUrl = await copyThumbnail(source.thumbnail_url, userId, copiedPaths);
    } catch {
      thumbnailCopied = false;
    }
    newCourseId = await insertCopy(source, userId, thumbnailUrl);
    await copySections(source, newCourseId);
    return { id: newCourseId, thumbnailCopied };
  } catch (error) {
    // Xóa khóa học dở dang (chương/bài học xóa theo cascade) và thumbnail đã copy
    if (newCourseId) await supabase.from('courses').delete().eq('id', newCourseId);
    await removeFiles(BUCKETS.thumbnails, copiedPaths);
    throw error;
  }
}
