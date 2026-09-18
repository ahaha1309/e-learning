const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const { csrfProtection } = require('../middleware/csrf');
const { classroomIdRules, assignmentIdRules, submissionIdRules, gradeRules } = require('../validate/teacher/submission.validate');
const {
  renderSubmissionsIndex,
  renderSubmissionDetail,
  gradeSubmissionHandler,
  renderRubricGrade,
  rubricGradeHandler,
  deleteSubmissionHandler,
} = require('../controller/teacher/submission.controller');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole('teacher'));
router.get('/', classroomIdRules.concat(assignmentIdRules), renderSubmissionsIndex);
router.get('/:submissionId', classroomIdRules.concat(assignmentIdRules).concat(submissionIdRules), renderSubmissionDetail);
router.get('/:submissionId/grade-rubric', classroomIdRules.concat(assignmentIdRules).concat(submissionIdRules), renderRubricGrade);
router.post('/:submissionId/grade', classroomIdRules.concat(assignmentIdRules).concat(submissionIdRules), gradeRules, gradeSubmissionHandler);
router.post('/:submissionId/grade-rubric', classroomIdRules.concat(assignmentIdRules).concat(submissionIdRules), rubricGradeHandler);
router.post('/:submissionId/delete', classroomIdRules.concat(assignmentIdRules).concat(submissionIdRules), deleteSubmissionHandler);

module.exports = router;
