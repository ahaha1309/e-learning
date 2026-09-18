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
  renderEditAssignment,
  updateAssignmentHandler,
  renderManageQuestions,
  addQuestionHandler,
  deleteQuestionHandler,
} = require('../controller/teacher/assignment.controller');

const { uploadAssignmentFile } = require('../middleware/assignmentUpload');
const assignmentImportController = require('../controller/teacher/assignmentImport.controller');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole('teacher'));
router.get('/', classroomIdRules, renderAssignmentIndex);
router.get('/new', classroomIdRules, renderCreateAssignment);
router.post('/', classroomIdRules, uploadAssignmentFile, createAssignmentRules, createAssignmentHandler);
router.get('/:assignmentId', classroomIdRules.concat(assignmentIdRules), renderAssignmentDetail);
router.get('/:assignmentId/edit', classroomIdRules.concat(assignmentIdRules), renderEditAssignment);
router.post('/:assignmentId/edit', classroomIdRules.concat(assignmentIdRules), uploadAssignmentFile, createAssignmentRules, updateAssignmentHandler);
router.get('/:assignmentId/questions', classroomIdRules.concat(assignmentIdRules), renderManageQuestions);
router.post('/:assignmentId/questions', classroomIdRules.concat(assignmentIdRules), addQuestionHandler);
router.post('/:assignmentId/questions/:questionId/delete', classroomIdRules.concat(assignmentIdRules), deleteQuestionHandler);
router.get('/:assignmentId/import', classroomIdRules.concat(assignmentIdRules), assignmentImportController.renderImportPage);
router.post('/:assignmentId/import-questions', classroomIdRules.concat(assignmentIdRules), assignmentImportController.bulkImportQuestionsHandler);

module.exports = router;
