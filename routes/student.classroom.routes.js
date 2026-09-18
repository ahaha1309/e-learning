const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const {
  joinClassroomRules,
  classroomIdRules,
} = require('../validate/student/classroom.validate');
const { renderStudentClassrooms, joinClassroomHandler, renderStudentClassroomDetail, askAiAssistantHandler } = require('../controller/student/classroom.controller');
const { renderStudentOBEReport } = require('../controller/student/obe.controller');
const { requestUploadUrl, confirmUpload, getAssetStatus } = require('../controller/student/storage.controller');

const router = express.Router();

router.use(requireAuth, requireRole('student'));
router.get('/', renderStudentClassrooms);
router.post('/join', joinClassroomRules, joinClassroomHandler);
router.get('/:classroomId', classroomIdRules, renderStudentClassroomDetail);
router.post('/:classroomId/ai-assistant', classroomIdRules, askAiAssistantHandler);
router.get('/:classroomId/obe-report', classroomIdRules, renderStudentOBEReport);
router.post('/:classroomId/storage/request-upload-url', classroomIdRules, requestUploadUrl);
router.post('/:classroomId/storage/confirm-upload', classroomIdRules, confirmUpload);
router.get('/:classroomId/storage/asset-status/:fileAssetId', classroomIdRules, getAssetStatus);

module.exports = router;
