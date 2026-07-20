const { param } = require('express-validator');

const teacherIdRules = [
  param('teacherId').isMongoId().withMessage('Invalid teacher id'),
];

module.exports = {
  teacherIdRules,
};
