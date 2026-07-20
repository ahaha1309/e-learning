const { v2: cloudinary } = require('cloudinary');

// Reuses env vars already present in .env: CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET.
// Do not recreate or duplicate this configuration elsewhere.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
