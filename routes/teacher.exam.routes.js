const express = require('express');
const { classroomIdRules } = require('../validate/teacher/classroom.validate');
const {
  renderExamIndex,
  renderCreateExam,
  createExamHandler,
  renderExamDetail,
  renderEditExam,
  updateExamHandler,
  renderManageQuestions,
  addQuestionHandler,
  deleteQuestionHandler,
  generateMatrixHandler,
  renderSubmissions,
  renderGradeSubmission,
  submitGradeHandler,
  exportGradesCSVHandler
} = require('../controller/teacher/exam.controller');
const {
  renderImportPage,
  bulkImportQuestionsHandler,
} = require('../controller/teacher/examImport.controller');
const { uploadExamFile } = require('../middleware/examUpload');

const router = express.Router({ mergeParams: true });

router.get('/', classroomIdRules, renderExamIndex);
router.get('/new', classroomIdRules, renderCreateExam);
router.post('/', classroomIdRules, uploadExamFile, createExamHandler);
router.get('/:examId', classroomIdRules, renderExamDetail);
router.get('/:examId/edit', classroomIdRules, renderEditExam);
router.post('/:examId/edit', classroomIdRules, uploadExamFile, updateExamHandler);
router.get('/:examId/questions', classroomIdRules, renderManageQuestions);
router.post('/:examId/questions', classroomIdRules, addQuestionHandler);
router.post('/:examId/questions/:questionId/delete', classroomIdRules, deleteQuestionHandler);
router.post('/:examId/generate-matrix', classroomIdRules, generateMatrixHandler);
router.get('/:examId/import', classroomIdRules, renderImportPage);
router.post('/:examId/import-questions', classroomIdRules, bulkImportQuestionsHandler);
router.get('/:examId/submissions', classroomIdRules, renderSubmissions);
router.get('/:examId/submissions/:submissionId/grade', classroomIdRules, renderGradeSubmission);
router.post('/:examId/submissions/:submissionId/grade', classroomIdRules, submitGradeHandler);
router.get('/:examId/export-csv', classroomIdRules, exportGradesCSVHandler);

module.exports = router;
