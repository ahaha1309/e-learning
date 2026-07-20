const StudentProgress = require('../models/StudentProgress');
const { CONTENT_TYPES } = require('../services/courseProgress.service');

/**
 * Records completion of a content item for a student. Idempotent: the unique
 * index on StudentProgress { classroom, student, itemType, itemId } guarantees
 * one row per (student, item), so re-recording just refreshes `completedAt`.
 *
 * This is the single write path for the completion ledger. Lectures,
 * assignments, and exams all funnel through here. It is the data foundation
 * for the computed course-progress tree (services/courseProgress.service.js),
 * the gradebook, and the completion-rule engine.
 *
 * @param {Object} args
 * @param {string} args.student   - User id
 * @param {string} args.classroom - Classroom id
 * @param {string} args.itemType  - one of CONTENT_TYPES
 * @param {string} args.itemId     - content item id
 * @param {Object} [args.evidence]
 * @param {number} [args.evidence.score]      - points earned (graded items only)
 * @param {number} [args.evidence.maxScore]   - points possible
 * @param {Date}   [args.evidence.submittedAt]- when the graded work was turned in
 * @returns {Promise<void>}
 */
async function markComplete({ student, classroom, itemType, itemId, evidence = {} }) {
  const filter = { classroom, student, itemType, itemId };
  const update = {
    completedAt: new Date(),
  };

  // Only set evidence fields when supplied. Lectures pass none, leaving
  // score/maxScore/submittedAt null (their default).
  if (evidence.score !== undefined) {
    update.score = evidence.score;
  }
  if (evidence.maxScore !== undefined) {
    update.maxScore = evidence.maxScore;
  }
  if (evidence.submittedAt !== undefined) {
    update.submittedAt = evidence.submittedAt;
  }

  await StudentProgress.findOneAndUpdate(filter, update, {
    upsert: true,
    setDefaultsOnInsert: true,
  });
}

module.exports = {
  markComplete,
  CONTENT_TYPES,
};
