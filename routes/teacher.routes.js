const express = require('express');
const { renderTeacherDashboard } = require('../controller/teacher/dashboard.controller');
const { requireAuth, requireRole } = require('../middleware/rbac');

const classroomRoutes = require('./teacher.classroom.routes');
const examRoutes = require('./teacher.exam.routes');
const rubricRoutes = require('./teacher.rubric.routes');
const qbRoutes = require('./teacher.questionBank.routes');
const attendanceRoutes = require('./teacher.attendance.routes');
const discussionRoutes = require('./teacher.discussion.routes');
const { renderChatRoom } = require('../controller/teacher/chat.controller');
const { renderClassroomAnalytics, renderGlobalAnalytics } = require('../controller/teacher/analytics.controller');
const { renderGlobalAttendance } = require('../controller/teacher/attendance.controller');
const { renderGlobalAssignments } = require('../controller/teacher/assignment.controller');

const router = express.Router();

router.use(requireAuth, requireRole('teacher'));
router.get('/', renderTeacherDashboard);
router.get('/dashboard', renderTeacherDashboard);

router.use('/classrooms', classroomRoutes);
router.use('/classrooms/:classroomId/exams', examRoutes);
router.use('/classrooms/:classroomId/rubrics', rubricRoutes);
router.use('/classrooms/:classroomId/attendance', attendanceRoutes);
router.use('/classrooms/:classroomId/discussions', discussionRoutes);
router.get('/classrooms/:classroomId/chat', renderChatRoom);
router.get('/classrooms/:classroomId/analytics', renderClassroomAnalytics);
router.get('/analytics', renderGlobalAnalytics);
router.get('/attendance', renderGlobalAttendance);
router.get('/assignments', renderGlobalAssignments);
router.use('/question-banks', qbRoutes);

module.exports = router;
