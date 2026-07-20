const mongoose = require('mongoose');

const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    icon: {
      type: String,
      trim: true,
      default: 'ph-folder',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

categorySchema.set('toJSON', {
  transform(doc, ret) {
    return ret;
  },
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
