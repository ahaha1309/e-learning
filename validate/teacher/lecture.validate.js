const { body, param } = require('express-validator');

const createLectureRules = [
  body('chapterTitle').trim().notEmpty().withMessage('Chapter title is required').isLength({ max: 160 }).withMessage('Chapter title is too long'),
  body('title').trim().notEmpty().withMessage('Lecture title is required').isLength({ max: 180 }).withMessage('Lecture title is too long'),
  body('summary').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Summary is too long'),
  body('content').optional({ checkFalsy: true }).trim(),
  body('resourceUrl').optional({ checkFalsy: true }).trim().isURL().withMessage('Resource URL must be valid'),
  body('resourceType').optional().isIn(['pdf', 'ppt', 'video', 'document', 'link', 'text']).withMessage('Invalid resource type'),
  body('orderIndex').optional().isInt({ min: 0 }).withMessage('Order index must be a non-negative number'),
];

const classroomIdRules = [
  param('classroomId').isMongoId().withMessage('Invalid classroom id'),
];

const lectureIdRules = [
  param('lectureId').isMongoId().withMessage('Invalid lecture id'),
];

module.exports = {
  createLectureRules,
  classroomIdRules,
  lectureIdRules,
};
