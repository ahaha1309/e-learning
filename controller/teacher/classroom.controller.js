const { validationResult } = require('express-validator');
const { Parser } = require('json2csv');
const Classroom = require('../../models/Classroom');
const ClassroomMember = require('../../models/ClassroomMember');
const Category = require('../../models/Category');
const { computeGradebook } = require('../../services/gradebook.service');
const meetingService = require('../../services/meeting.service');

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderClassroomIndex(req, res, next) {
  try {
    const classrooms = await Classroom.find({ teacher: req.user.id, isArchived: false }).sort({ createdAt: -1 });

    return res.render('teacher/classrooms/index', {
      title: 'Teacher classrooms',
      classrooms,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderCreateClassroom(req, res, next) {
  try {
    return res.render('teacher/classrooms/new', {
      title: 'Tạo lớp học',
      errorMessage: null,
      formData: {},
    });
  } catch (error) {
    next(error);
  }
}

async function createClassroomHandler(req, res, next) {
  try {
    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('teacher/classrooms/new', {
        title: 'Tạo lớp học',
        errorMessage: validationMessage,
        formData: req.body,
      });
    }

    const classroom = new Classroom({
      name: req.body.name,
      description: req.body.description || '',
      teacher: req.user.id,
      approvalRequired: req.body.approvalRequired !== 'false',
    });

    await classroom.save();
    return res.redirect(`/teacher/classrooms/${classroom.id}?feedback=${encodeURIComponent('Đã tạo lớp học thành công.')}`);
  } catch (error) {
    return next(error);
  }
}

async function renderClassroomDetail(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const members = await ClassroomMember.find({ classroom: classroom.id }).populate('student').sort({ requestedAt: -1 });
    const io = req.app.get('io');
    const activeMeeting = await meetingService.getActiveOrUpcomingMeeting(classroom.id, io);

    return res.render('teacher/classrooms/show', {
      title: classroom.name,
      classroom,
      members,
      activeMeeting,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderEditClassroom(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    return res.render('teacher/classrooms/edit', {
      title: 'Chỉnh sửa lớp học',
      classroom,
      errorMessage: null,
      formData: {
        name: classroom.name,
        description: classroom.description || '',
        approvalRequired: classroom.approvalRequired ? 'true' : 'false',
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateClassroomHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    classroom.name = req.body.name;
    classroom.description = req.body.description || '';
    classroom.approvalRequired = req.body.approvalRequired !== 'false';

    await classroom.save();
    return res.redirect(`/teacher/classrooms/${classroom.id}?feedback=${encodeURIComponent('Đã lưu thay đổi.')}`);
  } catch (error) {
    return next(error);
  }
}

async function deleteClassroomHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    classroom.isArchived = true;
    await classroom.save();

    return res.redirect(`/teacher/classrooms?feedback=${encodeURIComponent('Đã xóa lớp học thành công.')}`);
  } catch (error) {
    return next(error);
  }
}

async function approveMemberHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const member = await ClassroomMember.findOne({ _id: req.params.memberId, classroom: classroom.id });
    if (!member) {
      return res.status(404).render('errors/404', {
        title: 'Member not found',
        path: req.originalUrl,
      });
    }

    member.status = 'approved';
    member.approvedAt = new Date();
    await member.save();

    return res.redirect(`/teacher/classrooms/${classroom.id}?feedback=${encodeURIComponent('Student approved.')}`);
  } catch (error) {
    return next(error);
  }
}

async function rejectMemberHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const member = await ClassroomMember.findOne({ _id: req.params.memberId, classroom: classroom.id });
    if (!member) {
      return res.status(404).render('errors/404', {
        title: 'Member not found',
        path: req.originalUrl,
      });
    }

    member.status = 'rejected';
    await member.save();

    return res.redirect(`/teacher/classrooms/${classroom.id}?feedback=${encodeURIComponent('Student rejected.')}`);
  } catch (error) {
    return next(error);
  }
}

async function removeMemberHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const member = await ClassroomMember.findOneAndDelete({ _id: req.params.memberId, classroom: classroom.id });
    if (!member) {
      return res.status(404).render('errors/404', {
        title: 'Member not found',
        path: req.originalUrl,
      });
    }

    return res.redirect(`/teacher/classrooms/${classroom.id}?feedback=${encodeURIComponent('Student removed from classroom.')}`);
  } catch (error) {
    return next(error);
  }
}

async function renderGradebook(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    // One row per approved student with their computed gradebook. Fetches
    // members then grades them — N small reads, acceptable for classroom scale.
    const members = await ClassroomMember.find({ classroom: classroom.id, status: 'approved' })
      .populate('student', 'name email')
      .sort({ requestedAt: -1 });

    const rows = await Promise.all(
      members.map(async (m) => {
        // m.student is populated (name, email); its _id is the student id.
        const studentId = m.student ? String(m.student._id || m.student.id) : null;
        const gradebook = studentId
          ? await computeGradebook({ ...classroom.toObject(), _id: classroom.id }, studentId)
          : { overallPercent: 0, letter: null, byType: {} };
        return {
          member: m,
          studentName: m.student ? m.student.name : '(removed)',
          studentEmail: m.student ? m.student.email : '',
          overallPercent: gradebook.overallPercent,
          letter: gradebook.letter,
          byType: gradebook.byType,
        };
      })
    );

    return res.render('teacher/classrooms/gradebook', {
      title: `${classroom.name} gradebook`,
      classroom,
      rows,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function exportGradebookCsv(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const members = await ClassroomMember.find({ classroom: classroom.id, status: 'approved' })
      .populate('student', 'name email')
      .sort({ requestedAt: -1 });

    const gradebooks = await Promise.all(
      members.map((m) => {
        const studentId = m.student ? String(m.student._id || m.student.id) : null;
        return studentId
          ? computeGradebook({ ...classroom.toObject(), _id: classroom.id }, studentId)
          : Promise.resolve({ overallPercent: 0, letter: null, byType: {} });
      })
    );

    const fields = ['name', 'email', 'overallPercent', 'letter', 'assignmentsAvg', 'examsAvg'];
    const data = members.map((m, i) => ({
      name: m.student ? m.student.name : '',
      email: m.student ? m.student.email : '',
      overallPercent: gradebooks[i].overallPercent,
      letter: gradebooks[i].letter || '',
      assignmentsAvg: (gradebooks[i].byType.ASSIGNMENT && gradebooks[i].byType.ASSIGNMENT.percent) !== undefined ? gradebooks[i].byType.ASSIGNMENT.percent : '',
      examsAvg: (gradebooks[i].byType.EXAM && gradebooks[i].byType.EXAM.percent) !== undefined ? gradebooks[i].byType.EXAM.percent : '',
    }));

    const parser = new Parser({ fields });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gradebook-${classroom.id}.csv"`);
    return res.send(parser.parse(data));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderClassroomIndex,
  renderCreateClassroom,
  createClassroomHandler,
  renderClassroomDetail,
  renderEditClassroom,
  updateClassroomHandler,
  deleteClassroomHandler,
  approveMemberHandler,
  rejectMemberHandler,
  removeMemberHandler,
  renderGradebook,
  exportGradebookCsv,
};
