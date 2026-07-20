const { body, param } = require('express-validator');

const joinClassroomRules = [
  body('code').trim().notEmpty().withMessage('Classroom code is required').isLength({ min: 6, max: 12 }).withMessage('Classroom code is invalid'),
];

const classroomIdRules = [
  param('classroomId').isMongoId().withMessage('Invalid classroom id'),
];

const lectureIdRules = [
  param('lectureId').isMongoId().withMessage('Invalid lecture id'),
];

module.exports = {
  joinClassroomRules,
  classroomIdRules,
  lectureIdRules,
};
