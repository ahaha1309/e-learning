const ClassroomMember = require('../../models/ClassroomMember');
const Submission = require('../../models/Submission');
const ExamSubmission = require('../../models/ExamSubmission');
const Exam = require('../../models/Exam');
const Assignment = require('../../models/Assignment');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');
const Lecture = require('../../models/Lecture');
const Notification = require('../../models/Notification');
const StudentProgress = require('../../models/StudentProgress');

// 86400000 ms = 1 day
const DAY = 86400000;

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

async function renderStudentDashboard(req, res, next) {
  try {
    const studentId = req.user.id;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const monthAgo = new Date(now.getTime() - 30 * DAY);

    const [memberships, submissionCount, examCount, gradedCount, allSubmissions] = await Promise.all([
      ClassroomMember.find({ student: studentId, status: 'approved' })
        .populate({ path: 'classroom', select: 'name code' })
        .lean(),
      Submission.countDocuments({ student: studentId }),
      ExamSubmission.countDocuments({ student: studentId }),
      Submission.countDocuments({ student: studentId, status: 'graded' }),
      Submission.find({ student: studentId, status: 'graded' }).select('score submittedAt createdAt').lean()
    ]);

    const enrolledCount = memberships.length;
    const completedCount = gradedCount;

    let totalScore = 0;
    allSubmissions.forEach(sub => { totalScore += (sub.score || 0); });
    const avgScore = allSubmissions.length > 0 ? Math.round(totalScore / allSubmissions.length) : 0;

    const validMemberships = memberships.filter(m => m.classroom);
    const classroomIds = validMemberships.map(m => m.classroom._id);

    // ── Real progress per enrollment from StudentProgress ledger ──
    const progressRows = await StudentProgress.find({ student: studentId, classroom: { $in: classroomIds } }).lean();
    const doneByClassroom = {};
    progressRows.forEach(p => {
      if (p.status === 'completed') doneByClassroom[p.classroom] = (doneByClassroom[p.classroom] || 0) + 1;
    });
    const [lectureCounts, assignmentCounts] = await Promise.all([
      classroomIds.length ? Lecture.aggregate([
        { $match: { classroom: { $in: classroomIds }, isPublished: { $ne: false } } },
        { $group: { _id: '$classroom', count: { $sum: 1 } } }
      ]) : [],
      classroomIds.length ? Assignment.aggregate([
        { $match: { classroom: { $in: classroomIds } } },
        { $group: { _id: '$classroom', count: { $sum: 1 } } }
      ]) : []
    ]);
    const lectureMap = {}; lectureCounts.forEach(l => { lectureMap[l._id] = l.count; });
    const assignMap = {}; assignmentCounts.forEach(a => { assignMap[a._id] = a.count; });

    const enrollments = validMemberships.map(m => {
      const totalItems = (lectureMap[m.classroom._id] || 0) + (assignMap[m.classroom._id] || 0);
      const done = doneByClassroom[m.classroom._id] || 0;
      const progress = totalItems > 0 ? Math.min(100, Math.round((done / totalItems) * 100)) : 0;
      return { classroom: { id: m.classroom._id, name: m.classroom.name, code: m.classroom.code }, progress };
    });

    // ── Upcoming deadlines: real assignments + exams due in the future ──
    const [dueAssignments, dueExams] = await Promise.all([
      Assignment.find({ classroom: { $in: classroomIds }, dueDate: { $ne: null, $gte: now } })
        .populate('classroom', 'name').sort({ dueDate: 1 }).limit(8).lean(),
      Exam.find({ classroom: { $in: classroomIds }, isActive: true, endTime: { $ne: null, $gte: now } })
        .populate('classroom', 'name').sort({ endTime: 1 }).limit(8).lean()
    ]);
    const upcoming = [
      ...dueAssignments.map(a => ({
        type: 'assignment', refId: String(a._id),
        title: a.title,
        classroom: a.classroom ? a.classroom.name : '',
        due: a.dueDate,
        dueLabel: relabelDue(a.dueDate),
        isUrgent: (a.dueDate - now) <= 2 * DAY,
        link: `/student/classrooms/${a.classroom ? a.classroom._id : ''}/assignments`
      })),
      ...dueExams.map(e => ({
        type: 'exam', refId: String(e._id),
        title: e.title,
        classroom: e.classroom ? e.classroom.name : '',
        due: e.endTime,
        dueLabel: relabelDue(e.endTime),
        isUrgent: (e.endTime - now) <= 2 * DAY,
        link: `/student/classrooms/${e.classroom ? e.classroom._id : ''}/exams`
      }))
    ].sort((a, b) => a.due - b.due).slice(0, 6);

    // ── Calendar: due items for the current month ──
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const [monthAssign, monthExams] = await Promise.all([
      Assignment.find({ classroom: { $in: classroomIds }, dueDate: { $gte: monthStart, $lte: monthEnd } }).populate('classroom', 'name').lean(),
      Exam.find({ classroom: { $in: classroomIds }, isActive: true, endTime: { $gte: monthStart, $lte: monthEnd } }).populate('classroom', 'name').lean()
    ]);
    const calendarEvents = [
      ...monthAssign.map(a => ({ day: new Date(a.dueDate).getDate(), type: 'assignment', title: a.title, classroom: a.classroom ? a.classroom.name : '' })),
      ...monthExams.map(e => ({ day: new Date(e.endTime).getDate(), type: 'exam', title: e.title, classroom: e.classroom ? e.classroom.name : '' }))
    ];

    // ── Attendance rate across enrolled classrooms ──
    const sessionIds = classroomIds.length ? await AttendanceSession.find({ classroom: { $in: classroomIds } }).distinct('_id') : [];
    const [attendanceSessions, presentRecords] = await Promise.all([
      AttendanceSession.countDocuments({ classroom: { $in: classroomIds } }),
      sessionIds.length ? AttendanceRecord.countDocuments({ student: studentId, session: { $in: sessionIds }, status: 'present' }) : 0
    ]);
    const attendanceRate = attendanceSessions > 0 ? Math.round((presentRecords / attendanceSessions) * 100) : null;

    // ── Recent activity feed (graded submissions + notifications) ──
    const [recentGrades, recentNotifs] = await Promise.all([
      Submission.find({ student: studentId, status: 'graded' }).sort({ gradedAt: -1 }).limit(4).populate('assignment', 'title').populate('classroom', 'name').lean(),
      Notification.find({ recipient: studentId }).sort({ createdAt: -1 }).limit(4).lean()
    ]);
    const recentActivity = [
      ...recentGrades.map(s => ({
        type: 'grade',
        message: `You scored ${s.score || 0}% on ${s.assignment ? s.assignment.title : 'an assignment'}`,
        timeLabel: relabelRelative(s.gradedAt || s.createdAt),
        classroom: s.classroom ? s.classroom.name : ''
      })),
      ...recentNotifs.map(n => ({
        type: n.isRead ? 'announcement' : 'announcement',
        message: n.title,
        timeLabel: relabelRelative(n.createdAt),
        classroom: ''
      }))
    ].slice(0, 5);

    // ── Weekly report: submissions + study activity for last 7 days ──
    const weekSubs = await Submission.find({ student: studentId, submittedAt: { $gte: weekAgo } }).sort({ submittedAt: 1 }).lean();
    const weekExamSubs = await ExamSubmission.find({ student: studentId, createdAt: { $gte: weekAgo } }).sort({ createdAt: 1 }).lean();
    const weekLabels = [];
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getTime() - i * DAY);
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart.getTime() + DAY);
      const name = day.toLocaleDateString('en-US', { weekday: 'short' });
      weekLabels.push(name.slice(0, 3));
      const subCount = weekSubs.filter(s => { const t = s.submittedAt || s.createdAt; return t >= dayStart && t < dayEnd; }).length;
      const examCount = weekExamSubs.filter(s => s.createdAt >= dayStart && s.createdAt < dayEnd).length;
      weekData.push(subCount + examCount);
    }

    // ── Monthly report: last 6 months grade averages ──
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const recentGraded = await Submission.find({ student: studentId, status: 'graded', gradedAt: { $gte: sixMonthsAgo } }).select('score gradedAt createdAt').lean();
    const monthLabels = [];
    const monthData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      monthLabels.push(d.toLocaleDateString('en-US', { month: 'short' }));
      const inMonth = recentGraded.filter(s => { const t = s.gradedAt || s.createdAt; return t >= d && t < next; });
      const avg = inMonth.length > 0 ? Math.round(inMonth.reduce((a, s) => a + (s.score || 0), 0) / inMonth.length) : 0;
      monthData.push(avg);
    }

    // ── Heatmap: submissions per day, last ~17 weeks (GitHub-style) ──
    const heatmapStart = new Date(now.getTime() - 119 * DAY);
    const heatSubs = await Submission.find({ student: studentId, submittedAt: { $gte: heatmapStart } }).select('submittedAt createdAt').lean();
    const heatExamSubs = await ExamSubmission.find({ student: studentId, createdAt: { $gte: heatmapStart } }).select('createdAt').lean();
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

    // ── Radar: skill dimensions derived from real metrics ──
    const onTimeSubs = allSubmissions.filter(s => { const t = s.gradedAt || s.createdAt; return t && t >= monthAgo; }).length;
    const radarMetrics = {
      labels: ['Completion', 'Avg Score', 'Attendance', 'Exam Effort', 'Consistency', 'Engagement'],
      data: [
        enrollments.length > 0 ? Math.round(enrollments.reduce((a, e) => a + e.progress, 0) / enrollments.length) : 0,
        avgScore,
        attendanceRate !== null ? attendanceRate : 0,
        examCount > 0 ? Math.min(100, examCount * 20) : 0,
        weekData.reduce((a, b) => a + b, 0) > 0 ? Math.min(100, weekData.filter(Boolean).length * 14 + 5) : 0,
        Math.min(100, (submissionCount + examCount) * 5)
      ]
    };

    // ── Gamification data (XP derived from real submissions + exams) ──
    const xpTotal = submissionCount * 50 + examCount * 75 + completedCount * 25;
    const xpLevel = Math.floor(xpTotal / 500) + 1;
    const xpIntoLevel = xpTotal % 500;
    const xpData = {
      level: xpLevel,
      current: xpTotal,
      toNext: 500,
      progressPct: Math.round((xpIntoLevel / 500) * 100),
      badges: buildBadges(submissionCount, examCount, avgScore, attendanceRate)
    };

    // ── Streak: days with activity in the last 7 days ──
    const streakDays = [false, false, false, false, false, false, false];
    const last7 = weekData; // index 0 = oldest, 6 = today
    let streak = 0;
    for (let i = 6; i >= 0; i--) {
      if (last7[i] > 0) { streakDays[i] = true; if (streak === 0 || streakDays[i + 1]) streak++; }
    }
    // mark today specially handled in view via day index

    // ── AI recommendations: rules-based on real gaps ──
    const recommendations = buildStudentRecommendations({
      avgScore, attendanceRate, upcoming, submissionCount,
      missingCount: Math.max(0, (enrollments.reduce((a, e) => a + (assignMap[e.classroom.id] || 0), 0)) - submissionCount),
      enrollments
    });

    // ── Notifications for the drawer ──
    const notifications = await Notification.find({ recipient: studentId }).sort({ createdAt: -1 }).limit(5).lean();
    const unreadNotifications = await Notification.countDocuments({ recipient: studentId, isRead: false });

    res.render('student/dashboard', {
      title: 'Student Dashboard',
      memberships,
      enrolledCount,
      completedCount,
      gradedCount,
      avgScore,
      submissionCount,
      examCount,
      enrollments,
      xpData,
      streak,
      streakDays,
      upcoming,
      recentActivity,
      // New modules
      calendarEvents,
      calendarMonth: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      calendarStartWeekday: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).getDay(),
      calendarDaysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      todayDate: now.getDate(),
      attendanceRate,
      notifications,
      unreadNotifications,
      weekly: { labels: weekLabels, data: weekData, total: weekData.reduce((a, b) => a + b, 0) },
      monthly: { labels: monthLabels, data: monthData },
      heatmap,
      radar: radarMetrics,
      recommendations
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

function buildBadges(submissionCount, examCount, avgScore, attendanceRate) {
  const badges = [];
  if (submissionCount >= 1) badges.push({ name: 'First Steps', icon: 'ph-footprints' });
  if (examCount >= 3) badges.push({ name: 'Exam Taker', icon: 'ph-exam' });
  if (avgScore >= 90) badges.push({ name: 'Top Scorer', icon: 'ph-star' });
  if (attendanceRate !== null && attendanceRate >= 90) badges.push({ name: 'Show Up', icon: 'ph-calendar-check' });
  return badges.slice(0, 4);
}

function buildStudentRecommendations({ avgScore, attendanceRate, upcoming, missingCount, enrollments }) {
  const recs = [];
  if (upcoming.length && upcoming.some(u => u.isUrgent)) {
    recs.push({ icon: 'ph-fire', tone: 'destructive', title: 'Deadline pressure', text: `You have ${upcoming.filter(u => u.isUrgent).length} urgent item(s) due within 2 days. Block 30 focused minutes today.` });
  }
  if (avgScore > 0 && avgScore < 70) {
    recs.push({ icon: 'ph-trend-up', tone: 'warning', title: 'Raise your average', text: `Your average is ${avgScore}%. Review low-scoring assignment feedback and reattempt practice questions.` });
  }
  if (attendanceRate !== null && attendanceRate < 75) {
    recs.push({ icon: 'ph-calendar-check', tone: 'info', title: 'Improve attendance', text: `Attendance is ${attendanceRate}%. Check in early to upcoming sessions to stay on track.` });
  }
  if (missingCount > 0) {
    recs.push({ icon: 'ph-tray', tone: 'warning', title: 'Outstanding work', text: `${missingCount} assignment(s) still to submit. Knock out the smallest ones first.` });
  }
  if (enrollments.length === 0) {
    recs.push({ icon: 'ph-compass', tone: 'primary', title: 'Join a classroom', text: 'You have no active classrooms. Enter a code from your teacher to begin.' });
  }
  if (recs.length === 0) {
    recs.push({ icon: 'ph-sparkle', tone: 'success', title: 'You are on track', text: 'No urgent risks detected. Keep your streak going with a short review session.' });
  }
  return recs.slice(0, 4);
}

function renderStudentCertificates(req, res) {
  res.render('student/certificates', {
    title: 'Certificates',
    certificates: [],
  });
}

async function askGlobalAiAssistantHandler(req, res, next) {
  try {
    const studentId = req.user.id;
    const userMessage = req.body.message?.toString().trim();
    if (!userMessage) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const allMemberships = await ClassroomMember.find({ student: studentId, status: 'approved' }).populate('classroom').lean();
    const classrooms = allMemberships.map(m => m.classroom).filter(Boolean);

    const context = `
    Bạn là Trợ lý Học tập AI (AI Tutor) thân thiện dành cho sinh viên: "${req.user.name}".
    Học viên này đang tham gia ${classrooms.length} lớp học:
    ${classrooms.map(c => `- Lớp học: ${c.name} (Mã: ${c.code}). Mô tả: ${c.description || 'Chưa có'}`).join('\n')}

    Nhiệm vụ của bạn:
    1. Trả lời câu hỏi của học sinh một cách rõ ràng, ngắn gọn và hữu ích.
    2. Nếu học sinh hỏi về môn học cụ thể nào trong các lớp học trên, hãy tư vấn cho họ dựa trên thông tin lớp học.
    3. Hỗ trợ giải đáp các câu hỏi học tập chung, phương pháp ôn thi, lập lịch học tập.
    4. Trả lời bằng tiếng Việt thân thiện, khuyến khích học tập.
    `;

    const SystemSetting = require('../../models/SystemSetting');
    const dbSetting = await SystemSetting.findOne({ key: 'geminiApiKey' });
    const apiKey = (dbSetting ? dbSetting.value : null) || process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: context + "\n\nUser Question: " + userMessage }]
            }]
          })
        });
        const data = await response.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "Không thể nhận câu trả lời từ AI lúc này.";
        return res.json({ answer });
      } catch (err) {
        console.error('Gemini API Error:', err);
        return res.status(500).json({ error: 'Failed to query AI engine.' });
      }
    } else {
      let mockAnswer = `Xin chào **${req.user.name}**! Tôi là Trợ lý AI học tập của bạn. Hiện tại hệ thống chưa cấu hình \`GEMINI_API_KEY\`, nên tôi đang chạy ở chế độ Demo. \n\nBạn đang tham gia ${classrooms.length} lớp học. Hãy cấu hình API Key để tôi hỗ trợ bạn thông minh nhất nhé!`;
      return res.json({ answer: mockAnswer });
    }
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderStudentDashboard,
  renderStudentCertificates,
  askGlobalAiAssistantHandler,
};
