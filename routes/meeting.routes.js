const express = require('express');
const { requireAuth, requireRole } = require('../middleware/rbac');
const {
  createMeetingHandler,
  startEarlyHandler,
  endMeetingHandler,
  cancelMeetingHandler,
  renderMeetingRoom,
  getActiveMeetingApi,
} = require('../controller/meeting.controller');

const router = express.Router();

// Teacher management endpoints
router.post('/classrooms/:classroomId/meetings', requireAuth, requireRole('teacher'), createMeetingHandler);
router.post('/classrooms/:classroomId/meetings/:meetingId/start', requireAuth, requireRole('teacher'), startEarlyHandler);
router.post('/classrooms/:classroomId/meetings/:meetingId/end', requireAuth, requireRole('teacher'), endMeetingHandler);
router.post('/classrooms/:classroomId/meetings/:meetingId/cancel', requireAuth, requireRole('teacher'), cancelMeetingHandler);

// Meeting room view (both Teacher & Student with classroom membership)
router.get('/classrooms/:classroomId/meetings/:meetingId/room', requireAuth, renderMeetingRoom);

// API endpoint for active meeting polling / status check
router.get('/api/classrooms/:classroomId/active-meeting', requireAuth, getActiveMeetingApi);

module.exports = router;
