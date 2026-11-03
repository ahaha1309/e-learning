const { validationResult } = require('express-validator');
const { Parser } = require('json2csv');
const Classroom = require('../../models/Classroom');
const ClassroomMember = require('../../models/ClassroomMember');
const Category = require('../../models/Category');
const { computeGradebook } = require('../../services/gradebook.service');
const meetingService = require('../../services/meeting.service');
const User = require('../../models/User');

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
    return res.redirect(`/teacher/classrooms/${classroom.id}?feedback=${encodeURIComponent('Đã tạo lớp học thành công.')}&showAddStudents=true`);
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
      showAddStudents: req.query.showAddStudents === 'true',
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
          studentEmail: m.student ? m.student.email : '',
          gradebook
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

    const fields = [
      { label: 'Sinh viên', value: 'name' },
      { label: 'Email', value: 'email' },
      { label: 'Điểm C (Chuyên cần)', value: 'attendance' },
      { label: 'Điểm B (Giữa kỳ)', value: 'midterm' },
      { label: 'Điểm A (Kết thúc môn)', value: 'final' },
      { label: 'Tổng kết', value: 'total' },
      { label: 'Điểm chữ', value: 'letter' },
      { label: 'Hệ 4', value: 'grade4' },
      { label: 'Xếp loại', value: 'classification' }
    ];

    const data = members.map((m, i) => {
      const g = gradebooks[i];
      return {
        name: m.student ? m.student.name : '',
        email: m.student ? m.student.email : '',
        attendance: g.attendanceScore != null ? g.attendanceScore : 'Chưa đủ điểm',
        midterm: g.midtermScore != null ? g.midtermScore : (g.midtermCount > 0 ? 'Chưa đủ điểm' : 'Chưa có điểm'),
        final: g.finalScore != null ? g.finalScore : (g.hasFinalDef ? 'Chưa đủ điểm' : 'Chưa có điểm'),
        total: g.totalScore != null ? g.totalScore : 'Chưa đủ điểm',
        letter: g.letterGrade || '',
        grade4: g.grade4 != null ? g.grade4 : '',
        classification: g.classification || ''
      };
    });

    const parser = new Parser({ fields });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`gradebook - ${classroom.name}.csv`);
    return res.send('\uFEFF' + parser.parse(data));
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
  updateManualGradesApi: async function(req, res, next) {
    try {
      const classroomId = req.params.classroomId;
      const memberId = req.params.memberId;
      const classroom = await Classroom.findOne({ _id: classroomId, teacher: req.user.id });
      if (!classroom) return res.status(404).json({ error: 'Classroom not found' });

      const member = await ClassroomMember.findOne({ _id: memberId, classroom: classroomId });
      if (!member) return res.status(404).json({ error: 'Member not found' });

      if (req.body.attendanceScore !== undefined) {
        member.attendanceScore = req.body.attendanceScore === '' ? null : Number(req.body.attendanceScore);
      }
      
      if (req.body.useManualMidterm !== undefined) {
        member.useManualMidterm = req.body.useManualMidterm === true || req.body.useManualMidterm === 'true';
      }
      if (req.body.manualMidtermScore !== undefined) {
        member.manualMidtermScore = req.body.manualMidtermScore === '' ? null : Number(req.body.manualMidtermScore);
      }
      
      if (req.body.useManualFinal !== undefined) {
        member.useManualFinal = req.body.useManualFinal === true || req.body.useManualFinal === 'true';
      }
      if (req.body.manualFinalScore !== undefined) {
        member.manualFinalScore = req.body.manualFinalScore === '' ? null : Number(req.body.manualFinalScore);
      }

      await member.save();
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
};

async function searchStudentsApi(req, res, next) {
  try {
    const query = req.query.q || '';
    if (!query) {
      return res.json([]);
    }

    const classroomId = req.params.classroomId;
    // Find students matching query
    const regex = new RegExp(query, 'i');
    let students = await User.find({
      role: 'student',
      status: 'active',
      $or: [{ name: regex }, { email: regex }]
    }).limit(10).select('name email avatarUrl');

    // Exclude students already in the classroom
    if (classroomId) {
      const existingMembers = await ClassroomMember.find({ classroom: classroomId }).select('student');
      const existingStudentIds = existingMembers.map(m => m.student.toString());
      students = students.filter(s => !existingStudentIds.includes(s._id.toString()));
    }

    return res.json(students);
  } catch (error) {
    return next(error);
  }
}

async function addManualMembersApi(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const studentIds = req.body.studentIds;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'No students selected' });
    }

    const addedMembers = [];
    for (const studentId of studentIds) {
      // Check if already member
      const existing = await ClassroomMember.findOne({ classroom: classroom.id, student: studentId });
      if (!existing) {
        const member = new ClassroomMember({
          classroom: classroom.id,
          student: studentId,
          status: 'active', // Add directly as active
          approvedAt: new Date()
        });
        await member.save();
        addedMembers.push(member);
      }
    }

    return res.json({ success: true, count: addedMembers.length });
  } catch (error) {
    return next(error);
  }
}

module.exports.searchStudentsApi = searchStudentsApi;
module.exports.addManualMembersApi = addManualMembersApi;
