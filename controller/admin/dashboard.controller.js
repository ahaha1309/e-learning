const User = require('../../models/User');
const Classroom = require('../../models/Classroom');
const ClassroomMember = require('../../models/ClassroomMember');
const Lecture = require('../../models/Lecture');
const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');
const Exam = require('../../models/Exam');
const ExamSubmission = require('../../models/ExamSubmission');
const Question = require('../../models/Question');
const QuestionBank = require('../../models/QuestionBank');
const DiscussionTopic = require('../../models/DiscussionTopic');
const DiscussionReply = require('../../models/DiscussionReply');
const Notification = require('../../models/Notification');
const ChatMessage = require('../../models/ChatMessage');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');

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
  return `Due ${new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

async function renderAdminDashboard(req, res, next) {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    // ── Parallel metrics ──────────────────────────────────────
    const [
      totalUsers, totalTeachers, totalStudents, totalAdmins,
      pendingTeachers, activeUsers, totalClassrooms, activeClassrooms,
      totalExams, totalAssignments, totalLectures,
      totalSubmissions, gradedSubmissions, avgScore,
      totalTopics, totalReplies, totalNotifications,
      totalEnrollments, pendingEnrollments, totalChatMessages,
      totalQBEntries, totalExamSubmissions, avgExamScore,
      newUsersToday, newUsersWeek
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'teacher' }),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'teacher', status: 'pending' }),
      User.countDocuments({ status: 'active' }),
      Classroom.countDocuments(),
      Classroom.countDocuments({ isArchived: false }),
      Exam.countDocuments(),
      Assignment.countDocuments(),
      Lecture.countDocuments(),
      Submission.countDocuments(),
      Submission.countDocuments({ status: 'graded' }),
      Submission.aggregate([
        { $match: { score: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$score' } } }
      ]),
      DiscussionTopic.countDocuments(),
      DiscussionReply.countDocuments(),
      Notification.countDocuments(),
      ClassroomMember.countDocuments({ status: 'approved' }),
      ClassroomMember.countDocuments({ status: 'pending' }),
      ChatMessage.countDocuments(),
      QuestionBank.countDocuments(),
      ExamSubmission.countDocuments(),
      ExamSubmission.aggregate([
        { $match: { score: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$score' } } }
      ]),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } })
    ]);

    const averageSubmissionScore = avgScore.length > 0 ? Math.round(avgScore[0].avg * 10) / 10 : 0;
    const averageExamScoreVal = avgExamScore.length > 0 ? Math.round(avgExamScore[0].avg * 10) / 10 : 0;
    const completionRate = totalSubmissions > 0
      ? Math.round((gradedSubmissions / totalSubmissions) * 100)
      : 0;

    // ── User Growth Chart (last 30 days) ──────────────────────
    const dailyCounts = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%m/%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // ── Weekly Registrations (last 12 weeks) ──────────────────
    const twelveWeeksAgo = new Date(now.getTime() - 84 * 86400000);
    const weeklyRegs = await User.aggregate([
      { $match: { createdAt: { $gte: twelveWeeksAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-W%V', date: '$createdAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // ── Enrollment Trend (by month, last 6 months) ────────────
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const enrollmentTrend = await ClassroomMember.aggregate([
      { $match: { status: 'approved', approvedAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$approvedAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // ── Activity Distribution (content breakdown) ─────────────
    const contentDistribution = {
      lectures: totalLectures,
      assignments: totalAssignments,
      exams: totalExams,
      discussions: totalTopics,
      submissions: totalSubmissions,
      chatMessages: totalChatMessages
    };

    // ── Recent Activity (unified feed) ────────────────────────
    const [recentUsers, recentSubmissions, recentTopics, recentNotifications] = await Promise.all([
      User.find().sort({ createdAt: -1 }).limit(5).select('name email role avatarUrl createdAt'),
      Submission.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('student', 'name email avatarUrl')
        .populate('assignment', 'title')
        .select('student assignment status score createdAt'),
      DiscussionTopic.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('author', 'name email avatarUrl role')
        .populate('classroom', 'name')
        .select('title author classroom replyCount createdAt'),
      Notification.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('recipient', 'name')
        .select('title message createdAt isRead')
    ]);

    const recentActivity = buildActivityFeed(recentUsers, recentSubmissions, recentTopics, recentNotifications);

    // ── Latest Entities ───────────────────────────────────────
    const [latestClassrooms, latestExams, latestTeachers] = await Promise.all([
      Classroom.find().sort({ createdAt: -1 }).limit(4).populate('teacher', 'name').select('name code teacher createdAt'),
      Exam.find().sort({ createdAt: -1 }).limit(4).populate('classroom', 'name').select('title classroom duration totalPoints createdAt'),
      User.find({ role: 'teacher', status: 'active' }).sort({ createdAt: -1 }).limit(4).select('name email avatarUrl createdAt')
    ]);

    // ── System Status ─────────────────────────────────────────
    const dbStatus = await mongooseDbStatus();

    // ── NEW MODULES: heatmap, radar, calendar, attendance, reports, deadlines, recs, notifications ──
    const newModules = await buildPlatformModules({
      now,
      totalStudents,
      activeUsers,
      totalUsers,
      totalClassrooms,
      completionRate,
      avgScore: averageSubmissionScore,
      pendingTeachers,
      dbStatus,
      adminId: req.user.id
    });

    const metrics = {
      totalUsers, totalTeachers, totalStudents, totalAdmins,
      pendingTeachers, activeUsers, totalClassrooms, activeClassrooms,
      totalExams, totalAssignments, totalLectures,
      totalSubmissions, gradedSubmissions, avgScore: averageSubmissionScore,
      totalTopics, totalReplies, totalNotifications,
      totalEnrollments, pendingEnrollments, totalChatMessages,
      totalQBEntries, totalExamSubmissions, avgExamScore: averageExamScoreVal,
      newUsersToday, newUsersWeek, completionRate
    };

    return res.render('admin/dashboard', {
      title: 'Dashboard',
      metrics,
      recentActivity,
      latestClassrooms,
      latestExams,
      latestTeachers,
      systemStatus: dbStatus,
      heatmap: newModules.heatmap,
      radar: newModules.radar,
      weekly: newModules.weekly,
      monthly: newModules.monthly,
      calendarEvents: newModules.calendarEvents,
      calendarMonth: newModules.calendarMonth,
      calendarStartWeekday: newModules.calendarStartWeekday,
      calendarDaysInMonth: newModules.calendarDaysInMonth,
      todayDate: newModules.todayDate,
      attendanceRate: newModules.attendanceRate,
      sessionsHeld: newModules.sessionsHeld,
      upcoming: newModules.upcoming,
      recommendations: newModules.recommendations,
      notifications: newModules.notifications,
      unreadNotifications: newModules.unreadNotifications,
      chartData: {
        labels: dailyCounts.map(d => d._id),
        userGrowth: dailyCounts.map(d => d.count),
        weeklyLabels: weeklyRegs.map(d => d._id),
        weeklyData: weeklyRegs.map(d => d.count),
        enrollmentLabels: enrollmentTrend.map(d => d._id),
        enrollmentData: enrollmentTrend.map(d => d.count),
        roles: {
          students: totalStudents,
          teachers: totalTeachers,
          admins: totalAdmins
        },
        contentDistribution
      }
    });
  } catch (error) {
    return next(error);
  }
}

// ── Platform dashboard modules (heatmap, radar, calendar, attendance, reports, deadlines, recs, notifications)
async function buildPlatformModules(ctx) {
  const { now, totalStudents, activeUsers, totalUsers, totalClassrooms, completionRate, avgScore, pendingTeachers, dbStatus, adminId } = ctx;
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const heatmapStart = new Date(now.getTime() - 119 * DAY);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // Pull submission timestamps (both assignment + exam) once, then bucket everywhere.
  const [heatSubs, heatExamSubs, weekSubs, weekExamSubs, monthSubs, monthExamSubs, sessionsHeld, presentCount, monthExams, monthAssign, dueExams, dueAssignments, notifications] = await Promise.all([
    Submission.find({ submittedAt: { $gte: heatmapStart } }).select('submittedAt createdAt').lean(),
    ExamSubmission.find({ createdAt: { $gte: heatmapStart } }).select('createdAt').lean(),
    Submission.find({ submittedAt: { $gte: weekAgo } }).select('submittedAt createdAt').lean(),
    ExamSubmission.find({ createdAt: { $gte: weekAgo } }).select('createdAt').lean(),
    Submission.find({ submittedAt: { $gte: sixMonthsAgo } }).select('submittedAt createdAt').lean(),
    ExamSubmission.find({ createdAt: { $gte: sixMonthsAgo } }).select('createdAt').lean(),
    AttendanceSession.countDocuments(),
    AttendanceRecord.countDocuments({ status: 'present' }),
    Exam.find({ isActive: true, endTime: { $ne: null, $gte: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) } }).populate('classroom', 'name').lean(),
    Assignment.find({ dueDate: { $ne: null, $gte: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) } }).populate('classroom', 'name').lean(),
    Exam.find({ isActive: true, endTime: { $ne: null, $gte: now } }).populate('classroom', 'name _id').sort({ endTime: 1 }).limit(6).lean(),
    Assignment.find({ dueDate: { $ne: null, $gte: now } }).populate('classroom', 'name _id').sort({ dueDate: 1 }).limit(6).lean(),
    Notification.find({ recipient: adminId }).sort({ createdAt: -1 }).limit(5).lean()
  ]);

  // Heatmap: 120 daily buckets
  const heatMap = {};
  [...heatSubs, ...heatExamSubs].forEach(s => {
    const key = startOfDay(s.submittedAt || s.createdAt).getTime();
    heatMap[key] = (heatMap[key] || 0) + 1;
  });
  const heatmap = [];
  for (let i = 0; i < 120; i++) {
    const t = startOfDay(new Date(heatmapStart.getTime() + i * DAY)).getTime();
    heatmap.push({ date: t, count: heatMap[t] || 0 });
  }

  // Weekly report (submissions received per day, 7 days)
  const weeklyLabels = [], weeklyData = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfDay(new Date(now.getTime() - i * DAY));
    const dayEnd = new Date(dayStart.getTime() + DAY);
    weeklyLabels.push(dayStart.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3));
    const sc = weekSubs.filter(s => { const t = s.submittedAt || s.createdAt; return t >= dayStart && t < dayEnd; }).length;
    const ec = weekExamSubs.filter(s => s.createdAt >= dayStart && s.createdAt < dayEnd).length;
    weeklyData.push(sc + ec);
  }

  // Monthly report (submissions per month, 6 months)
  const monthLabels = [], monthData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    monthLabels.push(d.toLocaleDateString('en-US', { month: 'short' }));
    const c = monthSubs.filter(s => { const t = s.submittedAt || s.createdAt; return t >= d && t < next; }).length
      + monthExamSubs.filter(s => s.createdAt >= d && s.createdAt < next).length;
    monthData.push(c);
  }

  // Platform radar — health dimensions normalized 0..100
  const activeUsersRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
  const engagement = Math.min(100, totalClassrooms > 0 ? Math.round((totalStudents / Math.max(1, totalClassrooms)) * 20) : 0);
  const systemHealth = dbStatus && dbStatus.status === 'connected' ? 100 : 35;
  // Enrollment growth proxy: this month vs baseline ratio of monthly submissions (bounded)
  const recentMonthCount = monthData[monthData.length - 1] || 0;
  const engagementScore = Math.min(100, recentMonthCount * 5);
  const radar = {
    labels: ['Active Users', 'Completion', 'Avg Score', 'Growth', 'Engagement', 'System Health'],
    data: [
      Math.min(100, activeUsersRate),
      Math.min(100, completionRate),
      avgScore ? Math.min(100, Math.round(avgScore)) : 0,
      Math.min(100, engagementScore),
      Math.min(100, engagement),
      systemHealth
    ]
  };

  // Attendance rate across the platform
  const attendanceRate = (sessionsHeld > 0 && totalStudents > 0)
    ? Math.round((presentCount / (sessionsHeld * totalStudents)) * 100)
    : null;

  // Calendar events (this month)
  const calendarEvents = [
    ...monthExams.map(e => ({ day: new Date(e.endTime).getDate(), type: 'exam', title: e.title, classroom: e.classroom ? e.classroom.name : '' })),
    ...monthAssign.map(a => ({ day: new Date(a.dueDate).getDate(), type: 'assignment', title: a.title, classroom: a.classroom ? a.classroom.name : '' }))
  ];

  // Upcoming deadlines (platform-wide)
  const upcoming = [
    ...dueExams.map(e => ({
      type: 'exam', title: e.title, classroom: e.classroom ? e.classroom.name : '',
      due: e.endTime, dueLabel: relabelDue(e.endTime), isUrgent: (e.endTime - now) <= 2 * DAY,
      link: `/admin/exams`
    })),
    ...dueAssignments.map(a => ({
      type: 'assignment', title: a.title, classroom: a.classroom ? a.classroom.name : '',
      due: a.dueDate, dueLabel: relabelDue(a.dueDate), isUrgent: (a.dueDate - now) <= 2 * DAY,
      link: `/admin/assignments`
    }))
  ].sort((a, b) => a.due - b.due).slice(0, 6);

  // Recommendations
  const recommendations = buildAdminRecommendations({
    pendingTeachers, completionRate, avgScore, dbStatus, upcoming, totalClassrooms, totalUsers
  });

  // Unread notifications count
  const unreadNotifications = await Notification.countDocuments({ recipient: adminId, isRead: false });

  return {
    heatmap,
    radar,
    weekly: { labels: weeklyLabels, data: weeklyData, total: weeklyData.reduce((a, b) => a + b, 0) },
    monthly: { labels: monthLabels, data: monthData, total: monthData.reduce((a, b) => a + b, 0) },
    calendarEvents,
    calendarMonth: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    calendarStartWeekday: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).getDay(),
    calendarDaysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    todayDate: now.getDate(),
    attendanceRate,
    sessionsHeld,
    upcoming,
    recommendations,
    notifications,
    unreadNotifications
  };
}

function buildAdminRecommendations({ pendingTeachers, completionRate, avgScore, dbStatus, upcoming, totalClassrooms, totalUsers }) {
  const recs = [];
  if (pendingTeachers > 0) {
    recs.push({ icon: 'ph-clock', tone: 'warning', title: 'Pending teacher approvals', text: `${pendingTeachers} teacher(s) are awaiting approval. Review their accounts to activate them.` });
  }
  if (completionRate < 50 && totalUsers > 0) {
    recs.push({ icon: 'ph-trend-down', tone: 'destructive', title: 'Low completion rate', text: `Only ${completionRate}% of submissions are graded. Grading throughput needs attention platform-wide.` });
  }
  if (avgScore && avgScore < 60) {
    recs.push({ icon: 'ph-exam', tone: 'warning', title: 'Average scores low', text: `Platform average is ${avgScore}. Consider surfacing remedial content to struggling classrooms.` });
  }
  if (dbStatus && dbStatus.status !== 'connected') {
    recs.push({ icon: 'ph-warning', tone: 'destructive', title: 'Database issue', text: 'The database connection is not healthy. Check server status and connectivity.' });
  }
  if (upcoming.length && upcoming.some(u => u.isUrgent)) {
    recs.push({ icon: 'ph-fire', tone: 'info', title: 'Deadlines ahead', text: `${upcoming.filter(u => u.isUrgent).length} deadline(s) within 2 days across the platform.` });
  }
  if (totalClassrooms === 0) {
    recs.push({ icon: 'ph-chalkboard', tone: 'primary', title: 'No classrooms yet', text: 'No classrooms exist. Encourage teachers to create their first classroom.' });
  }
  if (recs.length === 0) {
    recs.push({ icon: 'ph-sparkle', tone: 'success', title: 'Everything in balance', text: 'No critical platform signals detected. Systems are healthy.' });
  }
  return recs.slice(0, 4);
}

function buildActivityFeed(users, submissions, topics, notifications) {
  const feed = [];

  users.forEach(u => {
    feed.push({
      type: 'user',
      message: `<strong>${u.name}</strong> joined as ${u.role}`,
      time: u.createdAt,
      user: u
    });
  });

  submissions.forEach(s => {
    const studentName = s.student ? s.student.name : 'A student';
    const assignmentTitle = s.assignment ? s.assignment.title : 'an assignment';
    feed.push({
      type: 'submission',
      message: `<strong>${studentName}</strong> submitted <strong>${assignmentTitle}</strong>`,
      time: s.createdAt,
      submission: s
    });
  });

  topics.forEach(t => {
    const authorName = t.author ? t.author.name : 'Someone';
    const className = t.classroom ? t.classroom.name : 'a class';
    feed.push({
      type: 'discussion',
      message: `<strong>${authorName}</strong> posted in <strong>${className}</strong>`,
      time: t.createdAt,
      topic: t
    });
  });

  notifications.forEach(n => {
    feed.push({
      type: 'notification',
      message: `<strong>${n.title}</strong>: ${n.message}`,
      time: n.createdAt,
      notification: n
    });
  });

  feed.sort((a, b) => b.time - a.time);
  return feed.slice(0, 20);
}

async function mongooseDbStatus() {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    if (!db) return { status: 'disconnected', version: null };

    let version = null, dataSize = 0, collections = 0, objects = 0, avgObjSize = 0;
    try {
      const adminDb = db.admin();
      const info = await adminDb.serverInfo();
      version = info.version || null;
    } catch (_) { /* serverInfo may fail without admin rights */ }
    try {
      const stats = await db.stats();
      dataSize = stats.dataSize || 0;
      collections = stats.collections || 0;
      objects = stats.objects || 0;
      avgObjSize = stats.avgObjSize || 0;
    } catch (_) { /* db.stats may fail without admin rights */ }

    return { status: 'connected', version, dataSize, collections, objects, avgObjSize };
  } catch {
    return { status: 'error', version: null };
  }
}

// ── API endpoint for JSON dashboard data ─────────────────────
async function getDashboardApi(req, res, next) {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const [
      totalUsers, totalTeachers, totalStudents, totalAdmins,
      pendingTeachers, activeUsers, totalClassrooms, activeClassrooms,
      totalExams, totalAssignments, totalLectures,
      totalSubmissions, gradedSubmissions,
      totalTopics, totalNotifications,
      totalEnrollments, totalChatMessages,
      newUsersToday
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'teacher' }),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'teacher', status: 'pending' }),
      User.countDocuments({ status: 'active' }),
      Classroom.countDocuments(),
      Classroom.countDocuments({ isArchived: false }),
      Exam.countDocuments(),
      Assignment.countDocuments(),
      Lecture.countDocuments(),
      Submission.countDocuments(),
      Submission.countDocuments({ status: 'graded' }),
      DiscussionTopic.countDocuments(),
      Notification.countDocuments(),
      ClassroomMember.countDocuments({ status: 'approved' }),
      ChatMessage.countDocuments(),
      User.countDocuments({ createdAt: { $gte: todayStart } })
    ]);

    const dailyCounts = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%m/%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name email role avatarUrl createdAt');

    return res.json({
      stats: {
        totalUsers, totalTeachers, totalStudents, totalAdmins,
        pendingTeachers, activeUsers, totalClassrooms, activeClassrooms,
        totalExams, totalAssignments, totalLectures,
        totalSubmissions, gradedSubmissions,
        totalTopics, totalNotifications,
        totalEnrollments, totalChatMessages, newUsersToday
      },
      charts: {
        userGrowth: {
          labels: dailyCounts.map(d => d._id),
          data: dailyCounts.map(d => d.count)
        },
        roleDistribution: {
          students: totalStudents,
          teachers: totalTeachers,
          admins: totalAdmins
        }
      },
      recentUsers
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { renderAdminDashboard, getDashboardApi };
