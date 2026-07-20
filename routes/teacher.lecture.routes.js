const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const { csrfProtection } = require('../middleware/csrf');
const {
  createLectureRules,
  classroomIdRules,
  lectureIdRules,
} = require('../validate/teacher/lecture.validate');
const {
  renderLectureIndex,
  renderCreateLecture,
  createLectureHandler,
  renderLectureDetail,
  renderLecturePreview,
  renderEditLecture,
  updateLectureHandler,
} = require('../controller/teacher/lecture.controller');
const { uploadLectureAsset } = require('../middleware/lectureUpload');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole('teacher'));
router.get('/', classroomIdRules, renderLectureIndex);
router.get('/new', classroomIdRules, renderCreateLecture);
router.post('/', classroomIdRules, uploadLectureAsset, csrfProtection, createLectureRules, createLectureHandler);
router.get('/:lectureId', classroomIdRules.concat(lectureIdRules), renderLectureDetail);
router.get('/:lectureId/edit', classroomIdRules.concat(lectureIdRules), renderEditLecture);
router.post('/:lectureId', classroomIdRules.concat(lectureIdRules), uploadLectureAsset, csrfProtection, createLectureRules, updateLectureHandler);
router.get('/:lectureId/preview', classroomIdRules.concat(lectureIdRules), renderLecturePreview);

module.exports = router;
