const mongoose = require('mongoose');
const { Schema } = mongoose;

const discussionReplySchema = new Schema(
  {
    topic: {
      type: Schema.Types.ObjectId,
      ref: 'DiscussionTopic',
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

discussionReplySchema.index({ topic: 1, createdAt: 1 });

// Middleware to update replyCount on save and remove
discussionReplySchema.post('save', async function(doc) {
  const DiscussionTopic = mongoose.model('DiscussionTopic');
  await DiscussionTopic.findByIdAndUpdate(doc.topic, { $inc: { replyCount: 1 } });
});

discussionReplySchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    const DiscussionTopic = mongoose.model('DiscussionTopic');
    await DiscussionTopic.findByIdAndUpdate(doc.topic, { $inc: { replyCount: -1 } });
  }
});

module.exports = mongoose.model('DiscussionReply', discussionReplySchema);
