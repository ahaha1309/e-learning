const express = require('express');
const attendanceController = require('../controller/teacher/attendance.controller');
const { classroomIdRules } = require('../validate/teacher/classroom.validate');

const router = express.Router({ mergeParams: true });

router.get('/', classroomIdRules, attendanceController.renderAttendanceIndex);
router.post('/', classroomIdRules, attendanceController.createSession);
router.get('/:sessionId/live', classroomIdRules, attendanceController.renderLiveSession);
router.post('/:sessionId/code', classroomIdRules, attendanceController.apiGenerateCode); // AJAX endpoint
router.post('/:sessionId/close', classroomIdRules, attendanceController.closeSession);
router.get('/:sessionId/records', classroomIdRules, attendanceController.renderRecords);
router.post('/:sessionId/records/:recordId', classroomIdRules, attendanceController.updateRecordStatus);
router.get('/:sessionId/export-csv', classroomIdRules, attendanceController.exportCSV);

module.exports = router;
