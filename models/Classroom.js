const crypto = require('crypto');
const mongoose = require('mongoose');

const { Schema } = mongoose;

function generateClassroomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

const classroomSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    approvalRequired: {
      type: Boolean,
      default: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Gradebook weighting. null = unweighted simple average across all scored
    // items. When present, each {itemType, weight} contributes that item type's
    // average % times weight to the overall (weights need not sum to 1; they are
    // normalized). Backward compatible: pre-existing classrooms default to null.
    gradeWeights: [
      {
        itemType: {
          type: String,
          enum: ['LESSON', 'QUIZ', 'ASSIGNMENT', 'EXAM'],
          required: true,
        },
        weight: {
          type: Number,
          default: 1,
          min: 0,
        },
      },
    ],
    // Optional letter scale applied to the overall percent. Empty = percent
    // only, no letter. Treated as sorted on min desc at read time.
    gradingScale: [
      {
        letter: { type: String, required: true, trim: true },
        min: { type: Number, required: true, min: 0, max: 100 },
      },
    ],
    // Course-level completion rules consumed by services/completion.service.js
    // and the certificate issuance engine (Phase D). All optional and default
    // to "lenient" so pre-existing classrooms remain valid:
    //   - requireAllItems: every published item must have a completion row
    //   - minOverallPercent: gradebook overall % must meet this floor (null=none)
    //   - requiredItemTypes: each listed type must have at least one passing row
    completionRules: {
      requireAllItems: {
        type: Boolean,
        default: false,
      },
      minOverallPercent: {
        type: Number,
        default: null,
        min: 0,
        max: 100,
      },
      // null/[] = no per-type requirement.
      requiredItemTypes: {
        type: [
          {
            type: String,
            enum: ['LESSON', 'QUIZ', 'ASSIGNMENT', 'EXAM'],
          },
        ],
        default: [],
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

classroomSchema.pre('validate', function ensureClassroomCode(next) {
  if (!this.code) {
    this.code = generateClassroomCode();
  }

  next();
});

classroomSchema.set('toJSON', {
  transform(doc, ret) {
    return ret;
  },
});

const Classroom = mongoose.model('Classroom', classroomSchema);

module.exports = Classroom;
