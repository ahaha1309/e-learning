const Exam = require('../../models/Exam');
const Question = require('../../models/Question');
const ExamSubmission = require('../../models/ExamSubmission');

async function listExams(req, res, next) {
  try {
    const exams = await Exam.find()
      .populate('classroom', 'name')
      .populate('teacher', 'name')
      .sort({ createdAt: -1 });

    return res.render('admin/exams/index', {
      title: 'Exams',
      exams
    });
  } catch (error) {
    return next(error);
  }
}

async function showExam(req, res, next) {
  try {
    const exam = await Exam.findById(req.params.examId)
      .populate('classroom', 'name')
      .populate('teacher', 'name');

    if (!exam) {
      return res.status(404).render('admin/errors/notFound', { title: 'Exam not found', path: req.originalUrl });
    }

    const questions = await Question.find({ exam: exam.id }).sort({ order: 1, createdAt: 1 });
    const submissions = await ExamSubmission.find({ exam: exam.id })
      .populate('student', 'name email')
      .sort({ submittedAt: -1 });

    return res.render('admin/exams/show', {
      title: exam.title,
      exam,
      questions,
      submissions,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listExams, showExam };
