const { validationResult } = require('express-validator');
const Classroom = require('../../models/Classroom');
const Assignment = require('../../models/Assignment');
const ClassroomMember = require('../../models/ClassroomMember');
const { sendNotification } = require('../../helper/notification.helper');

async function renderGlobalAssignments(req, res, next) {
  try {
    const teacherId = req.user.id;
    const query = req.query.q;

    const classrooms = await Classroom.find({ teacher: teacherId, isArchived: false })
      .sort({ createdAt: -1 }).lean();
    const classroomIds = classrooms.map(c => c._id);

    let filter = { teacher: teacherId, classroom: { $in: classroomIds } };
    if (query) {
      filter.title = { $regex: query, $options: 'i' };
    }

    const assignments = await Assignment.find(filter)
      .populate('classroom', 'name _id')
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    const now = new Date();
    const enriched = assignments.map(a => ({
      ...a,
      isOverdue: a.dueDate && a.dueDate < now && !a.allowLateSubmission,
    }));

    return res.render('teacher/assignments/all', {
      title: 'Tất cả bài tập',
      assignments: enriched,
      classrooms,
      query,
    });
  } catch (error) {
    return next(error);
  }
}

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderAssignmentIndex(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const query = req.query.q;
    let filter = { classroom: classroom.id, teacher: req.user.id };
    if (query) {
      filter.title = { $regex: query, $options: 'i' };
    }

    const assignments = await Assignment.find(filter).sort({ dueDate: 1, createdAt: -1 });

    return res.render('teacher/assignments/index', {
      title: `${classroom.name} assignments`,
      classroom,
      assignments,
      query,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderCreateAssignment(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    return res.render('teacher/assignments/new', {
      title: 'Create assignment',
      classroom,
      formData: {},
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createAssignmentHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('teacher/assignments/new', {
        title: 'Create assignment',
        classroom,
        formData: req.body,
        errorMessage: validationMessage,
      });
    }

    const assignment = new Assignment({
      classroom: classroom.id,
      teacher: req.user.id,
      title: req.body.title,
      description: req.body.description || '',
      instructions: req.body.instructions || '',
      totalPoints: Number(req.body.totalPoints || 10),
      dueDate: new Date(req.body.dueDate),
      isPublished: req.body.isPublished !== 'false',
      allowLateSubmission: req.body.allowLateSubmission === 'true',
    });

    await assignment.save();
    
    // Send notifications to all students
    const members = await ClassroomMember.find({ classroom: classroom.id, status: 'approved' });
    const notificationPromises = members.map(m => {
      return sendNotification(
        m.student,
        'New Assignment',
        `Teacher posted a new assignment: ${assignment.title}`,
        `/student/classrooms/${classroom.id}/assignments`
      );
    });
    await Promise.allSettled(notificationPromises);

    return res.redirect(`/teacher/classrooms/${classroom.id}/assignments?feedback=${encodeURIComponent('Assignment created.')}`);
  } catch (error) {
    return next(error);
  }
}

async function renderAssignmentDetail(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: classroom.id, teacher: req.user.id });
    if (!assignment) {
      return res.status(404).render('errors/404', {
        title: 'Assignment not found',
        path: req.originalUrl,
      });
    }

    return res.render('teacher/assignments/show', {
      title: assignment.title,
      classroom,
      assignment,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderAssignmentIndex,
  renderCreateAssignment,
  createAssignmentHandler,
  renderAssignmentDetail,
  renderGlobalAssignments,
};
