const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * A Certificate is an immutable record of course completion + passing grade at
 * the moment of issuance. It is created by services/certificate.service.js when
 * services/completion.service.js reports {isComplete, isPassing} for the
 * student/classroom. The snapshot fields (studentName, classroomName,
 * finalPercent, letterGrade, completionSnapshot) are NEVER updated after issue —
 * editing the classroom or re-grading later must not mutate a certificate a
 * student may have already shared or had verified.
 *
 * Authentication/verification: the public `/certificates/verify/:certificateNo`
 * route reads by certificateNo with no auth, so the cert number carries the
 * trust. Revocation (revokedAt) is the only mutation after issue, by an admin.
 */
const certificateSchema = new Schema(
  {
    issuedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    classroom: {
      type: Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
      index: true,
    },
    // Immutable snapshots of display data at issue time.
    studentName: { type: String, required: true, trim: true },
    classroomName: { type: String, required: true, trim: true },
    finalPercent: { type: Number, default: null },
    letterGrade: { type: String, default: null },
    // Frozen completion-rule evidence (what rules were checked + missing list
    // was empty at issue). For audit/verification transparency.
    completionSnapshot: {
      isComplete: { type: Boolean, default: true },
      isPassing: { type: Boolean, default: true },
      met: { type: [String], default: [] },
      rules: { type: Schema.Types.Mixed, default: {} },
    },
    certificateNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, trim: true, default: '' },
    // Cloudinary secure_url of the rendered PDF, resource_type: 'raw'. null
    // means the cert is valid but the PDF is not yet generated (submission
    // occurred in an environment without Puppeteer/Chromium). The verify page
    // and cert record are the source of truth; the PDF is presentation.
    pdfUrl: { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Lookup by issuer, lookup by classroom for admin. The active-currency guard
// (one non-revoked cert per student/classroom) is enforced in the service
// layer by querying first + treating E11000 as a backstop.
certificateSchema.index({ issuedTo: 1, classroom: 1, revokedAt: 1 });

const Certificate = mongoose.model('Certificate', certificateSchema);

module.exports = Certificate;
