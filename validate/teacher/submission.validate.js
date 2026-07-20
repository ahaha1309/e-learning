const { body, param } = require('express-validator');

const classroomIdRules = [
  param('classroomId').isMongoId().withMessage('Invalid classroom id'),
];

const assignmentIdRules = [
  param('assignmentId').isMongoId().withMessage('Invalid assignment id'),
];

const submissionIdRules = [
  param('submissionId').isMongoId().withMessage('Invalid submission id'),
];

const gradeRules = [
  body('score').isFloat({ min: 0 }).withMessage('Score must be a non-negative number'),
  body('teacherComment').optional({ checkFalsy: true }).trim(),
];

module.exports = {
  classroomIdRules,
  assignmentIdRules,
  submissionIdRules,
  gradeRules,
};
