const mongoose = require('mongoose');

const { Schema } = mongoose;

const classroomMemberSchema = new Schema(
  {
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'left'],
      default: 'pending',
    },
    attendanceScore: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },
    manualMidtermScore: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },
    useManualMidterm: {
      type: Boolean,
      default: false,
    },
    manualFinalScore: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },
    useManualFinal: {
      type: Boolean,
      default: false,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

classroomMemberSchema.index({ classroom: 1, student: 1 }, { unique: true });

const ClassroomMember = mongoose.model('ClassroomMember', classroomMemberSchema);

module.exports = ClassroomMember;
