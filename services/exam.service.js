const Exam = require('../models/Exam');
const Question = require('../models/Question');
const QuestionBank = require('../models/QuestionBank');
const ExamSubmission = require('../models/ExamSubmission');
const ClassroomMember = require('../models/ClassroomMember');
const AppError = require('../utils/AppError');
const { sendNotification } = require('../helper/notification.helper');
const { markComplete, CONTENT_TYPES } = require('../helper/progress');
const { GRADING_STATUS } = require('../config/constants');

async function generateMatrixQuestions(examId, teacherId, subject, chapter, requirements) {
  const exam = await Exam.findOne({ _id: examId, teacher: teacherId });
  if (!exam) throw new AppError('Exam not found', 404);

  let generatedCount = 0;
  let pointsAdded = 0;

  const lastQuestion = await Question.findOne({ exam: exam.id }).sort({ order: -1 });
  let currentOrder = lastQuestion ? lastQuestion.order : 0;

  for (const reqConfig of requirements) {
    if (reqConfig.count > 0) {
      const matchCriteria = {
        teacher: teacherId,
        subject: subject,
        difficulty: reqConfig.difficulty
      };
      if (chapter) matchCriteria.chapter = chapter;

      const matchingQuestions = await QuestionBank.aggregate([
        { $match: matchCriteria },
        { $sample: { size: reqConfig.count } }
      ]);

      for (const mq of matchingQuestions) {
        currentOrder++;
        const q = new Question({
          exam: exam.id,
          type: mq.type,
          content: mq.content,
          options: mq.options,
          points: mq.points,
          order: currentOrder
        });
        await q.save();
        generatedCount++;
        pointsAdded += mq.points;
      }
    }
  }

  if (generatedCount > 0) {
    exam.totalPoints += pointsAdded;
    exam.questionCount += generatedCount;
    await exam.save();
  }

  return generatedCount;
}

async function gradeSubmission(submissionId, examId, teacherId, answersData) {
  const exam = await Exam.findOne({ _id: examId, teacher: teacherId });
  if (!exam) throw new AppError('Exam not found', 404);

  const submission = await ExamSubmission.findOne({ _id: submissionId, exam: exam.id }).populate('answers.question');
  if (!submission) throw new AppError('Submission not found', 404);

  let totalScore = 0;

  if (exam.type === 'upload') {
    totalScore = Number(answersData.uploadScore || 0);
    submission.teacherComment = answersData.uploadComment || '';
  } else {
    const pointPerQuestion = submission.answers.length > 0 ? (exam.totalPoints / submission.answers.length) : 0;
    for (let ans of submission.answers) {
      if (ans.question && ans.question.type === 'essay') {
        const points = Number(answersData[`points_${ans._id}`] || 0);
        const comment = answersData[`comment_${ans._id}`] || '';
        ans.pointsAchieved = Math.min(points, pointPerQuestion);
        ans.teacherComment = comment;
      }
      totalScore += ans.pointsAchieved;
    }
  }

  submission.score = Math.min(totalScore, exam.totalPoints);
  submission.status = 'graded';
  submission.gradingStatus = GRADING_STATUS.FULLY_GRADED;
  await submission.save();

  // Essay exams reach "complete" only now — write the completion ledger row
  // (Track 1) with the final graded score, so the course-progress tree and
  // gradebook see this exam as done with an accurate score. Objective-only
  // exams were completed in the submit handler; this upsert is a no-op re-write
  // that just refreshes the score, matching the assignment grade-time refresh.
  await markComplete({
    student: String(submission.student),
    classroom: String(exam.classroom),
    itemType: CONTENT_TYPES.EXAM,
    itemId: exam.id,
    evidence: {
      score: totalScore,
      maxScore: exam.totalPoints,
      submittedAt: submission.submittedAt,
    },
  });

  // Notify student
  const membership = await ClassroomMember.findOne({ classroom: exam.classroom, student: submission.student });
  if (membership) {
    await sendNotification(
      submission.student,
      'Exam Graded',
      `Your exam "${exam.title}" has been graded. Score: ${totalScore}/${exam.totalPoints}`,
      `/student/classrooms/${exam.classroom}/exams`
    );
  }

  return submission;
}

module.exports = {
  generateMatrixQuestions,
  gradeSubmission,
};
