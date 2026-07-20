const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mongoose = require('mongoose');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: {
      type: String,
      select: false,
      default: null,
    },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'student'],
      default: 'student',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'rejected'],
      default: function setDefaultStatus() {
        return this.role === 'teacher' ? 'pending' : 'active';
      },
    },
    provider: {
      type: String,
      enum: ['local', 'google', 'facebook'],
      default: 'local',
    },
    providerId: {
      type: String,
      default: null,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    refreshTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
  this.passwordChangedAt = new Date();
};

userSchema.methods.comparePassword = function comparePassword(password) {
  if (!this.passwordHash) {
    return false;
  }

  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.setRefreshToken = function setRefreshToken(token) {
  this.refreshTokenHash = crypto.createHash('sha256').update(token).digest('hex');
};

userSchema.methods.matchesRefreshToken = function matchesRefreshToken(token) {
  const incomingHash = crypto.createHash('sha256').update(token).digest('hex');
  return this.refreshTokenHash === incomingHash;
};

userSchema.methods.clearRefreshToken = function clearRefreshToken() {
  this.refreshTokenHash = null;
};

userSchema.virtual('isApproved').get(function isApproved() {
  return this.status === 'active';
});

userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.refreshTokenHash;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
