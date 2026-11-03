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
  importFromBankHandler,
  renderSubmissions,
  renderGradeSubmission,
  submitGradeHandler,
  exportGradesCSVHandler
} = require('../controller/teacher/exam.controller');
const {
  renderImportPage,
  bulkImportQuestionsHandler,
} = require('../controller/teacher/examImport.controller');
const {
  renderAiGenerate,
  generateQuestionsHandler,
} = require('../controller/teacher/aiQuestionGen.controller');
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
router.post('/:examId/import-from-bank', classroomIdRules, importFromBankHandler);
router.get('/:examId/import', classroomIdRules, renderImportPage);
router.post('/:examId/import-questions', classroomIdRules, bulkImportQuestionsHandler);
router.get('/:examId/ai-generate', classroomIdRules, renderAiGenerate);
// NOTE: uploadAiDoc is called inside generateQuestionsHandler (handles its own multer error)
router.post('/:examId/ai-generate', classroomIdRules, generateQuestionsHandler);
router.get('/:examId/submissions', classroomIdRules, renderSubmissions);
router.get('/:examId/submissions/:submissionId/grade', classroomIdRules, renderGradeSubmission);
router.post('/:examId/submissions/:submissionId/grade', classroomIdRules, submitGradeHandler);
router.get('/:examId/export-csv', classroomIdRules, exportGradesCSVHandler);

module.exports = router;
