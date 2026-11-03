const { body, param } = require('express-validator');

const createRubricRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Tên Rubric là bắt buộc')
    .isLength({ max: 160 })
    .withMessage('Tên Rubric không được vượt quá 160 ký tự'),
  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Mô tả không được vượt quá 1000 ký tự'),
  body('criteria')
    .custom((value, { req }) => {
      let criteria = value;
      if (typeof criteria === 'string') {
        try {
          criteria = JSON.parse(criteria);
        } catch {
          throw new Error('Dữ liệu tiêu chí không hợp lệ (JSON không đúng)');
        }
      }
      if (!Array.isArray(criteria) || criteria.length === 0) {
        throw new Error('Rubric phải có ít nhất một tiêu chí đánh giá');
      }
      for (let i = 0; i < criteria.length; i++) {
        const c = criteria[i];
        if (!c || typeof c !== 'object') {
          throw new Error(`Tiêu chí số ${i + 1} không hợp lệ`);
        }
        if (!c.label || !String(c.label).trim()) {
          throw new Error(`Tiêu chí số ${i + 1} phải có tên tiêu chí (label)`);
        }
        if (c.label.length > 120) {
          throw new Error(`Tên tiêu chí số ${i + 1} không được vượt quá 120 ký tự`);
        }
        const maxPts = Number(c.maxPoints);
        if (Number.isNaN(maxPts) || maxPts < 0) {
          throw new Error(`Điểm tối đa của tiêu chí số ${i + 1} phải là số >= 0`);
        }
        if (c.scale && Array.isArray(c.scale)) {
          for (let sIdx = 0; sIdx < c.scale.length; sIdx++) {
            const sc = c.scale[sIdx];
            if (sc && Number.isNaN(Number(sc.points))) {
              throw new Error(`Mức điểm của thang đo trong tiêu chí số ${i + 1} phải là số hợp lệ`);
            }
          }
        }
      }
      return true;
    }),
];

const classroomIdRules = [
  param('classroomId').isMongoId().withMessage('ID lớp học không hợp lệ'),
];

const rubricIdRules = [
  param('rubricId').isMongoId().withMessage('ID rubric không hợp lệ'),
];

module.exports = {
  createRubricRules,
  classroomIdRules,
  rubricIdRules,
};

