const { body, param } = require('express-validator');

const createClassroomRules = [
  body('name').trim().notEmpty().withMessage('Tên lớp học là bắt buộc').isLength({ max: 160 }).withMessage('Tên lớp học quá dài'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Mô tả quá dài'),
  body('approvalRequired').optional().isBoolean().withMessage('Cài đặt phê duyệt phải là true hoặc false'),
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
