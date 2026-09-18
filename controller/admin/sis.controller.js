const User = require('../../models/User');
const Classroom = require('../../models/Classroom');
const ClassroomMember = require('../../models/ClassroomMember');
const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');
const Exam = require('../../models/Exam');
const ExamSubmission = require('../../models/ExamSubmission');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');
const bcrypt = require('bcrypt');

/**
 * Renders the Admin SIS Integration Panel
 */
async function renderSISPanel(req, res, next) {
  try {
    const classrooms = await Classroom.find().select('name code').lean();
    res.render('admin/sis/sis-panel', {
      title: 'Tích hợp hệ thống trường học (SIS)',
      classrooms,
      activeNav: 'sis',
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Parses uploaded CSV roster and registers/enrolls students
 */
async function importRosterHandler(req, res, next) {
  try {
    const { classroomId } = req.body;
    if (!req.file) {
      req.flash('message', 'Vui lòng chọn tệp CSV để nhập liệu');
      req.flash('type', 'error');
      return res.redirect('/admin/sis');
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      req.flash('message', 'Lớp học không tồn tại');
      req.flash('type', 'error');
      return res.redirect('/admin/sis');
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);

    // Expected format: MSSV,Name,Email
    let importCount = 0;
    let skipCount = 0;

    const salt = await bcrypt.genSalt(10);
    const defaultPasswordHash = await bcrypt.hash('123456', salt);

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      if (parts.length < 3) continue;

      const [mssv, name, email] = parts;
      if (!email || !name) continue;

      // 1. Check/Create Student account
      let user = await User.findOne({ email });
      if (!user) {
        user = new User({
          name,
          email,
          password: defaultPasswordHash,
          role: 'student',
          status: 'active'
        });
        await user.save();
      }

      // 2. Enroll student directly
      const existingMember = await ClassroomMember.findOne({
        classroom: classroomId,
        student: user._id
      });

      if (!existingMember) {
        const member = new ClassroomMember({
          classroom: classroomId,
          student: user._id,
          status: 'approved'
        });
        await member.save();
        importCount++;
      } else {
        skipCount++;
      }
    }

    req.flash('message', `Đồng bộ thành công! Nhập mới ${importCount} sinh viên, bỏ qua ${skipCount} sinh viên đã tồn tại.`);
    req.flash('type', 'success');
    res.redirect('/admin/sis');
  } catch (error) {
    return next(error);
  }
}

/**
 * Exports gradebook into credit-compliant CSV transcript
 */
async function exportGradesHandler(req, res, next) {
  try {
    const { classroomId } = req.params;

    const classroom = await Classroom.findById(classroomId).lean();
    if (!classroom) {
      return res.status(404).send('Lớp học không tồn tại');
    }

    const members = await ClassroomMember.find({ classroom: classroomId, status: 'approved' })
      .populate('student')
      .lean();

    const assignments = await Assignment.find({ classroom: classroomId }).lean();
    const exams = await Exam.find({ classroom: classroomId }).lean();
    const sessions = await AttendanceSession.find({ classroom: classroomId }).lean();
    const sessionIds = sessions.map(s => s._id);

    // Build academic grade table
    let csvString = '\uFEFF'; // UTF-8 BOM to display Vietnamese in Excel
    csvString += 'Mã Lớp,Tên Lớp,Mã sinh viên,Họ tên,Email,Tỉ lệ điểm danh (10%),Điểm bài tập (30%),Điểm thi (60%),Điểm tổng kết (Hệ 10),Điểm chữ,Điểm hệ 4\n';

    for (const m of members) {
      if (!m.student) continue;
      const studentId = m.student._id;

      // 1. Attendance Calculation (10% weight)
      const attendCount = sessionIds.length ? await AttendanceRecord.countDocuments({
        student: studentId,
        session: { $in: sessionIds },
        status: 'present'
      }) : 0;
      const attendRate = sessionIds.length ? Math.round((attendCount / sessionIds.length) * 100) : 100;
      const attendanceScore = (attendRate / 100) * 10; // Max 10 pts

      // 2. Assignment Score (30% weight)
      const submissions = await Submission.find({
        student: studentId,
        assignment: { $in: assignments.map(a => a._id) },
        status: 'graded'
      }).lean();
      
      let assignTotal = 0;
      submissions.forEach(s => { assignTotal += (s.score || 0); });
      const assignAvg = assignments.length > 0 ? (assignTotal / assignments.length) : 10; // Out of 10
      const assignmentScore = assignAvg;

      // 3. Exam Score (60% weight)
      const examSubmissions = await ExamSubmission.find({
        student: studentId,
        exam: { $in: exams.map(e => e._id) },
        status: 'graded'
      }).lean();

      let examTotal = 0;
      examSubmissions.forEach(es => { examTotal += (es.score || 0); });
      const examAvg = exams.length > 0 ? (examTotal / exams.length) : 10; // Out of 10
      const examScore = examAvg;

      // 4. Overall calculations
      const totalScore = Math.min(10, (attendanceScore * 0.1) + (assignmentScore * 0.3) + (examScore * 0.6));
      const roundedScore = Math.round(totalScore * 10) / 10;

      // Convert to Letter Grade
      let letterGrade = 'F';
      let gpa = 0.0;

      if (roundedScore >= 9.0) { letterGrade = 'A'; gpa = 4.0; }
      else if (roundedScore >= 8.0) { letterGrade = 'B'; gpa = 3.0; }
      else if (roundedScore >= 6.5) { letterGrade = 'C'; gpa = 2.0; }
      else if (roundedScore >= 5.0) { letterGrade = 'D'; gpa = 1.0; }
      else { letterGrade = 'F'; gpa = 0.0; }

      // Safe CSV escaping
      const studentName = m.student.name.replace(/,/g, '');
      csvString += `${classroom.code},${classroom.name},${m.student._id},${studentName},${m.student.email},${attendRate}%,${Math.round(assignAvg*10)/10},${Math.round(examAvg*10)/10},${roundedScore},${letterGrade},${gpa}\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=BangDiem_${classroom.code}_OBE.csv`);
    return res.status(200).send(csvString);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderSISPanel,
  importRosterHandler,
  exportGradesHandler,
};
