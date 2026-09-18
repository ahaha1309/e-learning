const Classroom = require('../../models/Classroom');
const ClassroomMember = require('../../models/ClassroomMember');
const Submission = require('../../models/Submission');
const ExamSubmission = require('../../models/ExamSubmission');
const Exam = require('../../models/Exam');
const Assignment = require('../../models/Assignment');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');
const Notification = require('../../models/Notification');
const SystemSetting = require('../../models/SystemSetting');

const DAY = 86400000;
const HOUR = 3600000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function relabelDue(date) {
  const now = startOfDay(new Date());
  const due = startOfDay(date);
  const diffDays = Math.round((due - now) / DAY);
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

async function renderTeacherDashboard(req, res, next) {
  try {
    const teacherId = req.user.id;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY);

    const classrooms = await Classroom.find({ teacher: teacherId, isArchived: false })
      .sort({ createdAt: -1 }).lean();
    const classroomIds = classrooms.map(c => c._id);
    const allClassroomIds = (await Classroom.find({ teacher: teacherId }).distinct('_id'));

    const [submissionCount, totalStudents, pendingSubmissions, allClassSubs, allExamSubs, pendingStudents] = await Promise.all([
      Submission.countDocuments({ teacher: teacherId, status: { $ne: 'graded' } }),
      classroomIds.length ? ClassroomMember.countDocuments({ classroom: { $in: classroomIds }, status: 'approved' }) : 0,
      Submission.find({ teacher: teacherId, status: { $ne: 'graded' } })
        .populate('student', 'name avatarUrl')
        .populate('assignment', 'title')
        .populate('classroom', 'name _id')
        .sort({ submittedAt: -1 }).limit(6).lean(),
      classroomIds.length ? Submission.find({ classroom: { $in: classroomIds }, score: { $ne: null } }).select('score submittedAt createdAt').lean() : [],
      classroomIds.length ? ExamSubmission.find({ classroom: { $in: classroomIds }, score: { $ne: null } }).select('score createdAt').lean() : [],
      classroomIds.length ? ClassroomMember.countDocuments({ classroom: { $in: classroomIds }, status: 'pending' }) : 0
    ]);

    // ── Average score across assignments + exams ──
    const subScores = allClassSubs.map(s => s.score).filter(v => v !== null && v !== undefined);
    const examScores = allExamSubs.map(s => s.score).filter(v => v !== null && v !== undefined);
    const allScores = [...subScores, ...examScores];
    const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;
    const scoresCount = allScores.length;

    // ── Attendance rate across own classrooms ──
    const sessionIds = classroomIds.length ? await AttendanceSession.find({ classroom: { $in: classroomIds } }).distinct('_id') : [];
    const sessionsHeld = sessionIds.length;
    const presentCount = sessionsHeld ? await AttendanceRecord.countDocuments({ session: { $in: sessionIds }, status: 'present' }) : 0;
    const attendanceRate = (sessionsHeld > 0 && totalStudents > 0)
      ? Math.round((presentCount / (sessionsHeld * totalStudents)) * 100)
      : null;

    // ── Grade distribution (latest exam or assignment scores) ──
    const distribution = { labels: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'], data: [0, 0, 0, 0, 0] };
    allScores.forEach(s => {
      if (s <= 20) distribution.data[0]++;
      else if (s <= 40) distribution.data[1]++;
      else if (s <= 60) distribution.data[2]++;
      else if (s <= 80) distribution.data[3]++;
      else distribution.data[4]++;
    });

    // ── Upcoming deadlines: own exams + assignments ending soon ──
    const [dueExams, dueAssignments] = await Promise.all([
      Exam.find({ classroom: { $in: classroomIds }, isActive: true, endTime: { $ne: null, $gte: now } })
        .populate('classroom', 'name _id').sort({ endTime: 1 }).limit(6).lean(),
      Assignment.find({ classroom: { $in: classroomIds }, dueDate: { $ne: null, $gte: now } })
        .populate('classroom', 'name _id').sort({ dueDate: 1 }).limit(6).lean()
    ]);
    const upcoming = [
      ...dueExams.map(e => ({
        type: 'exam', title: e.title, classroom: e.classroom ? e.classroom.name : '',
        due: e.endTime, dueLabel: relabelDue(e.endTime), isUrgent: (e.endTime - now) <= 2 * DAY,
        link: `/teacher/classrooms/${e.classroom ? e.classroom._id : ''}/exams`
      })),
      ...dueAssignments.map(a => ({
        type: 'assignment', title: a.title, classroom: a.classroom ? a.classroom.name : '',
        due: a.dueDate, dueLabel: relabelDue(a.dueDate), isUrgent: (a.dueDate - now) <= 2 * DAY,
        link: `/teacher/classrooms/${a.classroom ? a.classroom._id : ''}/assignments`
      }))
    ].sort((a, b) => a.due - b.due).slice(0, 6);

    // ── Recent activity feed (latest submissions into own classrooms) ──
    const recentSubs = classroomIds.length ? await Submission.find({ classroom: { $in: classroomIds } })
      .sort({ submittedAt: -1, createdAt: -1 }).limit(5)
      .populate('student', 'name avatarUrl').populate('assignment', 'title').populate('classroom', 'name').lean() : [];
    const recentActivity = recentSubs.map(s => ({
      type: s.status === 'graded' ? 'grade' : 'submission',
      studentName: s.student ? s.student.name : 'Student',
      studentAvatar: s.student ? s.student.avatarUrl : null,
      title: s.assignment ? s.assignment.title : 'a submission',
      classroom: s.classroom ? s.classroom.name : '',
      status: s.status,
      timeLabel: relabelRelative(s.submittedAt || s.createdAt)
    }));

    // ── Weekly report: submissions received per day (7 days) ──
    const weekSubs = classroomIds.length ? await Submission.find({ classroom: { $in: classroomIds }, submittedAt: { $gte: weekAgo } }).select('submittedAt createdAt').lean() : [];
    const weekExamSubs = classroomIds.length ? await ExamSubmission.find({ classroom: { $in: classroomIds }, createdAt: { $gte: weekAgo } }).select('createdAt').lean() : [];
    const weekLabels = [];
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = startOfDay(new Date(now.getTime() - i * DAY));
      const dayEnd = new Date(dayStart.getTime() + DAY);
      weekLabels.push(dayStart.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3));
      const sc = weekSubs.filter(s => { const t = s.submittedAt || s.createdAt; return t >= dayStart && t < dayEnd; }).length;
      const ec = weekExamSubs.filter(s => s.createdAt >= dayStart && s.createdAt < dayEnd).length;
      weekData.push(sc + ec);
    }

    // ── Monthly report: submitted items per month (6 months) ──
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthSubsAll = classroomIds.length ? await Submission.find({ classroom: { $in: classroomIds }, submittedAt: { $gte: sixMonthsAgo } }).select('submittedAt createdAt').lean() : [];
    const monthLabels = [];
    const monthData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      monthLabels.push(d.toLocaleDateString('en-US', { month: 'short' }));
      const c = monthSubsAll.filter(s => { const t = s.submittedAt || s.createdAt; return t >= d && t < next; }).length;
      monthData.push(c);
    }

    // ── Heatmap: submissions received per day, last 17 weeks ──
    const heatmapStart = new Date(now.getTime() - 119 * DAY);
    const heatSubs = classroomIds.length ? await Submission.find({ classroom: { $in: classroomIds }, submittedAt: { $gte: heatmapStart } }).select('submittedAt createdAt').lean() : [];
    const heatExamSubs = classroomIds.length ? await ExamSubmission.find({ classroom: { $in: classroomIds }, createdAt: { $gte: heatmapStart } }).select('createdAt').lean() : [];
    const heatMap = {};
    [...heatSubs, ...heatExamSubs].forEach(s => {
      const t = s.submittedAt || s.createdAt;
      const key = startOfDay(t).getTime();
      heatMap[key] = (heatMap[key] || 0) + 1;
    });
    const heatmap = [];
    for (let i = 0; i < 120; i++) {
      const t = startOfDay(new Date(heatmapStart.getTime() + i * DAY)).getTime();
      heatmap.push({ date: t, count: heatMap[t] || 0 });
    }

    // ── Radar: teaching performance dimensions ──
    const engagementRate = totalStudents > 0
      ? Math.min(100, Math.round((scoresCount / Math.max(1, totalStudents * Math.max(1, classrooms.length))) * 100))
      : 0;
    const gradingBacklog = submissionCount;
    const gradingHealth = allScores.length > 0 ? Math.max(0, 100 - Math.min(100, gradingBacklog * 10)) : 100;
    const radar = {
      labels: ['Avg Score', 'Attendance', 'Engagement', 'Grading Throughput', 'Output Volume', 'Responsiveness'],
      data: [
        avgScore !== null ? avgScore : 0,
        attendanceRate !== null ? attendanceRate : 0,
        Math.min(100, engagementRate),
        gradingHealth,
        Math.min(100, scoresCount * 3),
        Math.min(100, 100 - (pendingStudents * 15))
      ]
    };

    // ── Calendar: exams + assignment due dates in current month ──
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const [monthExams, monthAssign] = await Promise.all([
      Exam.find({ classroom: { $in: classroomIds }, isActive: true, endTime: { $gte: monthStart, $lte: monthEnd } }).populate('classroom', 'name').lean(),
      Assignment.find({ classroom: { $in: classroomIds }, dueDate: { $gte: monthStart, $lte: monthEnd } }).populate('classroom', 'name').lean()
    ]);
    const calendarEvents = [
      ...monthExams.map(e => ({ day: new Date(e.endTime).getDate(), type: 'exam', title: e.title, classroom: e.classroom ? e.classroom.name : '' })),
      ...monthAssign.map(a => ({ day: new Date(a.dueDate).getDate(), type: 'assignment', title: a.title, classroom: a.classroom ? a.classroom.name : '' }))
    ];

    // ── AI recommendations: dynamic via Gemini API ──
    const recommendations = await getTeacherRecommendations({
      submissionCount, pendingStudents, avgScore, attendanceRate, upcoming, classrooms, totalStudents
    });

    // ── Notifications ──
    const notifications = await Notification.find({ recipient: teacherId }).sort({ createdAt: -1 }).limit(5).lean();
    const unreadNotifications = await Notification.countDocuments({ recipient: teacherId, isRead: false });

    // ── Quick actions ──
    const quickActions = [
      { label: 'Tạo lớp học', icon: 'ph-plus', href: '/teacher/classrooms/new', tone: 'primary' },
      { label: 'Ngân hàng CH', icon: 'ph-bank', href: '/teacher/question-banks', tone: 'info' },
      { label: 'Phân tích', icon: 'ph-chart-bar', href: '/teacher/analytics', tone: 'warning' },
      { label: 'Lớp học của tôi', icon: 'ph-chalkboard', href: '/teacher/classrooms', tone: 'success' }
    ];

    res.render('teacher/dashboard', {
      title: 'Teacher dashboard',
      classrooms,
      submissionCount,
      totalStudents,
      pendingSubmissions,
      // new modules
      avgScore,
      scoresCount,
      attendanceRate,
      sessionsHeld,
      distribution,
      upcoming,
      recentActivity,
      weekly: { labels: weekLabels, data: weekData, total: weekData.reduce((a, b) => a + b, 0) },
      monthly: { labels: monthLabels, data: monthData, total: monthData.reduce((a, b) => a + b, 0) },
      heatmap,
      radar,
      calendarEvents,
      calendarMonth: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      calendarStartWeekday: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).getDay(),
      calendarDaysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      todayDate: now.getDate(),
      notifications,
      unreadNotifications,
      recommendations,
      quickActions,
      pendingStudents
    });
  } catch (error) {
    return next(error);
  }
}

