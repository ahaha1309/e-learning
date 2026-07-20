const mongoose = require('mongoose');

const { Schema } = mongoose;

// Tracks WHICH content items a student has completed (lessons, assignments,
// exams). Unlock/locked status is never stored; it is always recomputed from
// this collection at request time (see services/courseProgress.service.js).
//
// `score`/`maxScore`/`submittedAt` are optional evidence fields used by the
// gradebook and completion-rule engine. They are only written by graded content
// (assignments/exams); lectures leave them null. They do NOT affect the unique
// completion identity defined below.
const studentProgressSchema = new Schema(
  {
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
    itemType: {
      type: String,
      enum: ['LESSON', 'QUIZ', 'ASSIGNMENT', 'EXAM'],
      required: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
    // Evidence written by graded content. Null for LESSON rows.
    score: {
      type: Number,
      default: null,
    },
    maxScore: {
      type: Number,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// One completion record per (student, classroom, item).
studentProgressSchema.index(
  { classroom: 1, student: 1, itemType: 1, itemId: 1 },
  { unique: true }
);

// Gradebook completion-rule engines scan a student's classroom completion;
// this 2-field index covers that access path (the unique 4-field index above
// also covers it as a prefix, but declaring it explicitly documents the query).
studentProgressSchema.index({ classroom: 1, student: 1 });

const StudentProgress = mongoose.model('StudentProgress', studentProgressSchema);

module.exports = StudentProgress;
