const mongoose = require('mongoose');

const { Schema } = mongoose;

const assignmentSchema = new Schema(
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
      maxlength: 180,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
    },
    totalPoints: {
      type: Number,
      default: 10,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    allowLateSubmission: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: ['upload', 'quiz'],
      default: 'upload',
    },
    questionCount: {
      type: Number,
      default: 0,
    },
    // Optional Rubric used for criteria-based grading. null = freehand point
    // grading (the historical path). The gradebook reads submission.score
    // regardless of which grading path produced it.
    rubric: {
      type: Schema.Types.ObjectId,
      ref: 'Rubric',
      default: null,
    },
    // Attached files uploaded by Teacher (guides, sample code, problem sheets, PDFs, etc.)
    attachments: [
      {
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileType: { type: String, default: 'file' },
        fileSize: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

assignmentSchema.index({ classroom: 1, dueDate: 1 });

const Assignment = mongoose.model('Assignment', assignmentSchema);

module.exports = Assignment;
