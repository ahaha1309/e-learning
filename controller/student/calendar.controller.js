const ClassroomMember = require('../../models/ClassroomMember');
const Meeting = require('../../models/Meeting');

async function renderStudentCalendar(req, res, next) {
  try {
    const memberships = await ClassroomMember.find({ student: req.user.id, status: 'approved' })
      .populate('classroom', 'name code text').lean();
    const valid = memberships.filter(m => m.classroom);
    const classroomIds = valid.map(m => m.classroom._id);

    let events = [];
    if (classroomIds.length) {
      const meetings = await Meeting.find({ classroom: { $in: classroomIds } })
        .populate('classroom', 'name code').lean();
      
      events = meetings.map(m => {
        // Color events based on status with light bg and dark text for better readability
        let bg = 'rgba(79, 70, 229, 0.15)'; // Default primary light
        let textCol = '#4F46E5';
        let borderCol = '#4F46E5';
        
        if (m.status === 'LIVE') { 
          bg = 'rgba(239, 68, 68, 0.15)'; textCol = '#b91c1c'; borderCol = '#ef4444'; 
        } else if (m.status === 'CANCELLED') { 
          bg = 'rgba(156, 163, 175, 0.15)'; textCol = '#4b5563'; borderCol = '#9ca3af'; 
        } else if (m.status === 'ENDED') { 
          bg = 'rgba(16, 185, 129, 0.15)'; textCol = '#047857'; borderCol = '#10b981'; 
        }

        return {
          id: m._id,
          title: m.title,
          start: m.startTime,
          end: m.endTime,
          url: m.status === 'CANCELLED' ? '#' : `/classrooms/${m.classroom._id}/meetings/${m._id}/room`,
          backgroundColor: bg,
          borderColor: borderCol,
          textColor: textCol,
          extendedProps: {
            classroomName: m.classroom.name,
            classroomCode: m.classroom.code,
            status: m.status
          }
        };
      });
    }

    return res.render('student/calendar/index', {
      title: 'Lịch Học Tập',
      eventsJson: JSON.stringify(events)
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderStudentCalendar
};
