const {
  evaluateCompletion,
  CONTENT_TYPES,
} = require('../../services/completion.service');

describe('completion.service evaluateCompletion', () => {
  it('lenient default rules: complete when nothing is enforced', () => {
    const r = evaluateCompletion({
      completedCount: 0,
      totalCount: 5,
      gradePercent: null,
      typeCounts: {},
      rules: {},
    });
    expect(r.isComplete).toBe(true);
    expect(r.isPassing).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('requireAllItems: complete only when every item is done', () => {
    const partial = evaluateCompletion({
      completedCount: 3,
      totalCount: 5,
      gradePercent: 100,
      rules: { requireAllItems: true },
    });
    expect(partial.isComplete).toBe(false);
    expect(partial.isPassing).toBe(false);
    expect(partial.missing.join(' ')).toContain('all_items_completed (3/5)');

    const complete = evaluateCompletion({
      completedCount: 5,
      totalCount: 5,
      gradePercent: 100,
      rules: { requireAllItems: true },
    });
    expect(complete.isComplete).toBe(true);
    expect(complete.isPassing).toBe(true);
    expect(complete.met).toContain('all_items_completed');
  });

  it('minOverallPercent: passing at the floor (inclusive), failing below it', () => {
    const atFloor = evaluateCompletion({
      completedCount: 5,
      totalCount: 5,
      gradePercent: 70,
      rules: { minOverallPercent: 70 },
    });
    expect(atFloor.isPassing).toBe(true);
    expect(atFloor.isComplete).toBe(true);

    const below = evaluateCompletion({
      completedCount: 5,
      totalCount: 5,
      gradePercent: 69.9,
      rules: { minOverallPercent: 70 },
    });
    expect(below.isPassing).toBe(false);
    expect(below.isComplete).toBe(false);
    expect(below.missing.join(' ')).toContain('need 70');
  });

  it('minOverallPercent null means no grade rule (lenient)', () => {
    const r = evaluateCompletion({
      completedCount: 0,
      totalCount: 0,
      gradePercent: null,
      rules: { minOverallPercent: null },
    });
    expect(r.isComplete).toBe(true);
    expect(r.met).toContain('no_minOverallPercent');
  });

  it('no grade rows yet (gradePercent n/a) fails an enforced minOverallPercent', () => {
    const r = evaluateCompletion({
      completedCount: 5,
      totalCount: 5,
      gradePercent: null,
      rules: { requireAllItems: true, minOverallPercent: 70 },
    });
    // requireAllItems passes, but the grade rule can't be satisfied without a
    // gradebook %, so the course is NOT complete (and NOT passing).
    expect(r.isComplete).toBe(false);
    expect(r.isPassing).toBe(false);
  });

  it('requiredItemTypes: each listed type needs >= 1 completed', () => {
    const r = evaluateCompletion({
      completedCount: 2,
      totalCount: 10,
      gradePercent: 90,
      typeCounts: { ASSIGNMENT: 2, EXAM: 0 },
      rules: { requiredItemTypes: [CONTENT_TYPES.ASSIGNMENT, CONTENT_TYPES.EXAM] },
    });
    // ASSIGNMENT met (2), EXAM missing (0). No requireAllItems, gradeRule null.
    expect(r.isComplete).toBe(false);
    expect(r.met.join(' ')).toContain('required_LESSON'.replace('LESSON', 'ASSIGNMENT'));
    expect(r.missing.join(' ')).toContain('EXAM');
  });

  it('requiredItemTypes empty = no per-type requirement', () => {
    const r = evaluateCompletion({
      completedCount: 0,
      totalCount: 0,
      gradePercent: null,
      typeCounts: {},
      rules: { requiredItemTypes: [] },
    });
    expect(r.isComplete).toBe(true);
  });

  it('distinguishes complete (all rules met) from passing (grade rule met)', () => {
    // requireAllItems NOT set (so "complete" ignores item counts), but a
    // minOverallPercent is set and missed → not passing, yet isComplete can be true
    // via the absence of enforceable item/required-type rules.
    const r = evaluateCompletion({
      completedCount: 1,
      totalCount: 10,
      gradePercent: 50,
      rules: { requireAllItems: false, minOverallPercent: 70 },
    });
    expect(r.isComplete).toBe(false); // the grade rule is enforced → missing
    expect(r.isPassing).toBe(false);
    expect(r.missing.join(' ')).toContain('min_overall_percent');
  });

  it('all rules satisfied → complete + passing with a met list', () => {
    const r = evaluateCompletion({
      completedCount: 4,
      totalCount: 4,
      gradePercent: 85,
      typeCounts: { ASSIGNMENT: 2, EXAM: 2 },
      rules: {
        requireAllItems: true,
        minOverallPercent: 80,
        requiredItemTypes: [CONTENT_TYPES.ASSIGNMENT, CONTENT_TYPES.EXAM],
      },
    });
    expect(r.isComplete).toBe(true);
    expect(r.isPassing).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.met.length).toBeGreaterThanOrEqual(4);
  });
});
