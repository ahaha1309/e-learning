const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'chat');

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

function getFileType(mimetype, filename) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.includes('pdf')) return 'pdf';
  if (mimetype.includes('word') || mimetype.includes('document')) return 'document';
  if (mimetype.includes('spreadsheet') || mimetype.includes('excel')) return 'spreadsheet';
  if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) return 'presentation';
  if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('tar')) return 'archive';
  return 'file';
}

const uploadChatFile = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
}).single('file');

function resolveChatFileAttachment(file) {
  if (!file) {
    return {
      fileUrl: null,
      fileName: null,
      fileType: null,
      fileSize: 0,
    };
  }

  return {
    fileUrl: `/uploads/chat/${file.filename}`,
    fileName: file.originalname || file.filename,
    fileType: getFileType(file.mimetype, file.originalname),
    fileSize: file.size,
  };
}

module.exports = {
  uploadChatFile,
  resolveChatFileAttachment,
};
