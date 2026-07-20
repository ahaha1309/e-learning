const ClassroomMember = require('../../models/ClassroomMember');
const Assignment = require('../../models/Assignment');

async function renderStudentAssignments(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');

    if (!membership) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const assignments = await Assignment.find({ classroom: membership.classroom.id, isPublished: true }).sort({ dueDate: 1, createdAt: -1 });

    return res.render('student/assignments/index', {
      title: `${membership.classroom.name} assignments`,
      membership,
      assignments,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderStudentAssignmentDetail(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');

    if (!membership) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: membership.classroom.id, isPublished: true });

    if (!assignment) {
      return res.status(404).render('errors/404', {
        title: 'Assignment not found',
        path: req.originalUrl,
      });
    }

    const Submission = require('../../models/Submission');
    const submission = await Submission.findOne({ assignment: assignment.id, student: req.user.id });

    return res.render('student/assignments/show', {
      title: assignment.title,
      membership,
      assignment,
      submission,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderStudentAssignments,
  renderStudentAssignmentDetail,
};
