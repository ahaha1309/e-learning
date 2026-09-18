'use strict';

const Classroom = require('../../models/Classroom');
const Exam = require('../../models/Exam');
const { bulkImportQuestions } = require('../../services/questionImport.service');

async function renderImportPage(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) {
      return res.status(404).render('errors/404', { title: 'Exam not found', path: req.originalUrl });
    }

    return res.render('teacher/exams/import', {
      title: `Import Questions — ${exam.title}`,
      classroom,
      exam,
    });
  } catch (error) {
    return next(error);
  }
}

async function bulkImportQuestionsHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).json({ success: false, message: 'Classroom not found' });
    }

    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const { questions } = req.body;

    if (!Array.isArray(questions)) {
      return res.status(422).json({ success: false, message: 'Invalid request body — questions must be an array.' });
    }

    const result = await bulkImportQuestions(exam.id, req.user.id, questions, 1);

    return res.json({
      success: true,
      inserted: result.inserted,
      errors: result.errors,
      redirectUrl: `/teacher/classrooms/${classroom.id}/exams/${exam.id}/questions?feedback=${encodeURIComponent(`Imported ${result.inserted} question(s) successfully.`)}`,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

module.exports = {
  renderImportPage,
  bulkImportQuestionsHandler,
};
