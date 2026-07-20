const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const { classroomIdRules, assignmentIdRules } = require('../validate/student/assignment.validate');
const {
  renderStudentAssignments,
  renderStudentAssignmentDetail,
} = require('../controller/student/assignment.controller');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole('student'));
router.get('/', classroomIdRules, renderStudentAssignments);
router.get('/:assignmentId', classroomIdRules.concat(assignmentIdRules), renderStudentAssignmentDetail);

module.exports = router;
