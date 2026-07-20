const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const {
  createAssignmentRules,
  classroomIdRules,
  assignmentIdRules,
} = require('../validate/teacher/assignment.validate');
const {
  renderAssignmentIndex,
  renderCreateAssignment,
  createAssignmentHandler,
  renderAssignmentDetail,
} = require('../controller/teacher/assignment.controller');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole('teacher'));
router.get('/', classroomIdRules, renderAssignmentIndex);
router.get('/new', classroomIdRules, renderCreateAssignment);
router.post('/', classroomIdRules, createAssignmentRules, createAssignmentHandler);
router.get('/:assignmentId', classroomIdRules.concat(assignmentIdRules), renderAssignmentDetail);

module.exports = router;
