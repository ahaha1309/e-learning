const { body, param } = require('express-validator');

const createClassroomRules = [
  body('name').trim().notEmpty().withMessage('Classroom name is required').isLength({ max: 160 }).withMessage('Classroom name is too long'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Description is too long'),
  body('approvalRequired').optional().isBoolean().withMessage('Approval setting must be true or false'),
];

const classroomIdRules = [
  param('classroomId').isMongoId().withMessage('Invalid classroom id'),
];

const memberIdRules = [
  param('memberId').isMongoId().withMessage('Invalid member id'),
];

module.exports = {
  createClassroomRules,
  classroomIdRules,
  memberIdRules,
};
