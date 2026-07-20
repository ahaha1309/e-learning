const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Rubric = require('../models/Rubric');
const AppError = require('../utils/AppError');
const { markComplete, CONTENT_TYPES } = require('../helper/progress');

/**
 * Rubric grading service (Phase B, Track 6).
 *
 * The total computation is a PURE fn so it can be unit-tested without MongoDB.
 * gradeWithRubric does the DB work and feeds the result into the existing
 * submission.score path so the Phase B gradebook consumes it unchanged.
 */

/**
 * Computes the total score and per-criterion grade rows from a rubric + a map
 * of criterion-id -> awarded points. Pure and side-effect free.
 *
 * - Points are clamped to [0, criterion.maxPoints] so a stray body value can't
 *   exceed the criterion cap (defense; the UI should already enforce this).
 * - Grades are returned ordered as the rubric defines them, with `points` for
 *   every criterion (0 when the teacher left one blank).
 *
 * @param {Object} rubric - a Rubric doc (or plain shape) with `criteria`
 * @param {Object<string,number>} gradesMap - { [criterionId]: awardedPoints }
 * @returns {{ total: number, grades: Array<{criterion, points}> }}
 */
function computeRubricTotal(rubric, gradesMap) {
  const criteria = (rubric && Array.isArray(rubric.criteria)) ? rubric.criteria : [];
  const map = gradesMap || {};

  let total = 0;
  const grades = [];
  for (const c of criteria) {
    if (!c || !c._id) continue;
    const raw = Number(map[String(c._id)]);
    const max = Number(c.maxPoints) || 0;
    const awarded = Number.isFinite(raw)
      ? Math.min(Math.max(raw, 0), max)
      : 0;
    total += awarded;
    grades.push({ criterion: c._id, points: awarded });
  }
  return { total, grades };
}

/**
 * Grades a submission against a rubric: validates ownership, computes the
 * criterion total, writes submission.score + rubricGrades + status='graded',
 * and refreshes the completion ledger (Phase A) so the gradebook sees the new
 * score immediately.
 *
 * @param {Object} args
 * @param {string} args.submissionId
 * @param {string} args.assignmentId
 * @param {string} args.teacherId
 * @param {Object<string,number>} args.gradesMap
 * @returns {Promise<Object>} the saved submission
 */
async function gradeWithRubric({ submissionId, assignmentId, teacherId, gradesMap }) {
  const assignment = await Assignment.findOne({ _id: assignmentId, teacher: teacherId });
  if (!assignment || !assignment.rubric) {
    throw new AppError('Assignment has no rubric.', 422);
  }

  const rubric = await Rubric.findOne({ _id: assignment.rubric, teacher: teacherId });
  if (!rubric) {
    throw new AppError('Rubric not found.', 404);
  }

  const submission = await Submission.findOne({ _id: submissionId, assignment: assignment.id });
  if (!submission) {
    throw new AppError('Submission not found.', 404);
  }

  const { total, grades } = computeRubricTotal(rubric, gradesMap);

  submission.rubricGrades = grades;
  submission.score = total;
  submission.status = 'graded';
  submission.gradedAt = new Date();
  await submission.save();

  // Refresh the completion ledger with the graded score. The gradebook reads
  // StudentProgress.score/maxScore, so this keeps the gradebook in sync with
  // the rubric grade in one step. (Same write path used by freehand grading.)
  //
  // NOTE: maxScore uses rubric.maxPoints (the true ceiling of this rubric),
  // NOT assignment.totalPoints. If a teacher attaches a rubric whose total
  // differs from the assignment's configured totalPoints, the gradebook still
  // normalizes correctly (score/maxScore*100), but the assignment's displayed
  // "X points" label may disagree with the rubric. A cleaner fix is to derive
  // assignment.totalPoints from its rubric at assign time — deferred to keep
  // this change surgical.
  await markComplete({
    student: String(submission.student),
    classroom: String(submission.classroom),
    itemType: CONTENT_TYPES.ASSIGNMENT,
    itemId: assignment.id,
    evidence: {
      score: total,
      maxScore: rubric.maxPoints,
      submittedAt: submission.submittedAt,
    },
  });

  return submission;
}

module.exports = {
  computeRubricTotal,
  gradeWithRubric,
};
