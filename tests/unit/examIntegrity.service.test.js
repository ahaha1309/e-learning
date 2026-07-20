const {
  SUBMIT_GRACE_MS,
  computeDeadline,
  evaluateDeadline,
  canStartAttempt,
} = require('../../services/examIntegrity.service');

describe('examIntegrity.service', () => {
  describe('computeDeadline', () => {
    it('sets the deadline to startedAt + duration', () => {
      const startedAt = new Date('2026-07-17T10:00:00Z');
      const deadline = computeDeadline(startedAt, 60);
      expect(deadline).toEqual(new Date('2026-07-17T11:00:00Z'));
    });

    it('returns null for an untimed exam (duration 0)', () => {
      expect(computeDeadline(new Date(), 0)).toBeNull();
    });

    it('returns null for a negative or non-finite duration', () => {
      expect(computeDeadline(new Date(), -5)).toBeNull();
      expect(computeDeadline(new Date(), 'abc')).toBeNull();
    });
  });

  describe('evaluateDeadline', () => {
    const deadline = new Date('2026-07-17T11:00:00Z');

    it('accepts a submit before the deadline', () => {
      const r = evaluateDeadline(deadline, new Date('2026-07-17T10:59:00Z'));
      expect(r.isLate).toBe(false);
      expect(r.reason).toBe('within_deadline');
    });

    it('accepts a submit within the grace window after the deadline', () => {
      const justOver = new Date(deadline.getTime() + SUBMIT_GRACE_MS - 1000);
      expect(evaluateDeadline(deadline, justOver).isLate).toBe(false);
    });

    it('marks a submit past the grace window as late (not rejected)', () => {
      const past = new Date(deadline.getTime() + SUBMIT_GRACE_MS + 1000);
      const r = evaluateDeadline(deadline, past);
      expect(r.isLate).toBe(true);
      expect(r.reason).toBe('past_deadline');
    });

    it('never marks an untimed exam as late', () => {
      expect(evaluateDeadline(null, new Date('2030-01-01T00:00:00Z')).isLate).toBe(false);
    });
  });

  describe('canStartAttempt', () => {
    it('allows an attempt when under the limit', () => {
      expect(canStartAttempt(0, 1)).toBe(true);
      expect(canStartAttempt(1, 2)).toBe(true);
    });

    it('blocks an attempt when the limit is reached', () => {
      expect(canStartAttempt(1, 1)).toBe(false);
      expect(canStartAttempt(3, 3)).toBe(false);
    });

    it('treats maxAttempts 0 as unlimited', () => {
      expect(canStartAttempt(999, 0)).toBe(true);
    });
  });
});
