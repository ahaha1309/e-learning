const Classroom = require('../../models/Classroom');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');
const User = require('../../models/User');
const { Parser } = require('json2csv');

async function renderAttendanceIndex(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Not found', path: req.originalUrl });

    const sessions = await AttendanceSession.find({ classroom: classroom.id })
      .sort({ date: -1 });

    return res.render('teacher/attendance/index', {
      title: 'Attendance Sessions',
      classroom,
      sessions,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createSession(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    // Prevent duplicate open sessions by redirecting to existing open one
    const existingOpenSession = await AttendanceSession.findOne({ classroom: classroom.id, status: 'open' });
    if (existingOpenSession) {
      return res.redirect(`/teacher/classrooms/${classroom.id}/attendance/${existingOpenSession.id}/live`);
    }

    const session = new AttendanceSession({
      classroom: classroom.id,
      teacher: req.user.id,
      status: 'open',
    });
    session.generateNewCode();
    await session.save();

    // Automatically create 'absent' records for all approved enrolled students
    const ClassroomMember = require('../../models/ClassroomMember');
    const members = await ClassroomMember.find({ classroom: classroom.id, status: 'approved' });
    const records = members.map(m => ({
      session: session.id,
      student: m.student,
      status: 'absent'
    }));
    if (records.length > 0) {
      await AttendanceRecord.insertMany(records);
    }

    return res.redirect(`/teacher/classrooms/${classroom.id}/attendance/${session.id}/live`);
  } catch (error) {
    return next(error);
  }
}

async function renderLiveSession(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    const session = await AttendanceSession.findOne({ _id: req.params.sessionId, classroom: classroom.id });
    if (!session) return res.status(404).send('Session not found');

    if (session.status === 'closed') {
      return res.redirect(`/teacher/classrooms/${classroom.id}/attendance/${session.id}/records`);
    }

    return res.render('teacher/attendance/live', {
      title: 'Live Attendance',
      classroom,
      session,
    });
  } catch (error) {
    return next(error);
  }
}

async function apiGenerateCode(req, res, next) {
  try {
    const session = await AttendanceSession.findOne({ 
      _id: req.params.sessionId, 
      teacher: req.user.id,
      status: 'open' 
    });
    
    if (!session) return res.status(404).json({ error: 'Session not open or not found' });

    const newCode = session.generateNewCode();
    await session.save();

    return res.json({ code: newCode, expiresAt: session.expiresAt });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function closeSession(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    const session = await AttendanceSession.findOne({ _id: req.params.sessionId, classroom: classroom.id });
    if (!session) return res.status(404).send('Session not found');

    session.status = 'closed';
    await session.save();

    return res.redirect(`/teacher/classrooms/${classroom.id}/attendance/${session.id}/records?feedback=Session+Closed`);
  } catch (error) {
    return next(error);
  }
}

async function renderRecords(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    const session = await AttendanceSession.findOne({ _id: req.params.sessionId, classroom: classroom.id });
    if (!session) return res.status(404).send('Session not found');

    const records = await AttendanceRecord.find({ session: session.id })
      .populate('student', 'name email')
      .sort({ 'student.name': 1 });

    // Calculate stats
    const stats = {
      present: 0, absent: 0, late: 0, excused: 0
    };
    records.forEach(r => stats[r.status]++);

    return res.render('teacher/attendance/records', {
      title: 'Attendance Records',
      classroom,
      session,
      records,
      stats,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateRecordStatus(req, res, next) {
  try {
    const record = await AttendanceRecord.findOne({ _id: req.params.recordId }).populate('session');
    if (!record || record.session.teacher.toString() !== req.user.id) {
      return res.status(403).send('Forbidden');
    }

    const { status } = req.body;
    if (['present', 'absent', 'late', 'excused'].includes(status)) {
      record.status = status;
      await record.save();
    }

    return res.redirect(`/teacher/classrooms/${req.params.classroomId}/attendance/${record.session._id}/records`);
  } catch (error) {
    return next(error);
  }
}

async function exportCSV(req, res, next) {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.sessionId, teacher: req.user.id });
    if (!session) return res.status(404).send('Not found');

    const records = await AttendanceRecord.find({ session: session.id })
      .populate('student', 'name email');

    const data = records.map(r => ({
      'Student Name': r.student?.name || 'Unknown',
      'Email': r.student?.email || 'Unknown',
      'Status': r.status.toUpperCase(),
      'Time': r.status === 'present' || r.status === 'late' ? r.time.toLocaleString('en-GB') : '',
    }));

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(data);

    res.header('Content-Type', 'text/csv');
    res.attachment(`attendance_${session.id}.csv`);
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
}

async function renderGlobalAttendance(req, res, next) {
  try {
    const classrooms = await Classroom.find({ teacher: req.user.id, isArchived: false }).sort({ createdAt: -1 });
    return res.render('teacher/attendance/global', {
      title: 'Attendance',
      classrooms,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderAttendanceIndex,
  createSession,
  renderLiveSession,
  apiGenerateCode,
  closeSession,
  renderRecords,
  updateRecordStatus,
  exportCSV,
  renderGlobalAttendance,
};
