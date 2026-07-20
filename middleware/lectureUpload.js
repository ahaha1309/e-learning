const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'lectures');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, uploadsDir);
  },
  filename(req, file, callback) {
    const timestamp = Date.now();
    const safeBaseName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
    callback(null, `${timestamp}-${safeBaseName}`);
  },
});

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'video/webm',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/zip',
]);

function lectureFileFilter(req, file, callback) {
  if (allowedMimeTypes.has(file.mimetype)) {
    return callback(null, true);
  }
  return callback(new Error('Invalid lecture file type. Allowed: PDF, DOC, PPT, MP4, images, ZIP'));
}

const uploadLectureAsset = multer({
  storage,
  fileFilter: lectureFileFilter,
  limits: { fileSize: 200 * 1024 * 1024 },
}).single('assetFile');

module.exports = { uploadLectureAsset };
