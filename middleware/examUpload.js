const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'exams');

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
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/octet-stream',
]);

function examFileFilter(req, file, callback) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.txt', '.zip', '.rar', '.7z', '.cpp', '.java', '.py', '.js', '.cs'];

  if (allowedMimeTypes.has(file.mimetype) || allowedExtensions.includes(ext)) {
    return callback(null, true);
  }
  return callback(new Error('Tệp đính kèm không hợp lệ. Chỉ chấp nhận các định dạng PDF, Word, Excel, PowerPoint, Ảnh, Text, ZIP, Code.'));
}

const uploadExamFile = multer({
  storage,
  fileFilter: examFileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
}).array('attachmentFiles', 5); // Allow up to 5 files per exam

module.exports = { uploadExamFile };
