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

// Method to generate a random 6-digit PIN and set expiry to 15 seconds from now
attendanceSessionSchema.methods.generateNewCode = function () {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.currentCode = code;
  // Expire in 15 seconds
  this.expiresAt = new Date(Date.now() + 15 * 1000);
  return code;
};

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
