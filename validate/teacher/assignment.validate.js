const { body, param } = require('express-validator');

const createAssignmentRules = [
  body('title').trim().notEmpty().withMessage('Assignment title is required').isLength({ max: 180 }).withMessage('Assignment title is too long'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Description is too long'),
  body('instructions').optional({ checkFalsy: true }).trim(),
  body('totalPoints').optional().isFloat({ min: 0 }).withMessage('Total points must be a non-negative number'),
  body('dueDate').trim().notEmpty().withMessage('Due date is required').isISO8601().withMessage('Due date must be a valid date'),
  body('isPublished').optional().isBoolean().withMessage('Published flag must be true or false'),
  body('allowLateSubmission').optional().isBoolean().withMessage('Late submission flag must be true or false'),
  body('rubric').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid rubric id'),
];

const classroomIdRules = [
  param('classroomId').isMongoId().withMessage('Invalid classroom id'),
];

const assignmentIdRules = [
  param('assignmentId').isMongoId().withMessage('Invalid assignment id'),
];

module.exports = {
  createAssignmentRules,
  classroomIdRules,
  assignmentIdRules,
};
