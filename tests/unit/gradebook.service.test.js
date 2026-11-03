// Mock các model Mongoose để test logic tính điểm mà không cần kết nối CSDL
jest.mock('../../models/ClassroomMember', () => ({ findOne: jest.fn() }));
jest.mock('../../models/Exam', () => ({ find: jest.fn() }));
jest.mock('../../models/StudentProgress', () => ({ find: jest.fn() }));

const ClassroomMember = require('../../models/ClassroomMember');
const Exam = require('../../models/Exam');
const StudentProgress = require('../../models/StudentProgress');
const { computeGradebook, getLetterGrade } = require('../../services/gradebook.service');
const { computeRubricTotal } = require('../../services/grading.service');

const lean = (value) => ({ lean: () => Promise.resolve(value) });

function setup({ member = null, exams = [], progress = [] } = {}) {
  ClassroomMember.findOne.mockResolvedValue(member);
  Exam.find.mockReturnValue(lean(exams));
  StudentProgress.find.mockReturnValue(lean(progress));
}

const CLASSROOM = { _id: 'class1' };
const MID1 = { _id: 'mid1', examCategory: 'MIDTERM', totalPoints: 10 };
const MID2 = { _id: 'mid2', examCategory: 'MIDTERM', totalPoints: 20 };
const FINAL = { _id: 'final1', examCategory: 'FINAL', totalPoints: 50 };
const NORMAL = { _id: 'quiz1', examCategory: 'NORMAL', totalPoints: 10 };
const prog = (itemId, score, maxScore) => ({ itemType: 'EXAM', itemId, score, maxScore });

describe('gradebook.service getLetterGrade', () => {
  it('trả về null khi chưa có điểm tổng kết', () => {
    expect(getLetterGrade(null)).toEqual({ letterGrade: null, grade4: null, classification: null });
    expect(getLetterGrade(undefined)).toEqual({ letterGrade: null, grade4: null, classification: null });
  });

  it.each([
    [10, 'A+', 4.0], [9.0, 'A+', 4.0], [8.99, 'A', 3.7], [8.5, 'A', 3.7],
    [8.0, 'B+', 3.5], [7.0, 'B', 3.0], [6.5, 'C+', 2.5], [5.5, 'C', 2.0],
    [5.0, 'D+', 1.5], [4.0, 'D', 1.0],
  ])('điểm %p → %s (hệ 4: %p, Đạt)', (score, letter, g4) => {
    expect(getLetterGrade(score)).toEqual({ letterGrade: letter, grade4: g4, classification: 'Đạt' });
  });

  it('dưới 4.0 là F, Không đạt', () => {
    expect(getLetterGrade(3.99)).toEqual({ letterGrade: 'F', grade4: 0, classification: 'Không đạt' });
    expect(getLetterGrade(0)).toEqual({ letterGrade: 'F', grade4: 0, classification: 'Không đạt' });
  });
});

describe('gradebook.service computeGradebook (C 10% – B 30% – A 60%)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('báo lỗi khi thiếu studentId', async () => {
    await expect(computeGradebook(CLASSROOM)).rejects.toThrow('studentId is required');
  });

  it('tính tự động: B = trung bình các bài MIDTERM (thang 10), A = bài FINAL', async () => {
    setup({
      member: { attendanceScore: 9 },
      exams: [MID1, MID2, FINAL, NORMAL],
      progress: [prog('mid1', 8, 10), prog('mid2', 18, 20), prog('final1', 45, 50), prog('quiz1', 2, 10)],
    });
    const g = await computeGradebook(CLASSROOM, 'stu1');
    expect(g.attendanceScore).toBe(9);
    expect(g.midtermScore).toBe(8.5); // (8 + 9) / 2
    expect(g.midtermScoreSource).toBe('AUTO');
    expect(g.midtermCount).toBe(2);
    expect(g.finalScore).toBe(9); // 45/50 * 10
    expect(g.finalScoreSource).toBe('AUTO');
    expect(g.totalScore).toBe(8.85); // 0.1*9 + 0.3*8.5 + 0.6*9
    expect(g.letterGrade).toBe('A');
    expect(g.grade4).toBe(3.7);
    expect(g.overallPercent).toBeCloseTo(88.5);
  });

  it('bài NORMAL không ảnh hưởng điểm B và A', async () => {
    setup({
      member: { attendanceScore: 10 },
      exams: [MID1, FINAL, NORMAL],
      progress: [prog('mid1', 10, 10), prog('final1', 50, 50), prog('quiz1', 0, 10)],
    });
    const g = await computeGradebook(CLASSROOM, 'stu1');
    expect(g.midtermScore).toBe(10);
    expect(g.finalScore).toBe(10);
    expect(g.totalScore).toBe(10);
  });

  it('chưa làm đủ các bài MIDTERM thì chưa có điểm B và chưa có tổng kết', async () => {
    setup({
      member: { attendanceScore: 9 },
      exams: [MID1, MID2, FINAL],
      progress: [prog('mid1', 8, 10), prog('final1', 40, 50)],
    });
    const g = await computeGradebook(CLASSROOM, 'stu1');
    expect(g.midtermScore).toBeNull();
    expect(g.midtermExams.find((e) => e.exam._id === 'mid2').score).toBeNull();
    expect(g.totalScore).toBeNull();
    expect(g.letterGrade).toBeNull();
  });

  it('điểm nhập tay (useManualMidterm / useManualFinal) được ưu tiên hơn điểm tự động', async () => {
    setup({
      member: { attendanceScore: 10, useManualMidterm: true, manualMidtermScore: 7, useManualFinal: true, manualFinalScore: 6 },
      exams: [MID1, FINAL],
      progress: [prog('mid1', 10, 10), prog('final1', 50, 50)],
    });
    const g = await computeGradebook(CLASSROOM, 'stu1');
    expect(g.midtermScore).toBe(7);
    expect(g.midtermScoreSource).toBe('MANUAL');
    expect(g.finalScore).toBe(6);
    expect(g.finalScoreSource).toBe('MANUAL');
    expect(g.totalScore).toBe(6.7); // 1 + 2.1 + 3.6
    expect(g.letterGrade).toBe('C+');
  });

  it('lớp chưa có bài FINAL thì chưa có điểm A', async () => {
    setup({ member: { attendanceScore: 8 }, exams: [MID1], progress: [prog('mid1', 9, 10)] });
    const g = await computeGradebook(CLASSROOM, 'stu1');
    expect(g.hasFinalDef).toBe(false);
    expect(g.finalScore).toBeNull();
    expect(g.totalScore).toBeNull();
  });

  it('chưa có điểm chuyên cần (C) thì chưa tính tổng kết', async () => {
    setup({ member: { attendanceScore: null }, exams: [MID1, FINAL], progress: [prog('mid1', 9, 10), prog('final1', 45, 50)] });
    const g = await computeGradebook(CLASSROOM, 'stu1');
    expect(g.attendanceScore).toBeNull();
    expect(g.totalScore).toBeNull();
  });

  it('làm tròn điểm B, A tới 2 chữ số thập phân', async () => {
    setup({ member: { attendanceScore: 10 }, exams: [MID1, FINAL], progress: [prog('mid1', 7, 9), prog('final1', 2, 3)] });
    const g = await computeGradebook(CLASSROOM, 'stu1');
    expect(g.midtermScore).toBe(7.78); // 7/9*10
    expect(g.finalScore).toBe(6.67); // 2/3*10
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
