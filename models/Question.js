const mongoose = require('mongoose');

const { Schema } = mongoose;

const questionSchema = new Schema(
  {
    exam: {
      type: Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true,
    },
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
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

questionSchema.index({ exam: 1, order: 1 });

questionSchema.pre('save', async function (next) {
  if (this.isNew) {
    const Exam = mongoose.model('Exam');
    await Exam.findByIdAndUpdate(this.exam, { $inc: { questionCount: 1, totalPoints: this.points } });
  }
  next();
});

questionSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    const Exam = mongoose.model('Exam');
    await Exam.findByIdAndUpdate(doc.exam, { $inc: { questionCount: -1, totalPoints: -doc.points } });
  }
});

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;
