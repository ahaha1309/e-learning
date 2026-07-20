const mongoose = require('mongoose');
const { Schema } = mongoose;

const discussionTopicSchema = new Schema(
  {
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    replyCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

discussionTopicSchema.index({ classroom: 1, isPinned: -1, createdAt: -1 });

module.exports = mongoose.model('DiscussionTopic', discussionTopicSchema);
