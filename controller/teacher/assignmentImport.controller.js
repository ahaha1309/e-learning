'use strict';

const Classroom = require('../../models/Classroom');
const Assignment = require('../../models/Assignment');
const { bulkImportQuestions } = require('../../services/questionImport.service');

async function renderImportPage(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: classroom.id, teacher: req.user.id });
    if (!assignment) {
      return res.status(404).render('errors/404', { title: 'Assignment not found', path: req.originalUrl });
    }

    return res.render('teacher/assignments/import', {
      title: `Nhập câu hỏi — ${assignment.title}`,
      classroom,
      assignment,
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

    const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: classroom.id, teacher: req.user.id });
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const { questions } = req.body;

    if (!Array.isArray(questions)) {
      return res.status(422).json({ success: false, message: 'Invalid request body — questions must be an array.' });
    }

    const result = await bulkImportQuestions(assignment.id, req.user.id, questions, 'assignment');

    return res.json({
      success: true,
      inserted: result.inserted,
      errors: result.errors,
      redirectUrl: `/teacher/classrooms/${classroom.id}/assignments/${assignment.id}/questions?feedback=${encodeURIComponent(`Imported ${result.inserted} question(s) successfully.`)}`,
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
