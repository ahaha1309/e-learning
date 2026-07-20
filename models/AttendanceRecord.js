const mongoose = require('mongoose');
const { Schema } = mongoose;

const attendanceRecordSchema = new Schema(
  {
    session: {
      type: Schema.Types.ObjectId,
      ref: 'AttendanceSession',
      required: true,
      index: true,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'excused'],
      default: 'present',
    },
    time: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Prevent a student from having multiple records in the same session
attendanceRecordSchema.index({ session: 1, student: 1 }, { unique: true });
attendanceRecordSchema.index({ session: 1, status: 1 });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
