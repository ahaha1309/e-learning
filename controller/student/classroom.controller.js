const { validationResult } = require('express-validator');
const Classroom = require('../../models/Classroom');
const ClassroomMember = require('../../models/ClassroomMember');
const { computeCourseProgress } = require('../../services/courseProgress.service');
const { evaluateClassroomCompletion } = require('../../services/completion.service');

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderStudentClassrooms(req, res, next) {
  try {
    const memberships = await ClassroomMember.find({ student: req.user.id }).populate('classroom').sort({ requestedAt: -1 });
    const pendingMemberships = memberships.filter((membership) => membership.status === 'pending');
    const approvedMemberships = memberships.filter((membership) => membership.status === 'approved');

    return res.render('student/classrooms/index', {
      title: 'My classrooms',
      pendingMemberships,
      approvedMemberships,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function joinClassroomHandler(req, res, next) {
  try {
    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('student/classrooms/index', {
        title: 'My classrooms',
        pendingMemberships: [],
        approvedMemberships: [],
        feedback: validationMessage,
      });
    }

    const code = req.body.code.toUpperCase();
    const classroom = await Classroom.findOne({ code, isArchived: false });

    if (!classroom) {
      return res.redirect('/student/classrooms?feedback=' + encodeURIComponent('Classroom code not found.'));
    }

    const existingMember = await ClassroomMember.findOne({ classroom: classroom.id, student: req.user.id });
    if (existingMember) {
      return res.redirect('/student/classrooms?feedback=' + encodeURIComponent('You already requested or joined this classroom.'));
    }

    const member = new ClassroomMember({
      classroom: classroom.id,
      student: req.user.id,
      status: classroom.approvalRequired ? 'pending' : 'approved',
      approvedAt: classroom.approvalRequired ? null : new Date(),
    });

    await member.save();
    return res.redirect('/student/classrooms?feedback=' + encodeURIComponent(classroom.approvalRequired ? 'Join request submitted.' : 'Joined classroom successfully.'));
  } catch (error) {
    return next(error);
  }
}

async function renderStudentClassroomDetail(req, res, next) {
  try {
    const member = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id }).populate('classroom');

    if (!member) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    // Syllabus progress: fully computed by the service — structure, status,
    // unlock, remaining counts, and current/next navigation all derived from
    // the DB. The view only renders courseProgress; it computes nothing.
    const courseProgress = await computeCourseProgress(member.classroom, req.user.id);

    // Course-level completion verdict (Phase C): is the course complete/passing
    // per the teacher's completionRules? Drives the completion banner and is the
    // exact same evaluation the certificate engine will use (Phase D).
    const courseCompletion = await evaluateClassroomCompletion(member.classroom, req.user.id);

    return res.render('student/classrooms/show', {
      title: member.classroom.name,
      membership: member,
      courseProgress,
      courseCompletion,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderStudentClassrooms,
  joinClassroomHandler,
  renderStudentClassroomDetail,
};
