const StudentProgress = require('../models/StudentProgress');
const { CONTENT_TYPES } = require('./courseProgress.service');

/**
 * Gradebook service (Phase B, Track 2).
 *
 * Reads scored rows from the completion ledger (Phase A: StudentProgress with
 * score/maxScore written on assignment grade + exam submit/grade). The gradebook
 * is COMPUTED on read — it stores nothing — mirroring the "recompute, never
 * persist lock state" philosophy of courseProgress.service.
 *
 * The aggregation logic (gradeAverage, letterFor, normalizeWeights) is kept PURE
 * and DB-free so it can be unit-tested without MongoDB, matching the existing
 * test suite, which has no DB connection.
 */

const DEFAULT_SCALE = [
  { letter: 'A', min: 90 },
  { letter: 'B', min: 80 },
  { letter: 'C', min: 70 },
  { letter: 'D', min: 60 },
  { letter: 'F', min: 0 },
];

/**
 * Normalizes a gradeWeights array to a map {itemType: weight} whose values sum
 * to 1. null/empty → null (caller treats as unweighted). Negative weights are
 * clamped to 0; weights need not already sum to 1.
 *
 * @param {Array<{itemType:string, weight:number}>} [weights]
 * @returns {Object|null}
 */
function normalizeWeights(weights) {
  if (!Array.isArray(weights) || weights.length === 0) return null;

  const map = {};
  let total = 0;
  for (const w of weights) {
    if (!w || !w.itemType) continue;
    const weight = Number(w.weight);
    if (!Number.isFinite(weight) || weight < 0) continue;
    map[w.itemType] = (map[w.itemType] || 0) + weight;
    total += weight;
  }
  if (total <= 0) return null;
  for (const key of Object.keys(map)) {
    map[key] = map[key] / total;
  }
  return map;
}

/**
 * Computes the overall grade percent for a student across scored items.
 *
 * @param {Array<{itemType:string, percent:number, maxScore:number}>} scoredItems
 *   each item already normalized to a 0–100 percent by its (score/maxScore*100).
 * @param {Object|null} normalizedWeights - output of normalizeWeights, or null
 *   for a simple average across all scored items regardless of type.
 * @returns {{percent:number, byType:Object<string,{percent:number,count:number}>}}
 *   percent is 0–100 rounded to 1 dp. byType is per-itemType average for the
 *   detail view. Items with a zero or missing maxScore are excluded (avoid
 *   divide-by-zero) and contribute to neither the per-type nor overall average.
 */
function gradeAverage(scoredItems, normalizedWeights) {
  const byType = {};

  for (const item of scoredItems) {
    if (!item || !item.itemType) continue;
    if (!Number.isFinite(item.percent) || item.percent < 0) continue;
    if (!Number(item.maxScore) && Number(item.maxScore) !== 0) {
      // only count items that actually have a maxScore (graded). A lecture row
      // has maxScore null and should never reach here, but guard anyway.
      continue;
    }
    if (!(item.maxScore > 0)) continue;

    if (!byType[item.itemType]) {
      byType[item.itemType] = { sum: 0, count: 0 };
    }
    byType[item.itemType].sum += item.percent;
    byType[item.itemType].count += 1;
  }

  const typeAverages = {};
  for (const [itemType, agg] of Object.entries(byType)) {
    typeAverages[itemType] = {
      percent: agg.count > 0 ? agg.sum / agg.count : 0,
      count: agg.count,
    };
  }

  let percent;
  if (normalizedWeights && Object.keys(normalizedWeights).length > 0) {
    // Weighted: sum(typeAverage * weight) over types that appear AND have a
    // defined weight. If none of a student's scored types are weighted, fall
    // back to the unweighted average so the overall is never undefined.
    let acc = 0;
    let weightUsed = 0;
    for (const [itemType, w] of Object.entries(normalizedWeights)) {
      if (typeAverages[itemType]) {
        acc += typeAverages[itemType].percent * w;
        weightUsed += w;
      }
    }
    percent = weightUsed > 0 ? acc / weightUsed : unweightedAverage(typeAverages);
  } else {
    percent = unweightedAverage(typeAverages);
  }

  return {
    percent: Math.round(percent * 10) / 10,
    byType: typeAverages,
  };
}

function unweightedAverage(typeAverages) {
  const entries = Object.values(typeAverages);
  if (entries.length === 0) return 0;
  return entries.reduce((s, t) => s + t.percent, 0) / entries.length;
}

/**
 * Maps a 0–100 percent to a letter using a grading scale. Empty scale → null
 * (percent only). Scale entries need not be sorted; they are sorted on min desc.
 *
 * @param {number} percent
 * @param {Array<{letter:string, min:number}>} [scale]
 * @returns {string|null}
 */
function letterFor(percent, scale) {
  if (!Array.isArray(scale) || scale.length === 0) return null;
  if (!Number.isFinite(percent)) return null;
  const sorted = [...scale].sort((a, b) => Number(b.min) - Number(a.min));
  for (const entry of sorted) {
    if (percent >= Number(entry.min)) return entry.letter;
  }
  return null;
}

/**
 * Reads the scored completion rows for one student in one classroom and returns
 * the gradebook object. Throws nothing — caller handles errors.
 *
 * @param {Object|string} classroom - Mongoose doc (or id) carrying gradeWeights +
 *   gradingScale; if a doc is passed, those are read from it.
 * @param {string} [studentId] - restrict to one student. Required for the
 *   gradebook teacher view (one row per student).
 * Returns:
 *   { overallPercent, letter, byItem: [{itemType, itemId, score, maxScore, percent}],
 *     byType: { itemType: {percent, count} } }
 */
async function computeGradebook(classroom, studentId) {
  const classroomId = String(classroom._id || classroom.id || classroom);
  const weights = (classroom.gradeWeights !== undefined ? classroom.gradeWeights : classroom.toObject ? classroom.toObject().gradeWeights : null);
  const scale = (classroom.gradingScale !== undefined ? classroom.gradingScale : classroom.toObject ? classroom.toObject().gradingScale : null);
  const normalizedWeights = normalizeWeights(weights);

  // Only scored rows: maxScore > 0. LESSON rows have null maxScore and are
  // excluded from grading by construction.
  const query = {
    classroom: classroomId,
    score: { $ne: null },
    maxScore: { $gt: 0 },
  };
  if (studentId) {
    query.student = studentId;
  }

  const rows = await StudentProgress.find(query).lean();

  const byItem = rows
    .filter((r) => Number.isFinite(r.score) && Number.isFinite(r.maxScore) && r.maxScore > 0)
    .map((r) => {
      const percent = Math.max(0, (r.score / r.maxScore) * 100);
      return {
        itemType: r.itemType,
        itemId: String(r.itemId),
        score: r.score,
        maxScore: r.maxScore,
        percent: Math.round(percent * 10) / 10,
      };
    });

  const { percent, byType } = gradeAverage(byItem, normalizedWeights);
  const letter = letterFor(percent, classroom.gradingScale);

  return {
    classroomId,
    overallPercent: percent,
    letter,
    byItem,
    byType: Object.fromEntries(
      Object.entries(byType).map(([itemType, t]) => [
        itemType,
        {
          percent: Math.round(t.percent * 10) / 10,
          count: t.count,
        },
      ])
    ),
  };
}

module.exports = {
  DEFAULT_SCALE,
  normalizeWeights,
  gradeAverage,
  letterFor,
  computeGradebook,
};
