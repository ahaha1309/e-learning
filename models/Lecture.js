const mongoose = require('mongoose');

const { Schema } = mongoose;

const lectureSchema = new Schema(
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
    chapterTitle: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    summary: {
      type: String,
      trim: true,
      default: '',
    },
    content: {
      type: String,
      trim: true,
      default: '',
    },
    resourceUrl: {
      type: String,
      trim: true,
      default: '',
    },
    resourceType: {
      type: String,
      enum: ['pdf', 'ppt', 'video', 'document', 'link', 'text'],
      default: 'text',
    },
    orderIndex: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

lectureSchema.index({ classroom: 1, chapterTitle: 1, orderIndex: 1 });

const Lecture = mongoose.model('Lecture', lectureSchema);

module.exports = Lecture;
