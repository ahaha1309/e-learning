const mongoose = require('mongoose');

const { Schema } = mongoose;

// A criterion in a rubric. `maxPoints` is the cap for that criterion; the teacher
// awards any value 0..maxPoints. `scale` is an optional labeled scoring guide
// (e.g. [{points:4,label:'Mastery'},{points:3,label:'Proficient'}]) rendered as
// quick-pick buttons in the grading UI.
const rubricCriterionSchema = new Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    maxPoints: {
      type: Number,
      required: true,
      min: 0,
    },
    scale: [
      {
        points: { type: Number, min: 0 },
        label: { type: String, trim: true },
      },
    ],
  },
  { _id: true }
);

const rubricSchema = new Schema(
  {
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
    },
    // Authoring owner for scoping + RBAC (a teacher sees their own rubrics).
    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
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
    criteria: [rubricCriterionSchema],
    // Denormalized sum of criteria.maxPoints for quick display; reconciled on
    // save so it can never drift.
    maxPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Keep maxPoints in sync with the sum of criteria. One place, can't drift.
rubricSchema.pre('validate', function reconcileMaxPoints(next) {
  this.maxPoints = (this.criteria || []).reduce((sum, c) => sum + (Number(c.maxPoints) || 0), 0);
  next();
});

const Rubric = mongoose.model('Rubric', rubricSchema);

module.exports = Rubric;
