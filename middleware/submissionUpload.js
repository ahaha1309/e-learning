const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'submissions');

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
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/zip',
]);

function submissionFileFilter(req, file, callback) {
  if (allowedMimeTypes.has(file.mimetype)) {
    return callback(null, true);
  }

  return callback(new Error('Invalid submission file type.'));
}

const uploadSubmissionFile = multer({
  storage,
  fileFilter: submissionFileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
}).single('attachment');

function resolveSubmissionAttachment(file) {
  if (!file) {
    return {
      name: '',
      url: '',
      mimeType: '',
      size: 0,
    };
  }

  return {
    name: file.originalname || file.filename,
    url: `/uploads/submissions/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
  };
}

module.exports = {
  uploadSubmissionFile,
  resolveSubmissionAttachment,
};
