const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const {
  createClassroomRules,
  classroomIdRules,
  memberIdRules,
} = require('../validate/teacher/classroom.validate');
const {
  renderClassroomIndex,
  renderCreateClassroom,
  createClassroomHandler,
  renderClassroomDetail,
  renderEditClassroom,
  updateClassroomHandler,
  deleteClassroomHandler,
  approveMemberHandler,
  rejectMemberHandler,
  removeMemberHandler,
  renderGradebook,
  exportGradebookCsv,
} = require('../controller/teacher/classroom.controller');
const {
  renderClassroomOBEManagement,
  renderExamOBEConfig,
  apiSaveQuestionMappings,
  apiBulkSaveQuestionMappings,
  apiCreateCLO,
} = require('../controller/student/obe.controller');

const router = express.Router();

router.use(requireAuth, requireRole('teacher'));
router.get('/', renderClassroomIndex);
router.get('/new', renderCreateClassroom);
router.post('/', createClassroomRules, createClassroomHandler);
router.get('/:classroomId/gradebook', classroomIdRules, renderGradebook);
router.get('/:classroomId/gradebook.csv', classroomIdRules, exportGradebookCsv);
router.get('/:classroomId', classroomIdRules, renderClassroomDetail);
router.get('/:classroomId/edit', classroomIdRules, renderEditClassroom);
router.post('/:classroomId/edit', classroomIdRules, updateClassroomHandler);
router.post('/:classroomId/delete', classroomIdRules, deleteClassroomHandler);
router.post('/:classroomId/members/:memberId/approve', classroomIdRules.concat(memberIdRules), approveMemberHandler);
router.post('/:classroomId/members/:memberId/reject', classroomIdRules.concat(memberIdRules), rejectMemberHandler);
router.post('/:classroomId/members/:memberId/remove', classroomIdRules.concat(memberIdRules), removeMemberHandler);

router.get('/:classroomId/obe-manage', classroomIdRules, renderClassroomOBEManagement);
router.post('/:classroomId/obe-manage/question-mappings', classroomIdRules, apiSaveQuestionMappings);
router.post('/:classroomId/obe-manage/clos', classroomIdRules, apiCreateCLO);
router.post('/:classroomId/obe/question-mappings', classroomIdRules, apiSaveQuestionMappings);
router.post('/:classroomId/obe/clos', classroomIdRules, apiCreateCLO);
router.get('/:classroomId/obe/exams/:examId', classroomIdRules, renderExamOBEConfig);
router.put('/:classroomId/obe/exams/:examId/bulk-mappings', classroomIdRules, apiBulkSaveQuestionMappings);

module.exports = router;
