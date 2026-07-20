const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const { csrfProtection } = require('../middleware/csrf');
const { uploadSubmissionFile } = require('../middleware/submissionUpload');
const { classroomIdRules, assignmentIdRules, submitRules } = require('../validate/student/submission.validate');
const {
  renderSubmissionForm,
  createSubmissionHandler,
  renderSubmissionDetail,
} = require('../controller/student/submission.controller');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole('student'));
router.get('/new', classroomIdRules.concat(assignmentIdRules), renderSubmissionForm);
router.post('/', classroomIdRules.concat(assignmentIdRules), uploadSubmissionFile, csrfProtection, submitRules, createSubmissionHandler);
router.get('/', classroomIdRules.concat(assignmentIdRules), renderSubmissionDetail);

module.exports = router;
