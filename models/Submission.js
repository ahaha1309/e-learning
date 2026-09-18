const mongoose = require('mongoose');

const { Schema } = mongoose;

const submissionFileSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
      default: '',
    },
    url: {
      type: String,
      trim: true,
      default: '',
    },
    mimeType: {
      type: String,
      trim: true,
      default: '',
    },
    size: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  }
);

const submissionSchema = new Schema(
  {
    assignment: {
      type: Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
      index: true,
    },
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
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    textAnswer: {
      type: String,
      trim: true,
      default: '',
    },
    attachment: {
      type: submissionFileSchema,
      default: () => ({}),
    },
    answers: [
      {
        question: {
          type: Schema.Types.ObjectId,
          ref: 'Question',
        },
        selectedOptions: [
          {
            type: Schema.Types.ObjectId,
          },
        ],
        text: {
          type: String,
          default: '',
        },
        isCorrect: {
          type: Boolean,
          default: false,
        },
        pointsAchieved: {
          type: Number,
          default: 0,
        },
      },
    ],
    status: {
      type: String,
      enum: ['draft', 'submitted', 'graded', 'returned'],
      default: 'submitted',
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    score: {
      type: Number,
      default: null,
    },
    teacherComment: {
      type: String,
      trim: true,
      default: '',
    },
    gradedAt: {
      type: Date,
      default: null,
    },
    // Per-criterion rubric grades, written only when the assignment has a
    // rubric. submission.score is the sum of criterion points (kept in sync
    // by services/grading.service.js). Empty for freehand-graded submissions.
    rubricGrades: [
      {
        criterion: { type: Schema.Types.ObjectId, ref: 'Rubric.criteria' },
        points: { type: Number, default: 0, min: 0 },
        comment: { type: String, trim: true, default: '' },
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

const Submission = mongoose.model('Submission', submissionSchema);

module.exports = Submission;
