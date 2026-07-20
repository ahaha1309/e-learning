/**
 * Pure, DB-free helpers for server-side exam integrity (Track 8).
 *
 * Kept side-effect-free so they can be unit-tested without a database — the
 * existing test suite has no Mongo connection. The controller composes these
 * with real DB reads/writes.
 */

// How long AFTER the deadline a submission is still accepted, to absorb client
// clock skew and submit-in-flight latency. Past this, the attempt is auto-late.
const SUBMIT_GRACE_MS = 30 * 1000; // 30 seconds

/**
 * Computes the server-side deadline for an attempt.
 *
 * @param {Date} startedAt - when the attempt began
 * @param {number} durationMinutes - exam.duration (minutes). 0 = no time limit.
 * @returns {Date|null} the deadline, or null for an untimed exam
 */
function computeDeadline(startedAt, durationMinutes) {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const minutes = Number(durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return new Date(start + minutes * 60 * 1000);
}

/**
 * Decides a submission's outcome based on the server clock vs the deadline.
 *
 * @param {Date} deadlineAt - computed deadline (may be null for untimed exams)
 * @param {Date} [now] - current server time; defaults to new Date()
 * @returns {{ isLate: boolean, reason: string }}
 *   - isLate:false  -> accept as a normal 'submitted' attempt
 *   - isLate:true   -> record as 'late' (still scored, marked late)
 *
 * Note: we mark late rather than reject outright, so a student whose clock
 * drifted past the deadline mid-submit doesn't lose their answers. The
 * completion ledger records the row either way; the gradebook can then apply
 * the teacher's late-policy weight. This is intentionally more forgiving than
 * a hard reject — flip the branch if a stricter policy is ever desired.
 */
function evaluateDeadline(deadlineAt, now = new Date()) {
  if (!deadlineAt) {
    return { isLate: false, reason: 'untimed_exam' };
  }
  const deadline = new Date(deadlineAt).getTime();
  const t = new Date(now).getTime();
  if (!Number.isFinite(deadline) || !Number.isFinite(t)) {
    return { isLate: false, reason: 'invalid_timestamps' };
  }
  if (t > deadline + SUBMIT_GRACE_MS) {
    return { isLate: true, reason: 'past_deadline' };
  }
  return { isLate: false, reason: 'within_deadline' };
}

/**
 * Decides whether a student may start a new attempt, given how many submitted
 * attempts they already have and the exam's maxAttempts.
 *
 * @param {number} submittedCount - count of status==='submitted'|'graded'|'late'|'auto_submitted' rows
 * @param {number} maxAttempts - exam.maxAttempts. 0 = unlimited.
 * @returns {boolean} true if a new attempt is permitted
 */
function canStartAttempt(submittedCount, maxAttempts) {
  const count = Number(submittedCount);
  const max = Number(maxAttempts);
  if (!Number.isFinite(max) || max <= 0) return true; // unlimited
  if (!Number.isFinite(count) || count < 0) return true;
  return count < max;
}

module.exports = {
  SUBMIT_GRACE_MS,
  computeDeadline,
  evaluateDeadline,
  canStartAttempt,
};
