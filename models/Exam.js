const mongoose = require('mongoose');

const { Schema } = mongoose;

const examSchema = new Schema(
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
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: ['quiz', 'upload'],
      default: 'quiz',
    },
    examCategory: {
      type: String,
      enum: ['NORMAL', 'MIDTERM', 'FINAL'],
      default: 'NORMAL',
    },
    instructions: {
      type: String,
      default: '',
    },
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number,
        uploadedAt: Date,
      },
    ],
    duration: {
      type: Number,
      default: 60, // in minutes, 0 means unlimited
      min: 0,
    },
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    password: {
      type: String,
      default: '',
    },
    maxAttempts: {
      type: Number,
      default: 1, // 0 means unlimited
      min: 0,
    },
    showResult: {
      type: String,
      enum: ['none', 'after_submit', 'after_exam_ends'],
      default: 'after_submit',
    },
    strictMode: {
      type: Boolean,
      default: false,
    },
    isCoding: {
      type: Boolean,
      default: false,
    },
    maxViolations: {
      type: Number,
      default: 0, // 0 means no auto-submit
    },
    shuffle: {
      type: Boolean,
      default: false,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    totalPoints: {
      type: Number,
      default: 0,
    },
    questionCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

examSchema.index({ classroom: 1, isPublished: 1 });

const Exam = mongoose.model('Exam', examSchema);

module.exports = Exam;
