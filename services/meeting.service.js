const crypto = require('crypto');
const Meeting = require('../models/Meeting');
const ClassroomMember = require('../models/ClassroomMember');
const Classroom = require('../models/Classroom');
const Notification = require('../models/Notification');

/**
 * Synchronizes the status of a meeting based on current system time.
 * SCHEDULED -> LIVE (when now >= startTime and now < endTime)
 * LIVE/SCHEDULED -> ENDED (when now >= endTime)
 */
async function syncMeetingStatus(meeting, io = null) {
  if (!meeting) return null;
  const now = new Date();
  let statusChanged = false;
  let oldStatus = meeting.status;

  if (meeting.status === 'SCHEDULED' && now >= new Date(meeting.startTime) && now < new Date(meeting.endTime)) {
    meeting.status = 'LIVE';
    statusChanged = true;
  } else if ((meeting.status === 'LIVE' || meeting.status === 'SCHEDULED') && now >= new Date(meeting.endTime)) {
    meeting.status = 'ENDED';
    statusChanged = true;
  }

  if (statusChanged) {
    await meeting.save();
    await meeting.populate('teacher', 'name email avatarUrl');
    if (io) {
      io.of('/meeting').to(`classroom:${meeting.classroom}`).emit('meeting:status_changed', {
        classroomId: String(meeting.classroom),
        meetingId: String(meeting._id),
        oldStatus,
        newStatus: meeting.status,
        meeting,
      });
    }
  }

  return meeting;
}

/**
 * Gets the active (LIVE) meeting or the closest upcoming (SCHEDULED) meeting for a classroom.
 * Ensures state is synced before returning.
 */
async function getActiveOrUpcomingMeeting(classroomId, io = null) {
  const now = new Date();

  // 1. Check for any LIVE meeting
  let liveMeeting = await Meeting.findOne({ classroom: classroomId, status: 'LIVE' }).populate('teacher', 'name email avatarUrl');
  if (liveMeeting) {
    liveMeeting = await syncMeetingStatus(liveMeeting, io);
    if (liveMeeting && liveMeeting.status === 'LIVE') {
      return liveMeeting;
    }
  }

  // 2. Check for closest SCHEDULED meeting
  let scheduledMeetings = await Meeting.find({
    classroom: classroomId,
    status: 'SCHEDULED',
    endTime: { $gt: now },
  })
    .sort({ startTime: 1 })
    .populate('teacher', 'name email avatarUrl');

  for (let mtg of scheduledMeetings) {
    let synced = await syncMeetingStatus(mtg, io);
    if (synced && (synced.status === 'LIVE' || synced.status === 'SCHEDULED')) {
      return synced;
    }
  }

  return null;
}

/**
 * Creates a new meeting (either instant Start Now or Schedule for later)
 */
