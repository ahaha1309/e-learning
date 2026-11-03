const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const { classroomIdRules } = require('../validate/student/classroom.validate');
const {
  renderStudentExams,
  renderTakeExam,
  submitExamHandler,
  renderExamResult
} = require('../controller/student/exam.controller');
const { uploadSubmissionFile } = require('../middleware/submissionUpload');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole('student'));

router.get('/', classroomIdRules, renderStudentExams);

// Fallback detail route: redirects to /take (which handles max attempts and redirects to /result if needed)
router.get('/:examId', classroomIdRules, (req, res) => {
  res.redirect(`/student/classrooms/${req.params.classroomId}/exams/${req.params.examId}/take`);
});

router.get('/:examId/take', classroomIdRules, renderTakeExam);
router.post('/:examId/submit', classroomIdRules, uploadSubmissionFile, submitExamHandler);
router.get('/:examId/result', classroomIdRules, renderExamResult);

module.exports = router;
