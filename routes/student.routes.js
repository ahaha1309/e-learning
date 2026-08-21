const express = require('express');
const { renderStudentDashboard, renderStudentCertificates, askGlobalAiAssistantHandler } = require('../controller/student/dashboard.controller');
const { requireAuth, requireRole } = require('../middleware/rbac');

const classroomRoutes = require('./student.classroom.routes');
const examRoutes = require('./student.exam.routes');
const attendanceRoutes = require('./student.attendance.routes');
const discussionRoutes = require('./student.discussion.routes');
const lectureRoutes = require('./student.lecture.routes');
const assignmentRoutes = require('./student.assignment.routes');
const submissionRoutes = require('./student.submission.routes');
const { renderChatRoom } = require('../controller/student/chat.controller');
const { renderStudentAnalytics } = require('../controller/student/analytics.controller');
const { renderAllStudentAssignments } = require('../controller/student/assignment.controller');
const { renderAllStudentExams } = require('../controller/student/exam.controller');
const { renderAllStudentLectures } = require('../controller/student/lecture.controller');
const { renderAllStudentDiscussions } = require('../controller/student/discussion.controller');

const router = express.Router();

router.use(requireAuth, requireRole('student'));
router.get('/', renderStudentDashboard);
router.get('/dashboard', renderStudentDashboard);
router.post('/ai-assistant', askGlobalAiAssistantHandler);
router.get('/analytics', renderStudentAnalytics);
router.get('/certificates', renderStudentCertificates);
router.get('/assignments', renderAllStudentAssignments);
router.get('/exams', renderAllStudentExams);
router.get('/lectures', renderAllStudentLectures);
router.get('/discussions', renderAllStudentDiscussions);

router.use('/classrooms', classroomRoutes);
router.use('/classrooms/:classroomId/lectures', lectureRoutes);
router.use('/classrooms/:classroomId/assignments', assignmentRoutes);
router.use('/classrooms/:classroomId/assignments/:assignmentId/submissions', submissionRoutes);
router.use('/classrooms/:classroomId/exams', examRoutes);
router.use('/classrooms/:classroomId/attendance', attendanceRoutes);
router.use('/classrooms/:classroomId/discussions', discussionRoutes);
router.get('/classrooms/:classroomId/chat', renderChatRoom);

module.exports = router;
