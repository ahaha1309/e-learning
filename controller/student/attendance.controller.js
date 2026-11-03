const ClassroomMember = require('../../models/ClassroomMember');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');

// Mark the student present in the session. Returns true if they were already present.
async function markPresent(session, studentId) {
  // The teacher controller automatically generated 'absent' records for all students when the session started.
  const record = await AttendanceRecord.findOne({ session: session.id, student: studentId });
  if (record) {
    if (record.status === 'present') return true;
    record.status = 'present';
    record.time = new Date();
    await record.save();
  } else {
    // Fallback if record was missing for some reason
    await AttendanceRecord.create({
      session: session.id,
      student: studentId,
      status: 'present',
      time: new Date()
    });
  }
  return false;
}

async function renderCheckin(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId,
      student: req.user.id,
      status: 'approved'
    }).populate('classroom');
    if (!membership || !membership.classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    const classroom = membership.classroom;

    // Check if there is an active session
    const activeSession = await AttendanceSession.findOne({
      classroom: classroom.id,
      status: 'open'
    }).sort({ createdAt: -1 });

    return res.render('student/attendance/checkin', {
      title: 'Attendance Check-in',
      classroom,
      activeSession,
      feedback: req.query.feedback || null,
      errorMessage: req.query.error || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function submitCheckin(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId,
      student: req.user.id,
      status: 'approved'
    }).populate('classroom');
    if (!membership || !membership.classroom) return res.status(404).send('Classroom not found');
    
    const classroom = membership.classroom;

    const code = req.body.code?.toString().trim();
    if (!code) {
      return res.redirect(`/student/classrooms/${classroom.id}/attendance?error=Please+enter+a+code`);
    }

    const session = await AttendanceSession.findOne({
      classroom: classroom.id,
      status: 'open'
    }).sort({ createdAt: -1 });

    if (!session) {
      return res.redirect(`/student/classrooms/${classroom.id}/attendance?error=No+active+attendance+session`);
    }

    // Verify code and expiry
    if (session.currentCode !== code) {
      return res.redirect(`/student/classrooms/${classroom.id}/attendance?error=Invalid+Code`);
    }

    if (new Date() > session.expiresAt) {
      return res.redirect(`/student/classrooms/${classroom.id}/attendance?error=Code+Expired.+Please+look+at+the+screen+for+the+new+code`);
    }

    const alreadyPresent = await markPresent(session, req.user.id);
    if (alreadyPresent) {
      return res.redirect(`/student/classrooms/${classroom.id}/attendance?feedback=You+have+already+checked+in`);
    }

    return res.redirect(`/student/classrooms/${classroom.id}/attendance?feedback=Check-in+Successful`);
  } catch (error) {
    return next(error);
  }
}

// Check-in by scanning the QR code shown on the teacher's screen.
// The QR encodes /student/classrooms/:classroomId/attendance/qr?t=<token>; the token is
// random and rotates every 30s, so it also protects this GET from being forged.
async function qrCheckin(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({
      classroom: req.params.classroomId,
      student: req.user.id,
      status: 'approved'
    }).populate('classroom');
    if (!membership || !membership.classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    const classroom = membership.classroom;
    const token = req.query.t?.toString().trim();

    const session = await AttendanceSession.findOne({
      classroom: classroom.id,
      status: 'open',
      method: 'qr'
    }).sort({ createdAt: -1 });

    if (!session) {
      return res.redirect(`/student/classrooms/${classroom.id}/attendance?error=No+active+QR+attendance+session`);
    }

    if (!token || session.currentCode !== token) {
      return res.redirect(`/student/classrooms/${classroom.id}/attendance?error=QR+code+invalid+or+expired.+Please+scan+the+new+QR+code`);
    }

    if (new Date() > session.expiresAt) {
      return res.redirect(`/student/classrooms/${classroom.id}/attendance?error=QR+code+expired.+Please+scan+the+new+QR+code`);
    }

    const alreadyPresent = await markPresent(session, req.user.id);
    if (alreadyPresent) {
      return res.redirect(`/student/classrooms/${classroom.id}/attendance?feedback=You+have+already+checked+in`);
    }

    return res.redirect(`/student/classrooms/${classroom.id}/attendance?feedback=Check-in+Successful`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderCheckin,
  submitCheckin,
  qrCheckin
};