async function createMeeting(
  { classroomId, teacherId, title, description, startTime, durationMinutes = 60, startNow = false },
  io = null
) {
  const classroom = await Classroom.findById(classroomId);
  if (!classroom) {
    throw new Error('Classroom not found');
  }

  const roomId = `room_${classroomId}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  let parsedStartTime;
  let status;

  if (startNow) {
    parsedStartTime = now;
    status = 'LIVE';
  } else {
    parsedStartTime = new Date(startTime);
    if (isNaN(parsedStartTime.getTime())) {
      throw new Error('Invalid start time');
    }
    // If start time is already reached, set to LIVE
    if (parsedStartTime <= now) {
      status = 'LIVE';
      parsedStartTime = now;
    } else {
      status = 'SCHEDULED';
    }
  }

  const duration = Number(durationMinutes) || 60;
  const parsedEndTime = new Date(parsedStartTime.getTime() + duration * 60 * 1000);

  const meeting = new Meeting({
    classroom: classroomId,
    teacher: teacherId,
    title: title.trim(),
    description: (description || '').trim(),
    startTime: parsedStartTime,
    endTime: parsedEndTime,
    durationMinutes: duration,
    status,
    roomId,
  });

  await meeting.save();
  await meeting.populate('teacher', 'name email avatarUrl');

  // Notify students of the classroom
  try {
    const approvedMembers = await ClassroomMember.find({ classroom: classroomId, status: 'approved' });
    const notifications = approvedMembers.map((member) => ({
      recipient: member.student,
      title: status === 'LIVE' ? `🔴 Cuộc họp đang diễn ra: ${title}` : `📅 Cuộc họp mới: ${title}`,
      message:
        status === 'LIVE'
          ? `Lớp ${classroom.name} có cuộc họp đang diễn ra: "${title}".`
          : `Lớp ${classroom.name} có lịch họp mới: "${title}" lúc ${parsedStartTime.toLocaleString('vi-VN')}.`,
      link: `/student/classrooms/${classroomId}`,
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error('Failed to send meeting notifications:', err);
  }

  // Emit socket event
  if (io) {
    io.of('/meeting').to(`classroom:${classroomId}`).emit('meeting:status_changed', {
      classroomId: String(classroomId),
      meetingId: String(meeting._id),
      oldStatus: null,
      newStatus: meeting.status,
      meeting,
    });
  }

  return meeting;
}

/**
 * Teacher starts a scheduled meeting early
 */
async function startEarly(meetingId, teacherId, io = null) {
  const meeting = await Meeting.findOne({ _id: meetingId, teacher: teacherId });
  if (!meeting) {
    throw new Error('Meeting not found or unauthorized');
  }

  const oldStatus = meeting.status;
  const now = new Date();
  meeting.status = 'LIVE';
  meeting.startTime = now;
  meeting.endTime = new Date(now.getTime() + meeting.durationMinutes * 60 * 1000);
  await meeting.save();
  await meeting.populate('teacher', 'name email avatarUrl');

  if (io) {
    io.of('/meeting').to(`classroom:${meeting.classroom}`).emit('meeting:status_changed', {
      classroomId: String(meeting.classroom),
      meetingId: String(meeting._id),
      oldStatus,
      newStatus: 'LIVE',
      meeting,
    });
  }

  return meeting;
}

/**
 * Teacher ends a meeting
 */
async function endMeeting(meetingId, teacherId, io = null) {
  const meeting = await Meeting.findOne({ _id: meetingId, teacher: teacherId });
  if (!meeting) {
    throw new Error('Meeting not found or unauthorized');
  }

  const oldStatus = meeting.status;
  meeting.status = 'ENDED';
  meeting.endTime = new Date();
  await meeting.save();
  await meeting.populate('teacher', 'name email avatarUrl');

  if (io) {
    io.of('/meeting').to(`classroom:${meeting.classroom}`).emit('meeting:status_changed', {
      classroomId: String(meeting.classroom),
      meetingId: String(meeting._id),
      oldStatus,
      newStatus: 'ENDED',
      meeting,
    });
    io.of('/meeting').to(String(meeting._id)).emit('meeting_ended_by_teacher', {
      message: 'Cuộc họp đã được Giáo viên kết thúc.',
    });
  }

  return meeting;
}

/**
 * Teacher cancels a meeting
 */
async function cancelMeeting(meetingId, teacherId, io = null) {
  const meeting = await Meeting.findOne({ _id: meetingId, teacher: teacherId });
  if (!meeting) {
    throw new Error('Meeting not found or unauthorized');
  }

  const oldStatus = meeting.status;
  meeting.status = 'CANCELLED';
  await meeting.save();
  await meeting.populate('teacher', 'name email avatarUrl');

  if (io) {
    io.of('/meeting').to(`classroom:${meeting.classroom}`).emit('meeting:status_changed', {
      classroomId: String(meeting.classroom),
      meetingId: String(meeting._id),
      oldStatus,
      newStatus: 'CANCELLED',
      meeting,
    });
    io.of('/meeting').to(String(meeting._id)).emit('meeting_ended_by_teacher', {
      message: 'Cuộc họp này đã bị hủy bởi Giáo viên.',
    });
  }

  return meeting;
}

/**
 * Automatically ends a meeting when zero participants remain
 */
async function autoEndEmptyMeeting(meetingId, io = null) {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting || meeting.status !== 'LIVE') return null;

  const oldStatus = meeting.status;
  meeting.status = 'ENDED';
  meeting.endTime = new Date();
  await meeting.save();
  await meeting.populate('teacher', 'name email avatarUrl');

  if (io) {
    io.of('/meeting').to(`classroom:${meeting.classroom}`).emit('meeting:status_changed', {
      classroomId: String(meeting.classroom),
      meetingId: String(meeting._id),
      oldStatus,
      newStatus: 'ENDED',
      meeting,
    });
    io.of('/meeting').to(String(meetingId)).emit('meeting_ended_automatically', {
      message: 'Cuộc họp đã tự động kết thúc vì không còn ai tham gia.',
    });
  }

  return meeting;
}

/**
 * Periodically background-syncs status for all active & scheduled meetings
 */
async function runBackgroundStatusSync(io = null) {
  try {
    const meetings = await Meeting.find({ status: { $in: ['SCHEDULED', 'LIVE'] } });
    for (let meeting of meetings) {
      await syncMeetingStatus(meeting, io);
    }
  } catch (err) {
    console.error('Error running background status sync:', err);
  }
}

module.exports = {
  syncMeetingStatus,
  getActiveOrUpcomingMeeting,
  createMeeting,
  startEarly,
  endMeeting,
  cancelMeeting,
  autoEndEmptyMeeting,
  runBackgroundStatusSync,
};
