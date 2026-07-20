const mongoose = require('mongoose');
const { Schema } = mongoose;

const chatMessageSchema = new Schema(
  {
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

chatMessageSchema.index({ classroom: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
