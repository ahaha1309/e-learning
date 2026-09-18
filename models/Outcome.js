const mongoose = require('mongoose');
const { Schema } = mongoose;

const outcomeSchema = new Schema({
  code: { type: String, required: true },      // "CLO1", "PLO3"
  type: { type: String, enum: ['PLO', 'CLO'], required: true },
  description: String,
  program: { type: String },                    // Academic program (optional)
  classroom: { type: Schema.Types.ObjectId, ref: 'Classroom', index: true }, // Associated classroom for CLO
  mappedPLOs: [{                                // CLO mapping to PLO
    plo: { type: Schema.Types.ObjectId, ref: 'Outcome' },
    weight: { type: Number, default: 1 }         // Weight contribution
  }],
  passThreshold: { type: Number, default: 50 }  // Minimum % to pass (default 50%)
}, {
  timestamps: true,
  versionKey: false
});

// A compound index to avoid duplicate codes within the same classroom or program
outcomeSchema.index({ code: 1, classroom: 1 }, { unique: true, sparse: true });

const Outcome = mongoose.model('Outcome', outcomeSchema);
module.exports = Outcome;
