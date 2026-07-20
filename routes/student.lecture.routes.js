const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const { classroomIdRules, lectureIdRules } = require('../validate/student/classroom.validate');
const {
  renderStudentLectures,
  renderStudentLectureDetail,
  renderStudentLecturePreview,
  markLectureComplete,
} = require('../controller/student/lecture.controller');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole('student'));
router.get('/', classroomIdRules, renderStudentLectures);
// Student marks a lesson complete — the write that drives the computed course progress.
router.post('/:lectureId/complete', classroomIdRules.concat(lectureIdRules), markLectureComplete);
router.get('/:lectureId', classroomIdRules.concat(lectureIdRules), renderStudentLectureDetail);
router.get('/:lectureId/preview', classroomIdRules.concat(lectureIdRules), renderStudentLecturePreview);

module.exports = router;
