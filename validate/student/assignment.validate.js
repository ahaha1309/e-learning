const { param } = require('express-validator');

const classroomIdRules = [
  param('classroomId').isMongoId().withMessage('Invalid classroom id'),
];

const assignmentIdRules = [
  param('assignmentId').isMongoId().withMessage('Invalid assignment id'),
];

module.exports = {
  classroomIdRules,
  assignmentIdRules,
};
