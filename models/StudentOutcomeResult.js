const mongoose = require('mongoose');
const { Schema } = mongoose;

const studentOutcomeResultSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  outcome: { type: Schema.Types.ObjectId, ref: 'Outcome', required: true, index: true }, // CLO or PLO
  classroom: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
  achievedPercent: { type: Number, default: 0 },
  isPassed: { type: Boolean, default: false },
  lastCalculatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  versionKey: false
});

// Compound unique constraint to avoid duplicate cache documents per student-outcome-classroom
studentOutcomeResultSchema.index({ student: 1, outcome: 1, classroom: 1 }, { unique: true });

const StudentOutcomeResult = mongoose.model('StudentOutcomeResult', studentOutcomeResultSchema);
module.exports = StudentOutcomeResult;
