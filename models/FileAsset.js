const mongoose = require('mongoose');
const { Schema } = mongoose;

const fileAssetSchema = new Schema({
  bucket: { type: String, required: true },
  key: { type: String, required: true, index: true },             // S3/GCS object key
  originalName: { type: String, required: true },
  mimeType: { type: String },
  sizeBytes: { type: Number },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  classroom: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
  status: { 
    type: String, 
    enum: ['pending', 'scanning', 'uploaded', 'quarantined', 'failed'], 
    default: 'pending' 
  },
  scanResult: { type: String },
  uploadedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  versionKey: false
});

const FileAsset = mongoose.model('FileAsset', fileAssetSchema);
module.exports = FileAsset;
