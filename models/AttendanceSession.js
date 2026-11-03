const crypto = require('crypto');
const mongoose = require('mongoose');
const { Schema } = mongoose;

const attendanceSessionSchema = new Schema(
  {
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
    },
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
    },
    // 'code' = mã PIN 6 số, 'qr' = quét mã QR
    method: {
      type: String,
      enum: ['code', 'qr'],
      default: 'code',
    },
    currentCode: {
      type: String,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

attendanceSessionSchema.index({ classroom: 1, status: 1, date: -1 });

// Method to generate a new check-in code.
// - 'code': random 6-digit PIN, expires in 15 seconds
// - 'qr': random token embedded in the QR URL, expires in 30 seconds
//   (longer so students have time to scan and open the link on their phone)
attendanceSessionSchema.methods.generateNewCode = function () {
  if (this.method === 'qr') {
    this.currentCode = crypto.randomBytes(16).toString('hex');
    this.expiresAt = new Date(Date.now() + 30 * 1000);
    return this.currentCode;
  }
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.currentCode = code;
  // Expire in 15 seconds
  this.expiresAt = new Date(Date.now() + 15 * 1000);
  return code;
};

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
