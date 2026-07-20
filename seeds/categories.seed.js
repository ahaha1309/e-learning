/**
 * seeds/categories.seed.js
 *
 * Run once on startup (idempotent — skips if categories already exist).
 * Creates default categories AND auto-assigns them to existing classrooms
 * that have no category set yet, using keyword matching on the classroom name.
 */

const Category = require('../models/Category');
const Classroom = require('../models/Classroom');

const DEFAULT_CATEGORIES = [
  { name: 'Lập trình & CNTT', slug: 'lap-trinh-cntt', icon: 'ph-bold ph-code', description: 'Lập trình, phát triển phần mềm, kỹ thuật máy tính và hệ thống.' },
  { name: 'Toán học', slug: 'toan-hoc', icon: 'ph-bold ph-math-operations', description: 'Giải tích, đại số, thống kê và các nhánh toán học ứng dụng.' },
  { name: 'Khoa học Tự nhiên', slug: 'khoa-hoc-tu-nhien', icon: 'ph-bold ph-flask', description: 'Vật lý, hóa học, sinh học và khoa học tự nhiên.' },
  { name: 'Ngoại ngữ', slug: 'ngoai-ngu', icon: 'ph-bold ph-globe', description: 'Tiếng Anh, tiếng Nhật, tiếng Trung và các ngoại ngữ khác.' },
  { name: 'Kinh tế & Kinh doanh', slug: 'kinh-te-kinh-doanh', icon: 'ph-bold ph-chart-line-up', description: 'Kinh tế học, quản trị kinh doanh, tài chính và marketing.' },
  { name: 'Thiết kế & Nghệ thuật', slug: 'thiet-ke-nghe-thuat', icon: 'ph-bold ph-paint-brush', description: 'Thiết kế đồ họa, UI/UX, mỹ thuật và âm nhạc.' },
  { name: 'Khoa học Xã hội', slug: 'khoa-hoc-xa-hoi', icon: 'ph-bold ph-users-three', description: 'Xã hội học, tâm lý học, lịch sử và văn hóa.' },
  { name: 'Kỹ thuật & Công nghệ', slug: 'ky-thuat-cong-nghe', icon: 'ph-bold ph-gear', description: 'Điện tử, cơ khí, tự động hóa và công nghệ kỹ thuật.' },
];

// Keyword → category slug mapping for auto-assignment
const KEYWORD_MAP = [
  { keywords: ['lập trình', 'python', 'java', 'javascript', 'web', 'c++', 'c#', 'php', 'react', 'node', 'database', 'sql', 'máy tính', 'phần mềm', 'hệ điều hành', 'mạng', 'trí tuệ nhân tạo', 'ai', 'machine learning', 'học máy', 'deep learning', 'data', 'cntt', 'công nghệ thông tin', 'algorithm', 'cấu trúc dữ liệu'], slug: 'lap-trinh-cntt' },
  { keywords: ['toán', 'giải tích', 'đại số', 'thống kê', 'xác suất', 'vi tích phân', 'số học', 'hình học', 'ma trận', 'cao cấp'], slug: 'toan-hoc' },
  { keywords: ['vật lý', 'hóa học', 'sinh học', 'hóa', 'vật lí', 'khoa học', 'quang học', 'nhiệt học'], slug: 'khoa-hoc-tu-nhien' },
  { keywords: ['tiếng anh', 'tiếng nhật', 'tiếng trung', 'tiếng pháp', 'tiếng hàn', 'ngoại ngữ', 'english', 'japanese', 'ielts', 'toeic', 'ngôn ngữ'], slug: 'ngoai-ngu' },
  { keywords: ['kinh tế', 'kinh doanh', 'marketing', 'quản trị', 'tài chính', 'kế toán', 'ngân hàng', 'thương mại', 'doanh nghiệp'], slug: 'kinh-te-kinh-doanh' },
  { keywords: ['thiết kế', 'đồ họa', 'photoshop', 'ui', 'ux', 'illustrator', 'nghệ thuật', 'âm nhạc', 'hội họa'], slug: 'thiet-ke-nghe-thuat' },
  { keywords: ['xã hội', 'tâm lý', 'lịch sử', 'địa lý', 'văn hóa', 'triết học', 'văn học', 'chính trị'], slug: 'khoa-hoc-xa-hoi' },
  { keywords: ['điện tử', 'cơ khí', 'tự động', 'robot', 'điện', 'kỹ thuật', 'xây dựng', 'môi trường'], slug: 'ky-thuat-cong-nghe' },
];

function detectCategory(name, categoryMap) {
  const lower = (name || '').toLowerCase();
  for (const { keywords, slug } of KEYWORD_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return categoryMap[slug] || null;
    }
  }
  return null;
}

async function seedCategories() {
  try {
    // ── Step 1: Upsert default categories ──────────────────
    const upsertResults = await Promise.all(
      DEFAULT_CATEGORIES.map((cat) =>
        Category.findOneAndUpdate(
          { slug: cat.slug },
          { $setOnInsert: cat },
          { upsert: true, new: true }
        )
      )
    );

    // Build slug → _id map
    const categoryMap = {};
    for (const cat of upsertResults) {
      categoryMap[cat.slug] = cat._id;
    }

    const newCount = upsertResults.filter((c) => !c.__v && c.createdAt >= new Date(Date.now() - 5000)).length;
    if (newCount > 0) {
      console.log(`[seed] Created ${DEFAULT_CATEGORIES.length} default categories`);
    }

    // ── Step 2: Auto-assign to classrooms that have no category ──
    const unassigned = await Classroom.find({ $or: [{ category: null }, { category: { $exists: false } }] });

    let assigned = 0;
    for (const classroom of unassigned) {
      const catId = detectCategory(classroom.name, categoryMap);
      if (catId) {
        classroom.category = catId;
        await classroom.save();
        assigned++;
      }
    }

    if (assigned > 0) {
      console.log(`[seed] Auto-assigned categories to ${assigned} classroom(s)`);
    }
  } catch (err) {
    // Non-fatal: seed failure must not crash the server
    console.error('[seed] Category seed error:', err.message);
  }
}

module.exports = { seedCategories };
