const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

require('./config/db').connectDatabase().then(() => {
  console.log('Database connected successfully');
});

const User = require('./models/User');
const Classroom = require('./models/Classroom');
const ClassroomMember = require('./models/ClassroomMember');
const Lecture = require('./models/Lecture');
const Assignment = require('./models/Assignment');
const Submission = require('./models/Submission');
const Exam = require('./models/Exam');
const ExamSubmission = require('./models/ExamSubmission');
const QuestionBank = require('./models/QuestionBank');
const DiscussionTopic = require('./models/DiscussionTopic');
const DiscussionReply = require('./models/DiscussionReply');
const Notification = require('./models/Notification');
const ChatMessage = require('./models/ChatMessage');
const { ROLES } = require('./config/constants');

app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // ── Core Statistics ───────────────────────────────────────
    const [
      totalUsers, totalTeachers, totalStudents, totalAdmins,
      pendingTeachers, activeUsers, totalClassrooms, activeClassrooms,
      totalExams, totalAssignments, totalLectures,
      totalSubmissions, gradedSubmissions, totalTopics, totalReplies,
      totalNotifications, totalChatMessages, totalEnrollments,
      totalQBEntries, newUsersToday
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: ROLES.TEACHER }),
      User.countDocuments({ role: ROLES.STUDENT }),
      User.countDocuments({ role: ROLES.ADMIN }),
      User.countDocuments({ role: ROLES.TEACHER, status: 'pending' }),
      User.countDocuments({ status: 'active' }),
      Classroom.countDocuments(),
      Classroom.countDocuments({ isArchived: false }),
      Exam.countDocuments(),
      Assignment.countDocuments(),
      Lecture.countDocuments(),
      Submission.countDocuments(),
      Submission.countDocuments({ status: 'graded' }),
      DiscussionTopic.countDocuments(),
      DiscussionReply.countDocuments(),
      Notification.countDocuments(),
      ChatMessage.countDocuments(),
      ClassroomMember.countDocuments({ status: 'approved' }),
      QuestionBank.countDocuments(),
      User.countDocuments({ createdAt: { $gte: todayStart } })
    ]);

    // ── User Growth Chart Data (last 30 days) ───────────────────
    const dailyCounts = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%m/%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // ── Weekly Registrations (last 12 weeks) ───────────────────
    const twelveWeeksAgo = new Date(now.getTime() - 84 * 86400000);
    const weeklyRegs = await User.aggregate([
      { $match: { createdAt: { $gte: twelveWeeksAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-W%V', date: '$createdAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // ── Enrollment Trend (by month, last 6 months) ──────────────
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const enrollmentTrend = await ClassroomMember.aggregate([
      { $match: { status: 'approved', approvedAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$approvedAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // ── Recent Activity (unified feed) ─────────────────────────
    const [recentUsers, recentSubmissions, recentTopics] = await Promise.all([
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
        .select('title author classroom replyCount createdAt')
    ]);

    // ── Latest Entities ───────────────────────────────────────
    const [latestClassrooms, latestExams, latestTeachers] = await Promise.all([
      Classroom.find().sort({ createdAt: -1 }).limit(4).populate('teacher', 'name').select('name code teacher createdAt'),
      Exam.find().sort({ createdAt: -1 }).limit(4).populate('classroom', 'name').select('title classroom duration totalPoints createdAt'),
      User.find({ role: ROLES.TEACHER, status: 'active' }).sort({ createdAt: -1 }).limit(4).select('name email avatarUrl createdAt')
    ]);

    // ── Calculate metrics ─────────────────────────────────────
    const averageSubmissionScore = totalSubmissions > 0 && gradedSubmissions > 0
      ? Math.round(((gradedSubmissions / totalSubmissions) * 100) * 10) / 10
      : 0;

    const completionRate = totalSubmissions > 0
      ? Math.round((gradedSubmissions / totalSubmissions) * 100)
      : 0;

    const avgExamScore = totalExamSubmissions > 0 && gradedExams > 0
      ? Math.round(((gradedExams / totalExamSubmissions) * 100) * 10) / 10
      : 0;

    // ── System Status ──────────────────────────────────────────
    let systemStatus = { status: 'connected', version: null, collections: 0, objects: 0, avgObjSize: 0 };
    try {
      const db = mongoose.connection.db;
      if (db) {
        const adminDb = db.admin();
        const info = await adminDb.serverInfo();
        const stats = await db.stats();
        systemStatus = {
          status: 'connected',
          version: info.version,
          collections: stats.collections,
          objects: stats.objects,
          avgObjSize: stats.avgObjSize
        };
      }
    } catch (error) {
      systemStatus = { status: 'error', version: null };
    }

    // ── Build Activity Feed ────────────────────────────────────
    const recentActivity = [];

    recentUsers.forEach(u => {
      recentActivity.push({
        type: 'user',
        message: `<strong>${u.name}</strong> joined as ${u.role}`,\n        time: u.createdAt,\n        user: u\n      });\n    });\n\n    recentSubmissions.forEach(s => {\n      const studentName = s.student ? s.student.name : 'A student';\n      const assignmentTitle = s.assignment ? s.assignment.title : 'an assignment';\n      recentActivity.push({\n        type: 'submission',\n        message: `<strong>${studentName}</strong> submitted <strong>${assignmentTitle}</strong>`,\n        time: s.createdAt,\n        submission: s\n      });\n    });\n\n    recentTopics.forEach(t => {\n      const authorName = t.author ? t.author.name : 'Someone';\n      const className = t.classroom ? t.classroom.name : 'a class';\n      recentActivity.push({\n        type: 'discussion',\n        message: `<strong>${authorName}</strong> posted in <strong>${className}</strong>`,\n        time: t.createdAt,\n        topic: t\n      });\n    });\n\n    recentActivity.sort((a, b) => b.time - a.time);\n    const recentActivitySlice = recentActivity.slice(0, 20);\n\n    // ── Return unified dashboard data ────────────────────────\n    return res.json({\n      stats: {\n        totalUsers,\n        totalTeachers,\n        totalStudents,\n        totalAdmins,\n        pendingTeachers,\n        activeUsers,\n        totalClassrooms,\n        activeClassrooms,\n        totalExams,\n        totalAssignments,\n        totalLectures,\n        totalSubmissions,\n        gradedSubmissions,\n        totalTopics,\n        totalReplies,\n        totalNotifications,\n        totalChatMessages,\n        totalEnrollments,\n        totalQBEntries,\n        newUsersToday,\n        averageScore: averageSubmissionScore,\n        completionRate,\n        avgExamScore\n      },\n\n      charts: {\n        userGrowth: {\n          labels: dailyCounts.map(d => d._id),\n          data: dailyCounts.map(d => d.count)\n        },\n\n        weeklyRegistrations: {\n          labels: weeklyRegs.map(d => d._id),\n          data: weeklyRegs.map(d => d.count)\n        },\n\n        enrollmentTrend: {\n          labels: enrollmentTrend.map(d => d._id),\n          data: enrollmentTrend.map(d => d.count)\n        },\n\n        roleDistribution: {\n          students: totalStudents,\n          teachers: totalTeachers,\n          admins: totalAdmins\n        }\n      },\n\n      recentActivities: recentActivitySlice,\n\n      latestUsers: recentUsers,\n      latestClassrooms,\n      latestExams,\n      latestTeachers,\n\n      notifications: [],\n\n      systemStatus,\n\n      quickActions: [\n        { action: 'addUser', label: 'Add New User', icon: 'ph-user-plus', href: '/admin/users/new' },\n        { action: 'createClassroom', label: 'Create Classroom', icon: 'ph-chalkboard', href: '/admin/classrooms/new' },\n        { action: 'createExam', label: 'Create Exam', icon: 'ph-exam', href: '/admin/exams/new' },\n        { action: 'manageTeachers', label: 'Manage Teachers', icon: 'ph-chalkboard-teacher', href: '/admin/teachers' },\n        { action: 'viewAnalytics', label: 'View Analytics', icon: 'ph-chart-line', href: '/admin/analytics' },\n        { action: 'systemSettings', label: 'System Settings', icon: 'ph-gear-six', href: '/admin/settings' }\n      ]\n    });\n  } catch (error) {\n    console.error('Dashboard API error:', error);\n    res.status(500).json({ error: 'Failed to load dashboard data' });\n  }\n});\n\n// Start server\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => {\n  console.log('Dashboard API server running on port ' + PORT);\n});