function relabelRelative(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function getTeacherRecommendations(contextData) {
  try {
    const dbSetting = await SystemSetting.findOne({ key: 'geminiApiKey' });
    const apiKey = (dbSetting ? dbSetting.value : null) || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return buildTeacherRecommendations(contextData);
    }

    const prompt = `Bạn là một AI phân tích dữ liệu lớp học cho giáo viên. Hãy đưa ra 4 lời khuyên hữu ích, thực tế và mang tính hành động dựa trên số liệu sau:
- Tổng số học sinh: ${contextData.totalStudents}
- Số bài chưa chấm: ${contextData.submissionCount}
- Số học sinh chờ duyệt: ${contextData.pendingStudents}
- Điểm trung bình các lớp: ${contextData.avgScore !== null ? contextData.avgScore + '%' : 'Chưa có'}
- Tỷ lệ chuyên cần: ${contextData.attendanceRate !== null ? contextData.attendanceRate + '%' : 'Chưa có'}
- Lớp học đang hoạt động: ${contextData.classrooms.length}

Trả về một mảng JSON (chỉ mảng, không markdown, không backtick) chứa tối đa 4 object, mỗi object có cấu trúc:
{ "icon": "ph-xxx", "tone": "primary|info|warning|destructive|success", "title": "Tiêu đề ngắn", "text": "Mô tả chi tiết lời khuyên" }
Icon phải bắt đầu bằng "ph-" (ví dụ ph-tray, ph-chart-line, ph-user-plus, ph-warning-circle, ph-sparkle, vv).
Chú ý: Chỉ trả về mảng JSON hợp lệ, có thể parse bằng JSON.parse().`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, topK: 40, topP: 0.95 }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('Gemini API Error in Teacher Dashboard:', err);
    return buildTeacherRecommendations(contextData);
  }
}

