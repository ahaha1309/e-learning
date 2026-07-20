const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');

// Single, project-wide image upload pipeline.
// Flow:  multer.memoryStorage (no local disk writes)
//        ->  uploadImageBuffer(file, folder)
//        ->  Cloudinary returns secure_url
//        ->  controller stores only secure_url in MongoDB

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// Reuse the project's existing upload size limit from settings where possible,
// fall back to 5 MB for avatars/logos/favicons.
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function imageFileFilter(req, file, callback) {
  if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
    return callback(null, true);
  }
  return callback(
    new Error(
      'Invalid image format. Allowed: JPG, JPEG, PNG, GIF, WEBP.'
    )
  );
}

const storage = multer.memoryStorage();

/*
 * Builds a multer middleware that accepts one or more image file fields.
 * @param {string[]} fields - form field names, e.g. ['avatar'] or ['logo', 'favicon']
 */
function buildImageUpload(fields) {
  const multerFields = fields.map((name) => ({ name, maxCount: 1 }));
  return multer({
    storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: MAX_IMAGE_SIZE },
  }).fields(multerFields);
}

/*
 * Uploads a single in-memory file to Cloudinary and returns ONLY the secure_url.
 * Pass a `folder` so each image class is isolated in the Cloudinary media library.
 */
function uploadImageBuffer(file, folder) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return resolve(null);
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        unique_filename: true,
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(result ? result.secure_url : null);
      }
    );

    const readable = new Readable();
    readable._read = () => {};
    readable.push(file.buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}

module.exports = {
  buildImageUpload,
  uploadImageBuffer,
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_SIZE,
};
