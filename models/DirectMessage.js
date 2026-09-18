const mongoose = require('mongoose');
const { Schema } = mongoose;

const directMessageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      default: null,
      index: true,
    },
    content: {
      type: String,
      default: '',
      trim: true,
    },
    fileUrl: {
      type: String,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileType: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

directMessageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
directMessageSchema.index({ recipient: 1, isRead: 1 });

const DirectMessage = mongoose.model('DirectMessage', directMessageSchema);

module.exports = DirectMessage;
