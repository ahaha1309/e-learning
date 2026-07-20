const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const { classroomIdRules } = require('../validate/student/classroom.validate');
const {
  renderStudentExams,
  renderTakeExam,
  submitExamHandler,
  renderExamResult
} = require('../controller/student/exam.controller');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole('student'));

router.get('/', classroomIdRules, renderStudentExams);
router.get('/:examId/take', classroomIdRules, renderTakeExam);
router.post('/:examId/submit', classroomIdRules, submitExamHandler);
router.get('/:examId/result', classroomIdRules, renderExamResult);

module.exports = router;
