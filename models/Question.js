const mongoose = require('mongoose');

const { Schema } = mongoose;

const questionSchema = new Schema(
  {
    exam: {
      type: Schema.Types.ObjectId,
      ref: 'Exam',
      index: true,
    },
    assignment: {
      type: Schema.Types.ObjectId,
      ref: 'Assignment',
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
    outcomeMappings: [
      {
        clo: { type: Schema.Types.ObjectId, ref: 'Outcome' },
        weight: { type: Number, default: 1 },
      },
    ],
    isCoding: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

questionSchema.index({ exam: 1, order: 1 });
questionSchema.index({ assignment: 1, order: 1 });

questionSchema.pre('save', async function (next) {
  if (this.isNew) {
    if (this.exam) {
      const Exam = mongoose.model('Exam');
      await Exam.findByIdAndUpdate(this.exam, { $inc: { questionCount: 1 } });
    } else if (this.assignment) {
      const Assignment = mongoose.model('Assignment');
      await Assignment.findByIdAndUpdate(this.assignment, { $inc: { questionCount: 1 } });
    }
  }
  next();
});

questionSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    if (doc.exam) {
      const Exam = mongoose.model('Exam');
      await Exam.findByIdAndUpdate(doc.exam, { $inc: { questionCount: -1 } });
    } else if (doc.assignment) {
      const Assignment = mongoose.model('Assignment');
      await Assignment.findByIdAndUpdate(doc.assignment, { $inc: { questionCount: -1 } });
    }
  }
});

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;
