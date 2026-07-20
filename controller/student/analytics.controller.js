const ClassroomMember = require('../../models/ClassroomMember');
const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');
const ExamSubmission = require('../../models/ExamSubmission');

async function renderStudentAnalytics(req, res, next) {
  try {
    // 1. Get all classrooms the student is in
    const memberships = await ClassroomMember.find({ student: req.user.id, status: 'approved' }).select('classroom').lean();
    const classroomIds = memberships.map(m => m.classroom);

    // 2. Assignment Stats
    const totalAssignments = await Assignment.countDocuments({ classroom: { $in: classroomIds } });
    const submittedAssignments = await Submission.countDocuments({ student: req.user.id });
    
    // 3. Exam Progress over time
    const examSubmissions = await ExamSubmission.find({ student: req.user.id, gradingStatus: { $in: ['auto_graded', 'fully_graded'] } })
      .populate('exam', 'title totalPoints')
      .sort({ createdAt: 1 })
      .lean();

    let chartLabels = [];
    let chartData = [];
    let totalPercentage = 0;

    examSubmissions.forEach(sub => {
      if (sub.exam) {
        chartLabels.push(sub.exam.title.substring(0, 15) + (sub.exam.title.length > 15 ? '...' : ''));
        const percentage = (sub.score / (sub.exam.totalPoints || 1)) * 100;
        chartData.push(percentage.toFixed(1));
        totalPercentage += percentage;
      }
    });

    const averageScore = examSubmissions.length > 0 
      ? (totalPercentage / examSubmissions.length).toFixed(1) 
      : 0;

    return res.render('student/analytics/index', {
      title: 'My Progress',
      stats: {
        totalAssignments,
        submittedAssignments,
        missingAssignments: Math.max(0, totalAssignments - submittedAssignments),
        averageScore,
        examsTaken: examSubmissions.length
      },
      chartData: {
        labels: chartLabels,
        data: chartData
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderStudentAnalytics
};
