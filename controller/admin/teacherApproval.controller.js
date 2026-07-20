const { validationResult } = require('express-validator');
const {
  listPendingTeachers,
  approveTeacher,
  rejectTeacher,
} = require('./teacherApproval.service');

function getValidationMessage(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderTeacherApprovals(req, res, next) {
  try {
    const teachers = await listPendingTeachers();

    return res.render('admin/teachers/pending', {
      title: 'Teacher approvals',
      teachers,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function approveTeacherHandler(req, res, next) {
  try {
    const validationMessage = getValidationMessage(req);
    if (validationMessage) {
      return res.status(422).redirect('/admin/teachers/pending?feedback=' + encodeURIComponent(validationMessage));
    }

    await approveTeacher(req.params.teacherId);
    return res.redirect('/admin/teachers/pending?feedback=' + encodeURIComponent('Teacher account approved.'));
  } catch (error) {
    return next(error);
  }
}

async function rejectTeacherHandler(req, res, next) {
  try {
    const validationMessage = getValidationMessage(req);
    if (validationMessage) {
      return res.status(422).redirect('/admin/teachers/pending?feedback=' + encodeURIComponent(validationMessage));
    }

    await rejectTeacher(req.params.teacherId);
    return res.redirect('/admin/teachers/pending?feedback=' + encodeURIComponent('Teacher account rejected.'));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderTeacherApprovals,
  approveTeacherHandler,
  rejectTeacherHandler,
};