function buildTeacherRecommendations({ submissionCount, pendingStudents, avgScore, attendanceRate, upcoming, classrooms, totalStudents }) {
  const recs = [];
  if (submissionCount > 0) {
    recs.push({ icon: 'ph-tray', tone: 'warning', title: 'Cần chấm điểm', text: `Có ${submissionCount} bài nộp đang chờ chấm điểm. Hãy chấm sớm để giúp học sinh có động lực và bảng điều khiển của bạn luôn chính xác.` });
  }
  if (pendingStudents > 0) {
    recs.push({ icon: 'ph-user-plus', tone: 'info', title: 'Kiểm duyệt học sinh', text: `Có ${pendingStudents} học sinh đang chờ được duyệt vào lớp. Xem xét và phê duyệt để bắt đầu quản lý danh sách lớp.` });
  }
  if (avgScore !== null && avgScore < 60) {
    recs.push({ icon: 'ph-trend-down', tone: 'destructive', title: 'Điểm trung bình đang giảm', text: `Điểm trung bình của lớp là ${avgScore}%. Hãy cân nhắc tổ chức một buổi ôn tập trước kỳ kiểm tra tiếp theo.` });
  }
  if (attendanceRate !== null && attendanceRate < 70) {
    recs.push({ icon: 'ph-calendar-x', tone: 'warning', title: 'Tỷ lệ chuyên cần thấp', text: `Tỷ lệ điểm danh hiện là ${attendanceRate}%. Hãy cân nhắc việc tổ chức buổi học trực tiếp và chia sẻ mã PIN sớm.` });
  }
  if (upcoming.length && upcoming.some(u => u.isUrgent)) {
    recs.push({ icon: 'ph-fire', tone: 'info', title: 'Sắp tới hạn chót', text: `Có ${upcoming.filter(u => u.isUrgent).length} hạn chót trong vòng 2 ngày tới. Đừng quên gửi nhắc nhở cho học sinh.` });
  }
  if (classrooms.length === 0) {
    recs.push({ icon: 'ph-plus-circle', tone: 'primary', title: 'Tạo lớp học', text: 'Bạn chưa có lớp học nào. Hãy tạo một lớp học để bắt đầu thêm bài giảng và bài tập.' });
  }
  if (recs.length === 0) {
    recs.push({ icon: 'ph-sparkle', tone: 'success', title: 'Mọi thứ đều hoàn hảo', text: 'Không phát hiện vấn đề nào cần chú ý. Hãy tiếp tục chia sẻ nội dung mới để duy trì sự tham gia.' });
  }
  return recs.slice(0, 4);
}

module.exports = {
  renderTeacherDashboard,
};
