const { body, param } = require('express-validator');

const classroomIdRules = [
  param('classroomId').isMongoId().withMessage('Invalid classroom id'),
];

const assignmentIdRules = [
  param('assignmentId').isMongoId().withMessage('Invalid assignment id'),
];

const submitRules = [
  body('textAnswer').optional({ checkFalsy: true }).trim(),
];

module.exports = {
  classroomIdRules,
  assignmentIdRules,
  submitRules,
};
