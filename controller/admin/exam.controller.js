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

async function renderAdminEditExam(req, res, next) {
  try {
    const exam = await Exam.findById(req.params.examId)
      .populate('classroom', 'name')
      .populate('teacher', 'name');

    if (!exam) {
      return res.status(404).render('admin/errors/notFound', { title: 'Exam not found', path: req.originalUrl });
    }

    const startTimeFormatted = exam.startTime ? exam.startTime.toISOString().slice(0, 16) : '';
    const endTimeFormatted = exam.endTime ? exam.endTime.toISOString().slice(0, 16) : '';

    return res.render('admin/exams/edit', {
      title: 'Edit Exam (Admin)',
      exam,
      formData: {},
      startTimeFormatted,
      endTimeFormatted,
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateAdminExamHandler(req, res, next) {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).render('admin/errors/notFound', { title: 'Exam not found', path: req.originalUrl });
    }

    exam.title = req.body.title;
    exam.description = req.body.description || '';
    exam.duration = Number(req.body.duration || 60);
    exam.password = req.body.password || '';
    exam.showResult = req.body.showResult || 'after_submit';
    exam.isPublished = req.body.isPublished === 'true';
    exam.strictMode = req.body.strictMode === 'true';
    exam.isCoding = req.body.isCoding === 'true';
    exam.maxViolations = Number(req.body.maxViolations || 0);

    if (req.body.startTime) {
      exam.startTime = new Date(req.body.startTime);
    } else {
      exam.startTime = null;
    }
    if (req.body.endTime) {
      exam.endTime = new Date(req.body.endTime);
    } else {
      exam.endTime = null;
    }

    await exam.save();
    return res.redirect(`/admin/exams/${exam.id}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = { listExams, showExam, renderAdminEditExam, updateAdminExamHandler };
