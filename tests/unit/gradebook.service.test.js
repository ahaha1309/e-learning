const {
  normalizeWeights,
  gradeAverage,
  letterFor,
  DEFAULT_SCALE,
} = require('../../services/gradebook.service');
const { CONTENT_TYPES } = require('../../services/courseProgress.service');
const { computeRubricTotal } = require('../../services/grading.service');

describe('gradebook.service', () => {
  describe('normalizeWeights', () => {
    it('returns null for empty / missing weights (unweighted)', () => {
      expect(normalizeWeights(null)).toBeNull();
      expect(normalizeWeights([])).toBeNull();
      expect(normalizeWeights(undefined)).toBeNull();
    });

    it('normalizes weights to sum to 1', () => {
      const w = normalizeWeights([
        { itemType: CONTENT_TYPES.ASSIGNMENT, weight: 1 },
        { itemType: CONTENT_TYPES.EXAM, weight: 1 },
      ]);
      expect(w[CONTENT_TYPES.ASSIGNMENT]).toBeCloseTo(0.5);
      expect(w[CONTENT_TYPES.EXAM]).toBeCloseTo(0.5);
    });

    it('preserves the ratio for weights that do not sum to 1', () => {
      const w = normalizeWeights([
        { itemType: CONTENT_TYPES.ASSIGNMENT, weight: 4 },
        { itemType: CONTENT_TYPES.EXAM, weight: 6 },
      ]);
      expect(w[CONTENT_TYPES.ASSIGNMENT]).toBeCloseTo(0.4);
      expect(w[CONTENT_TYPES.EXAM]).toBeCloseTo(0.6);
    });

    it('clamps negative weights to 0 and skips invalid entries', () => {
      const w = normalizeWeights([
        { itemType: CONTENT_TYPES.ASSIGNMENT, weight: -5 },
        { itemType: CONTENT_TYPES.EXAM, weight: 3 },
        { itemType: 'LESSON', weight: 'nope' },
      ]);
      // ASSIGNMENT went to 0 (sum of valid positive weights is just EXAM),
      // and a weight-sum of only one positive collapses to all-null (no
      // distribution across multiple types) — EXAM keeps its self-normalized 1.
      expect(w[CONTENT_TYPES.EXAM]).toBeCloseTo(1);
      expect(w['LESSON']).toBeUndefined();
    });
  });

  describe('gradeAverage', () => {
    it('produces a simple average OF per-type averages (unweighted)', () => {
      const items = [
        { itemType: CONTENT_TYPES.ASSIGNMENT, percent: 80, maxScore: 10 },
        { itemType: CONTENT_TYPES.ASSIGNMENT, percent: 90, maxScore: 10 },
        { itemType: CONTENT_TYPES.EXAM, percent: 100, maxScore: 50 },
      ];
      const r = gradeAverage(items, null);
      // Per-type averages first (so a category with many items doesn't dominate):
      // assignments avg = (80+90)/2 = 85, exam avg = 100. Overall = mean(85,100) = 92.5.
      expect(r.percent).toBe(92.5);
      expect(r.byType[CONTENT_TYPES.ASSIGNMENT].percent).toBeCloseTo(85);
      expect(r.byType[CONTENT_TYPES.EXAM].percent).toBe(100);
      expect(r.byType[CONTENT_TYPES.ASSIGNMENT].count).toBe(2);
      expect(r.byType[CONTENT_TYPES.EXAM].count).toBe(1);
    });

    it('applies per-type weights to the overall percent', () => {
      const items = [
        { itemType: CONTENT_TYPES.ASSIGNMENT, percent: 0, maxScore: 10 },   // 0% assignments
        { itemType: CONTENT_TYPES.EXAM, percent: 100, maxScore: 50 },        // 100% exams
      ];
      const weights = normalizeWeights([
        { itemType: CONTENT_TYPES.ASSIGNMENT, weight: 4 },
        { itemType: CONTENT_TYPES.EXAM, weight: 6 },
      ]);
      const r = gradeAverage(items, weights);
      // 0*0.4 + 100*0.6 = 60
      expect(r.percent).toBe(60);
    });

    it('falls back to unweighted average when a student has no scored weighted types', () => {
      const items = [
        { itemType: CONTENT_TYPES.ASSIGNMENT, percent: 80, maxScore: 10 },
      ];
      // Only EXAM is weighted, but the student has no exam score yet.
      const weights = normalizeWeights([{ itemType: CONTENT_TYPES.EXAM, weight: 1 }]);
      const r = gradeAverage(items, weights);
      expect(r.percent).toBe(80);
    });

    it('excludes items with no usable maxScore (e.g. lesson rows)', () => {
      const items = [
        { itemType: CONTENT_TYPES.LESSON, percent: 100, maxScore: null },
        { itemType: CONTENT_TYPES.ASSIGNMENT, percent: 50, maxScore: 20 },
      ];
      const r = gradeAverage(items, null);
      // LESSON with null maxScore is not counted; only the 50% assignment.
      expect(r.percent).toBe(50);
      expect(r.byType[CONTENT_TYPES.LESSON]).toBeUndefined();
    });

    it('returns 0 when there are no scored items', () => {
      const r = gradeAverage([], null);
      expect(r.percent).toBe(0);
    });
  });

  describe('letterFor', () => {
    it('returns null for an empty scale (percent only)', () => {
      expect(letterFor(85, [])).toBeNull();
      expect(letterFor(85, null)).toBeNull();
    });

    it('maps to the default scale boundary inclusive', () => {
      expect(letterFor(90, DEFAULT_SCALE)).toBe('A');
      expect(letterFor(89.9, DEFAULT_SCALE)).toBe('B');
      expect(letterFor(80, DEFAULT_SCALE)).toBe('B');
      expect(letterFor(0, DEFAULT_SCALE)).toBe('F');
      expect(letterFor(100, DEFAULT_SCALE)).toBe('A');
    });

    it('works with an unsorted custom scale', () => {
      const scale = [
        { letter: 'C', min: 60 },
        { letter: 'A', min: 90 },
        { letter: 'B', min: 75 },
      ];
      expect(letterFor(95, scale)).toBe('A');
      expect(letterFor(80, scale)).toBe('B');
      expect(letterFor(60, scale)).toBe('C');
    });

    it('returns null for non-finite percent', () => {
      expect(letterFor(NaN, DEFAULT_SCALE)).toBeNull();
    });
  });
});

