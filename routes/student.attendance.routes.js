const express = require('express');
const attendanceController = require('../controller/student/attendance.controller');

const router = express.Router({ mergeParams: true });

router.get('/', attendanceController.renderCheckin);
router.get('/qr', attendanceController.qrCheckin);
router.post('/', attendanceController.submitCheckin);

module.exports = router;
