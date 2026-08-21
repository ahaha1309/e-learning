const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const {
  joinClassroomRules,
  classroomIdRules,
} = require('../validate/student/classroom.validate');
const {
  renderStudentClassrooms,
  joinClassroomHandler,
  renderStudentClassroomDetail,
  askAiAssistantHandler,
} = require('../controller/student/classroom.controller');

const router = express.Router();

router.use(requireAuth, requireRole('student'));
router.get('/', renderStudentClassrooms);
router.post('/join', joinClassroomRules, joinClassroomHandler);
router.get('/:classroomId', classroomIdRules, renderStudentClassroomDetail);
router.post('/:classroomId/ai-assistant', classroomIdRules, askAiAssistantHandler);

module.exports = router;