describe('grading.service computeRubricTotal', () => {
  const rubric = {
    criteria: [
      { _id: 'c1', maxPoints: 5 },
      { _id: 'c2', maxPoints: 5 },
      { _id: 'c3', maxPoints: 10 },
    ],
  };

  it('sums awarded points per criterion', () => {
    const { total, grades } = computeRubricTotal(rubric, { c1: 4, c2: 5, c3: 8 });
    expect(total).toBe(17);
    expect(grades).toHaveLength(3);
    expect(grades.find((g) => String(g.criterion) === 'c1').points).toBe(4);
  });

  it('clamps points to [0, criterion.maxPoints]', () => {
    const { total } = computeRubricTotal(rubric, { c1: -3, c2: 999, c3: 8 });
    // c1 clamps to 0, c2 clamps to 5, c3 stays 8 → 13
    expect(total).toBe(13);
  });

  it('treats a blank criterion as 0 points', () => {
    const { total, grades } = computeRubricTotal(rubric, { c2: 5 });
    expect(total).toBe(5);
    expect(grades.find((g) => String(g.criterion) === 'c1').points).toBe(0);
  });

  it('handles a malformed rubric gracefully', () => {
    expect(computeRubricTotal(null, {}).total).toBe(0);
    expect(computeRubricTotal({ criteria: 'not-an-array' }, {}).total).toBe(0);
  });
});
