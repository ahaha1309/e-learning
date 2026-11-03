'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const os = require('os');

// Use OS temp dir for AI processing — files are cleaned up after generation
const tmpDir = path.join(os.tmpdir(), 'elearning-ai-uploads');

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.pptx'];

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, tmpDir);
  },
  filename(req, file, cb) {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
    cb(null, `${ts}-${safe}`);
  },
});

function aiDocFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME_TYPES.has(file.mimetype) || ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(null, true);
  }
  return cb(
    new Error(
      'Định dạng tệp không được hỗ trợ. Vui lòng tải lên PDF, DOCX, TXT, hoặc PPTX.'
    )
  );
}

/**
 * Single-file upload middleware for AI question generation documents.
 * Field name: 'document'
 * Max size: 30 MB (Gemini context limit buffer)
 */
const uploadAiDoc = multer({
  storage,
  fileFilter: aiDocFileFilter,
  limits: { fileSize: 30 * 1024 * 1024 },
}).single('document');

/**
 * Safely delete a temporary file created by this middleware.
 * Call after the AI processing step completes or fails.
 * @param {string} filePath
 */
function cleanupTempFile(filePath) {
  if (!filePath) return;
  // Ensure path is inside the expected temp directory (path traversal guard)
  const resolved = path.resolve(filePath);
  const tmpResolved = path.resolve(tmpDir);
  if (!resolved.startsWith(tmpResolved)) return;

  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('[aiDocUpload] Failed to delete temp file:', filePath, err.message);
    }
  });
}

module.exports = { uploadAiDoc, cleanupTempFile };
