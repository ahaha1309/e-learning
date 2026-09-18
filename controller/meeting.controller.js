const Classroom = require('../models/Classroom');
const ClassroomMember = require('../models/ClassroomMember');
const Meeting = require('../models/Meeting');
const meetingService = require('../services/meeting.service');

async function createMeetingHandler(req, res, next) {
  try {
    const { classroomId } = req.params;
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(403).json({ error: 'Not authorized or classroom not found' });
    }

    const { title, description, startTime, durationMinutes, startNow } = req.body;
    if (!title || !title.trim()) {
      req.flash('error', 'Meeting title is required.');
      return res.redirect(`/teacher/classrooms/${classroomId}`);
    }

    const isStartNow = startNow === 'true' || startNow === true;
    const io = req.app.get('io');

    const meeting = await meetingService.createMeeting(
      {
        classroomId,
        teacherId: req.user.id,
        title: title.trim(),
        description: description ? description.trim() : '',
        startTime: startTime || new Date(),
        durationMinutes: durationMinutes ? Number(durationMinutes) : 60,
        startNow: isStartNow,
      },
      io
    );

    const feedbackMsg = isStartNow ? 'Cuộc họp đã được bắt đầu!' : 'Đã lên lịch cuộc họp thành công!';

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, meeting, message: feedbackMsg });
    }

    if (isStartNow || meeting.status === 'LIVE') {
      return res.redirect(`/classrooms/${classroomId}/meetings/${meeting._id}/room`);
    }

    return res.redirect(`/teacher/classrooms/${classroomId}?feedback=${encodeURIComponent(feedbackMsg)}`);
  } catch (error) {
    return next(error);
  }
}

async function startEarlyHandler(req, res, next) {
  try {
    const { classroomId, meetingId } = req.params;
    const io = req.app.get('io');

    await meetingService.startEarly(meetingId, req.user.id, io);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, message: 'Cuộc họp đã bắt đầu!' });
    }

    return res.redirect(`/classrooms/${classroomId}/meetings/${meetingId}/room`);
  } catch (error) {
    return next(error);
  }
}

async function endMeetingHandler(req, res, next) {
  try {
    const { classroomId, meetingId } = req.params;
    const io = req.app.get('io');

    await meetingService.endMeeting(meetingId, req.user.id, io);
    const feedbackMsg = 'Đã kết thúc cuộc họp.';

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, message: feedbackMsg });
    }

    return res.redirect(`/teacher/classrooms/${classroomId}?feedback=${encodeURIComponent(feedbackMsg)}`);
  } catch (error) {
    return next(error);
  }
}

async function cancelMeetingHandler(req, res, next) {
  try {
    const { classroomId, meetingId } = req.params;
    const io = req.app.get('io');

    await meetingService.cancelMeeting(meetingId, req.user.id, io);
    const feedbackMsg = 'Đã hủy cuộc họp.';

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, message: feedbackMsg });
    }

    return res.redirect(`/teacher/classrooms/${classroomId}?feedback=${encodeURIComponent(feedbackMsg)}`);
  } catch (error) {
    return next(error);
  }
}

async function renderMeetingRoom(req, res, next) {
  try {
    const { classroomId, meetingId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check classroom authorization
    const classroom = await Classroom.findById(classroomId).populate('teacher', 'name email avatarUrl');
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Lớp học không tồn tại', path: req.originalUrl });
    }

    const isTeacher = String(classroom.teacher._id || classroom.teacher) === String(userId) || userRole === 'admin';
    let isStudent = false;

    if (!isTeacher) {
      const membership = await ClassroomMember.findOne({
        classroom: classroomId,
        student: userId,
        status: 'approved',
      });
      if (membership) {
        isStudent = true;
      }
    }

    if (!isTeacher && !isStudent) {
      return res.status(403).render('errors/403', {
        title: 'Truy cập bị từ chối',
        message: 'Bạn không phải là thành viên của lớp học này để tham gia cuộc họp.',
        path: req.originalUrl,
      });
    }

    let meeting = await Meeting.findOne({ _id: meetingId, classroom: classroomId }).populate('teacher', 'name email avatarUrl');
    if (!meeting) {
      return res.status(404).render('errors/404', { title: 'Cuộc họp không tồn tại', path: req.originalUrl });
    }

    // Sync status
    const io = req.app.get('io');
    meeting = await meetingService.syncMeetingStatus(meeting, io);

    // If meeting is cancelled or ended, alert user and redirect back to classroom
    if (meeting.status === 'CANCELLED' || meeting.status === 'ENDED') {
      const redirectUrl = isTeacher ? `/teacher/classrooms/${classroomId}` : `/student/classrooms/${classroomId}`;
      const msg = meeting.status === 'ENDED' ? 'Cuộc họp này đã kết thúc.' : 'Cuộc họp này đã bị hủy.';
      return res.redirect(`${redirectUrl}?feedback=${encodeURIComponent(msg)}`);
    }

    return res.render('meeting/room', {
      title: `Cuộc họp: ${meeting.title}`,
      classroom,
      meeting,
      isTeacher,
      currentUser: req.user,
    });
  } catch (error) {
    return next(error);
  }
}

async function getActiveMeetingApi(req, res, next) {
  try {
    const { classroomId } = req.params;
    const io = req.app.get('io');
    const meeting = await meetingService.getActiveOrUpcomingMeeting(classroomId, io);
    return res.json({ meeting });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createMeetingHandler,
  startEarlyHandler,
  endMeetingHandler,
  cancelMeetingHandler,
  renderMeetingRoom,
  getActiveMeetingApi,
};
