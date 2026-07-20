const mongoose = require('mongoose');

const { Schema } = mongoose;

const examSubmissionSchema = new Schema(
  {
    exam: {
      type: Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
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
        teacherComment: {
          type: String,
        },
      },
    ],
    score: {
      type: Number,
      default: 0,
    },
    essayScore: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'graded', 'late', 'auto_submitted'],
      default: 'in_progress',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    // Server-side deadline, computed once at take time as startedAt + exam.duration.
    // Enforced on submit regardless of client timers. null when the exam has no
    // duration limit (exam.duration === 0) — a no-deadline exam.
    deadlineAt: {
      type: Date,
      default: null,
    },
    // 1-based attempt ordinal for this exam/student. Combined with the unique
    // index below it makes attempt identity explicit (the legacy non-unique
    // {exam,student} index could allow duplicate in_progress rows).
    attemptNumber: {
      type: Number,
      default: 1,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    violations: [
      {
        type: { type: String, enum: ['blur', 'fullscreen_exit', 'copy', 'paste', 'tab_switch', 'right_click'] },
        time: { type: Date },
        details: { type: String },
      },
    ],
    gradingStatus: {
      type: String,
      enum: ['in_progress', 'auto_graded', 'pending_manual_grade', 'fully_graded'],
      default: 'in_progress',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Reading pattern: list a student's submissions for an exam, newest first.
examSubmissionSchema.index({ exam: 1, student: 1, submittedAt: -1 });

// One in-flight attempt per (exam, student, attemptNumber). Prevents the
// race where two concurrent take-exam requests each create an in_progress row.
examSubmissionSchema.index(
  { exam: 1, student: 1, attemptNumber: 1 },
  { unique: true }
);

// Grading queue + auto-submit sweep scan by status; compound covers the
// common "in_progress attempts past their deadline" sweep.
examSubmissionSchema.index({ exam: 1, status: 1 });

const ExamSubmission = mongoose.model('ExamSubmission', examSubmissionSchema);

module.exports = ExamSubmission;
