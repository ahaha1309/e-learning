const StudentProgress = require('../models/StudentProgress');
const Lecture = require('../models/Lecture');
const Assignment = require('../models/Assignment');
const Exam = require('../models/Exam');
const { computeCourseProgress, CONTENT_TYPES, ITEM_STATUS } = require('./courseProgress.service');

/**
 * Course-level completion engine (Phase C, Track 3).
 *
 * `evaluateCompletion` is PURE (no DB) so it can be unit-tested in the no-DB
 * test suite. `checkItemAccess` is DB-bound — it reuses
 * courseProgress.service.computeCourseProgress as the single source of truth for
 * unlock/LOCKED status, so gates and the visible progress tree can never
 * disagree (a course tree showing an item LOCKED is the same reason access is
 * denied). See [[completion-ledger-write-path]] for the ledger backend.
 */

/**
 * Decides whether a course is "complete" (and "passing") given evidence already
 * gathered by the caller. Pure — no DB.
 *
 * @param {Object} args
 * @param {number} args.completedCount - how many published items have a completion row
 * @param {number} args.totalCount      - total published items
 * @param {number} [args.gradePercent]  - gradebook overall % (null/undefined if none)
 * @param {Object<string,number>} [args.typeCounts] - {itemType: completedCount} for requiredItemTypes
 * @param {Object} args.rules - Classroom.completionRules shape (or {} for lenient defaults)
 * @returns {{isComplete:boolean, isPassing:boolean, met:string[], missing:string[]}}
 */
function evaluateCompletion({
  completedCount,
  totalCount,
  gradePercent,
  typeCounts = {},
  rules = {},
}) {
  const met = [];
  const missing = [];

  const requireAllItems = rules.requireAllItems === true;
  const rawMinPercent = rules.minOverallPercent;
  // null/undefined/missing → "no grade rule". Be careful: Number(null) === 0,
  // which would otherwise turn an unset rule into a 0% floor. Only a real finite
  // number (>= 0) is treated as an enforced minimum.
  const hasMinPercent = rawMinPercent !== null && rawMinPercent !== undefined && Number.isFinite(Number(rawMinPercent));
  const minOverallPercent = hasMinPercent ? Number(rawMinPercent) : null;
  const requiredItemTypes = Array.isArray(rules.requiredItemTypes) ? rules.requiredItemTypes : [];

  // Rule 1: every published item completed (if required).
  const allItemsDone = totalCount <= 0 ? false : completedCount >= totalCount;
  if (!requireAllItems) {
    met.push('no_requireAllItems');
  } else if (allItemsDone) {
    met.push('all_items_completed');
  } else {
    missing.push(`all_items_completed (${completedCount}/${totalCount})`);
  }

  // Rule 2: minimum overall gradebook %.
  if (!hasMinPercent) {
    met.push('no_minOverallPercent');
  } else if (Number.isFinite(gradePercent) && gradePercent >= minOverallPercent) {
    met.push(`min_overall_percent (${gradePercent} >= ${minOverallPercent})`);
  } else {
    missing.push(`min_overall_percent (got ${Number.isFinite(gradePercent) ? gradePercent : 'n/a'}, need ${minOverallPercent})`);
  }

  // Rule 3: each required item type has at least one completion.
  for (const itemType of requiredItemTypes) {
    const have = Number(typeCounts[itemType]) || 0;
    if (have > 0) {
      met.push(`required_${itemType}`);
    } else {
      missing.push(`required_${itemType} (need >= 1)`);
    }
  }

  // isComplete: all enforced rules are met. isPassing: gradebook rule (if any)
  // is met — the distinction matters for certificates ("complete" vs "passing").
  const isComplete = missing.length === 0;
  let isPassing = true;
  if (requireAllItems && !allItemsDone) isPassing = false;
  if (hasMinPercent) {
    if (!(Number.isFinite(gradePercent) && gradePercent >= minOverallPercent)) isPassing = false;
  }

  return { isComplete, isPassing, met, missing };
}

/**
 * Server-side gate: may a student access/submit a specific content item?
 *
 * Reuses courseProgress.service.computeCourseProgress as the single source of
 * truth for LOCKED status — if the progress tree marks the item LOCKED, access
 * is denied (403-ish). This closes IDOR/time-cheat where a student jumped ahead
 * of prerequisites by guessing a lecture/exam URL.
 *
 * @returns {Promise<{allowed:boolean, reason:string, status:string}>}
 *   `status` is the item's ITEM_STATUS from the progress tree.
 */
async function checkItemAccess({ classroom, studentId, itemType, itemId }) {
  const tree = await computeCourseProgress(classroom, studentId);
  if (!tree) {
    return { allowed: false, reason: 'classroom_not_found', status: 'UNKNOWN' };
  }

  const key = `${itemType}:${String(itemId)}`;
  for (const module of tree.modules) {
    for (const child of module.children) {
      if (child.id === key) {
        const allowed = child.status !== ITEM_STATUS.LOCKED;
        return {
          allowed,
          reason: allowed ? 'ok' : 'prerequisite_incomplete',
          status: child.status,
        };
      }
    }
  }

  // Item not in the published content tree (unpublished, or wrong classroom).
  return { allowed: false, reason: 'item_not_published', status: 'UNKNOWN' };
}

/**
 * Full course-completion verdict for a student. Reads the Phase A ledger and
 * the Phase B gradebook for evidence, plus the published content tree for totals.
 *
 * @param {Object} classroom - Mongoose doc carrying completionRules + gradeWeights
 * @param {string} studentId
 * @returns {Promise<{isComplete,isPassing,met,missing,progressPercent}>}
 */
async function evaluateClassroomCompletion(classroom, studentId) {
  const tree = await computeCourseProgress(classroom, studentId);
  const completedCount = tree ? tree.completedItems : 0;
  const totalCount = tree ? tree.totalItems : 0;

  // gradebook overall % for the grade rule.
  let gradePercent = null;
  let typeCounts = {};
  try {
    // Lazy require to avoid a circular import at module load
    // (gradebook.service imports courseProgress.service; completion.service
    // imports both — load gradebook lazily here).
    const { computeGradebook } = require('./gradebook.service');
    const gradebook = await computeGradebook(classroom, studentId);
    gradePercent = gradebook.overallPercent;
    // Per-type completed counts from byType (count = graded items = completions).
    typeCounts = Object.fromEntries(
      Object.entries(gradebook.byType).map(([itemType, t]) => [itemType, t.count])
    );
  } catch {
    // If the gradebook can't be computed (no graded rows yet), every rule that
    // depends on gradePercent will report missing — which is the correct verdict.
  }

  // Completion rows for LESSON (the gradebook excludes these) matter for
  // requiredItemTypes via the tree.completedItems aggregate, but per-type
  // LESSON completion must come from the tree's module breakdown.
  if (tree) {
    let lessonCount = 0;
    for (const module of tree.modules) {
      for (const child of module.children) {
        if (child.status === ITEM_STATUS.COMPLETED && child.itemType === CONTENT_TYPES.LESSON) {
          lessonCount += 1;
        }
      }
    }
    typeCounts[CONTENT_TYPES.LESSON] = lessonCount;
  }

  return {
    ...evaluateCompletion({
      completedCount,
      totalCount,
      gradePercent,
      typeCounts,
      rules: (classroom && classroom.completionRules) || {},
    }),
    progressPercent: tree ? tree.progressPercent : 0,
  };
}

module.exports = {
  evaluateCompletion,
  checkItemAccess,
  evaluateClassroomCompletion,
  CONTENT_TYPES,
  ITEM_STATUS,
};
