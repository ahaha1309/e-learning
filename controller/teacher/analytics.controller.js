const Classroom = require('../../models/Classroom');
const ClassroomMember = require('../../models/ClassroomMember');
const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');
const Exam = require('../../models/Exam');
const ExamSubmission = require('../../models/ExamSubmission');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');
const mongoose = require('mongoose');
const NodeCache = require('node-cache');

const analyticsCache = new NodeCache({ stdTTL: 300 });

async function renderClassroomAnalytics(req, res, next) {
  try {
    const cacheKey = `classroom_analytics_${req.params.classroomId}`;
    const cachedData = analyticsCache.get(cacheKey);
    if (cachedData) {
      return res.render('teacher/analytics/index', cachedData);
    }

    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    // 1. Total Approved Students
    const studentCount = await ClassroomMember.countDocuments({ classroom: classroom._id, status: 'approved' });

    // 2. Average Score across all submissions (assignments + exams)
    const [assignmentAvgResult, examAvgResult] = await Promise.all([
      Submission.aggregate([
        { $match: { classroom: classroom._id, score: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$score' }, count: { $sum: 1 } } },
      ]),
      ExamSubmission.aggregate([
        { $match: { classroom: classroom._id, score: { $ne: null }, gradingStatus: 'fully_graded' } },
        { $group: { _id: null, avg: { $avg: '$score' }, count: { $sum: 1 } } },
      ]),
    ]);

    const assignmentAvg = assignmentAvgResult.length > 0 ? assignmentAvgResult[0].avg : 0;
    const examAvg = examAvgResult.length > 0 ? examAvgResult[0].avg : 0;
    const combinedCount = (assignmentAvgResult[0]?.count || 0) + (examAvgResult[0]?.count || 0);
    const avgScore = combinedCount > 0
      ? (assignmentAvg * (assignmentAvgResult[0]?.count || 0) + examAvg * (examAvgResult[0]?.count || 0)) / combinedCount
      : null;

    // 3. Attendance Rate
    const sessionIds = await AttendanceSession.find({ classroom: classroom._id }).distinct('_id');
    let attendanceRate = null;
    if (sessionIds.length > 0 && studentCount > 0) {
      const totalPossible = sessionIds.length * studentCount;
      const presentCount = await AttendanceRecord.countDocuments({
        session: { $in: sessionIds },
        status: 'present',
      });
      attendanceRate = totalPossible > 0 ? (presentCount / totalPossible) * 100 : null;
    }

    // 4. Submission Rate (assignments)
    const assignments = await Assignment.find({ classroom: classroom._id }).distinct('_id');
    let submissionRate = null;
    if (assignments.length > 0 && studentCount > 0) {
      const totalPossible = assignments.length * studentCount;
      const actualSubmissions = await Submission.countDocuments({
        assignment: { $in: assignments },
        status: { $in: ['submitted', 'graded'] },
      });
      submissionRate = totalPossible > 0 ? (actualSubmissions / totalPossible) * 100 : null;
    }

    // 5. Grade Distribution of Latest Exam
    const latestExam = await Exam.findOne({ classroom: classroom._id }).sort({ createdAt: -1 }).lean();
    let distribution = {
      labels: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'],
      data: [0, 0, 0, 0, 0],
    };
    let examTitle = 'No exams available';

    if (latestExam) {
      examTitle = latestExam.title;
      const submissions = await ExamSubmission.find({ exam: latestExam._id, gradingStatus: 'fully_graded' }).lean();

      submissions.forEach(sub => {
        const percentage = (sub.score / (latestExam.totalPoints || 1)) * 100;
        if (percentage <= 20) distribution.data[0]++;
        else if (percentage <= 40) distribution.data[1]++;
        else if (percentage <= 60) distribution.data[2]++;
        else if (percentage <= 80) distribution.data[3]++;
        else distribution.data[4]++;
      });
      
      distribution.hasData = submissions.length > 0;
    }

    // 6. Top and At-Risk Students
    const examsInClass = await Exam.find({ classroom: classroom._id }).select('_id totalPoints').lean();
    const examIds = examsInClass.map(e => e._id);

    const studentStats = await ExamSubmission.aggregate([
      { $match: { exam: { $in: examIds }, gradingStatus: 'fully_graded' } },
      {
        $lookup: {
          from: 'exams',
          localField: 'exam',
          foreignField: '_id',
          as: 'examData',
        },
      },
      { $unwind: '$examData' },
      {
        $group: {
          _id: '$student',
          totalScore: { $sum: '$score' },
          totalMaxScore: { $sum: '$examData.totalPoints' },
          examsTaken: { $sum: 1 },
        },
      },
      {
        $project: {
          studentId: '$_id',
          averagePercentage: {
            $cond: [
              { $gt: ['$totalMaxScore', 0] },
              { $multiply: [{ $divide: ['$totalScore', '$totalMaxScore'] }, 100] },
              0,
            ],
          },
          examsTaken: 1,
        },
      },
      { $sort: { averagePercentage: -1 } },
    ]);

    await mongoose.model('User').populate(studentStats, { path: 'studentId', select: 'name email avatar' });

    const topStudents = studentStats.slice(0, 5);
    const atRiskStudents = studentStats.filter(s => s.averagePercentage < 50).slice(0, 5);

    const renderData = {
      title: 'Classroom Analytics',
      classroom,
      studentCount,
      avgScore,
      attendanceRate,
      submissionRate,
      latestExam: { title: examTitle, distribution },
      topStudents,
      atRiskStudents,
    };

    analyticsCache.set(cacheKey, {
      ...renderData,
      classroom: classroom.toObject({ virtuals: true }),
    });

    return res.render('teacher/analytics/index', renderData);
  } catch (error) {
    return next(error);
  }
}

async function renderGlobalAnalytics(req, res, next) {
  try {
    const classrooms = await Classroom.find({ teacher: req.user.id, isArchived: false }).sort({ createdAt: -1 });
    return res.render('teacher/analytics/global', {
      title: 'Analytics',
      classrooms,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderClassroomAnalytics,
  renderGlobalAnalytics,
};
