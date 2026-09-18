const mongoose = require('mongoose');
const { Schema } = mongoose;

const meetingSchema = new Schema(
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
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      default: 60,
      min: 5,
      max: 1440,
    },
    status: {
      type: String,
      enum: ['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true,
    },
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

meetingSchema.index({ classroom: 1, status: 1, startTime: 1 });

const Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = Meeting;
