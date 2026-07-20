const mongoose = require('mongoose');

const { Schema } = mongoose;

const questionBankSchema = new Schema(
  {
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    chapter: {
      type: String,
      required: true,
      trim: true,
    },
    difficulty: {
      type: String,
      enum: ['nhan_biet', 'thong_hieu', 'van_dung'],
      default: 'nhan_biet',
      required: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      }
    ],
    type: {
      type: String,
      enum: ['multiple_choice', 'multiple_answer', 'essay'],
      required: true,
      default: 'multiple_choice',
    },
    content: {
      type: String,
      required: true,
    },
    options: [
      {
        text: { type: String, required: true },
        isCorrect: { type: Boolean, default: false },
      },
    ],
    points: {
      type: Number,
      default: 1,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

questionBankSchema.index({ teacher: 1, subject: 1, chapter: 1, difficulty: 1 });

const QuestionBank = mongoose.model('QuestionBank', questionBankSchema);

module.exports = QuestionBank;
