const mongoose = require('mongoose');
const Rubric = require('../../models/Rubric');
const Assignment = require('../../models/Assignment');
const { computeRubricTotal } = require('../../services/grading.service');

describe('Rubric System Unit Tests', () => {
  const dummyClassroomId = new mongoose.Types.ObjectId();
  const dummyTeacherId = new mongoose.Types.ObjectId();

  describe('Rubric Model', () => {
    it('automatically calculates maxPoints as the sum of criteria maxPoints on validation', async () => {
      const rubric = new Rubric({
        classroom: dummyClassroomId,
        teacher: dummyTeacherId,
        name: 'Rubric Đồ án Công nghệ Thông tin',
        description: 'Đánh giá đồ án môn học',
        criteria: [
          {
            label: 'Kiến trúc hệ thống',
            description: 'Thiết kế MVC, clean code',
            maxPoints: 4,
            scale: [
              { points: 4, label: 'Mastery' },
              { points: 3, label: 'Proficient' },
              { points: 2, label: 'Developing' },
              { points: 1, label: 'Beginning' },
            ],
          },
          {
            label: 'Chức năng & Giao diện',
            description: 'Đáp ứng đủ use-case',
            maxPoints: 3.5,
            scale: [
              { points: 3.5, label: 'Tốt' },
              { points: 2, label: 'Đạt' },
            ],
          },
          {
            label: 'Báo cáo & Thuyết minh',
            description: 'Trình bày khoa học',
            maxPoints: 2.5,
          },
        ],
      });

      await rubric.validate();
      expect(rubric.maxPoints).toBe(10);
    });

    it('handles empty criteria array gracefully with maxPoints = 0', async () => {
      const rubric = new Rubric({
        classroom: dummyClassroomId,
        teacher: dummyTeacherId,
        name: 'Rubric rỗng',
        criteria: [],
      });

      await rubric.validate();
      expect(rubric.maxPoints).toBe(0);
    });
  });

  describe('Assignment & Rubric integration', () => {
    it('allows assignment to reference a rubric and default to null', () => {
      const assignment = new Assignment({
        classroom: dummyClassroomId,
        teacher: dummyTeacherId,
        title: 'Bài tập 1',
        dueDate: new Date(),
      });

      expect(assignment.rubric).toBeNull();
    });

    it('can attach a rubric id to an assignment', () => {
      const dummyRubricId = new mongoose.Types.ObjectId();
      const assignment = new Assignment({
        classroom: dummyClassroomId,
        teacher: dummyTeacherId,
        title: 'Bài tập chấm theo Rubric',
        dueDate: new Date(),
        rubric: dummyRubricId,
        totalPoints: 10,
      });

      expect(assignment.rubric).toEqual(dummyRubricId);
      expect(assignment.totalPoints).toBe(10);
    });
  });

  describe('Rubric grading calculation', () => {
    it('computes total score and clamps each criterion between 0 and maxPoints', () => {
      const c1Id = new mongoose.Types.ObjectId();
      const c2Id = new mongoose.Types.ObjectId();

      const rubricShape = {
        maxPoints: 10,
        criteria: [
          { _id: c1Id, label: 'Tiêu chí 1', maxPoints: 6 },
          { _id: c2Id, label: 'Tiêu chí 2', maxPoints: 4 },
        ],
      };

      const gradesMap = {};
      gradesMap[String(c1Id)] = 5;
      gradesMap[String(c2Id)] = 10; // Exceeds maxPoints 4, must clamp to 4

      const { total, grades } = computeRubricTotal(rubricShape, gradesMap);

      expect(total).toBe(9); // 5 + 4
      expect(grades).toHaveLength(2);
      expect(grades[0].points).toBe(5);
      expect(grades[1].points).toBe(4);
    });
  });
});

