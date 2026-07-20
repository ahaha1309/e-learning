const { validationResult } = require('express-validator');
const ClassroomMember = require('../../models/ClassroomMember');
const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');
const { markComplete, CONTENT_TYPES } = require('../../helper/progress');
const { resolveSubmissionAttachment } = require('../../middleware/submissionUpload');

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderSubmissionForm(req, res, next) {
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

    if (assignment.dueDate && new Date() > new Date(assignment.dueDate)) {
      return res.status(403).render('errors/403', {
        title: 'Deadline passed',
        message: 'This assignment is past its due date and cannot accept new or edited submissions.',
        path: req.originalUrl,
      });
    }

    const existingSubmission = await Submission.findOne({ assignment: assignment.id, student: req.user.id });

    return res.render('student/submissions/new', {
      title: `Submit: ${assignment.title}`,
      membership,
      assignment,
      submission: existingSubmission,
      errorMessage: null,
      formData: existingSubmission
        ? {
            textAnswer: existingSubmission.textAnswer,
          }
        : {},
    });
  } catch (error) {
    return next(error);
  }
}

async function createSubmissionHandler(req, res, next) {
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

    if (assignment.dueDate && new Date() > new Date(assignment.dueDate)) {
      return res.status(403).render('errors/403', {
        title: 'Deadline passed',
        message: 'This assignment is past its due date and cannot accept new or edited submissions.',
        path: req.originalUrl,
      });
    }

    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('student/submissions/new', {
        title: `Submit: ${assignment.title}`,
        membership,
        assignment,
        errorMessage: validationMessage,
        formData: req.body,
      });
    }

    const attachment = resolveSubmissionAttachment(req.file);
    const submittedAt = new Date();
    const submission = await Submission.findOne({ assignment: assignment.id, student: req.user.id });

    if (submission) {
      submission.textAnswer = req.body.textAnswer || '';
      submission.attachment = attachment;
      submission.status = 'submitted';
      submission.submittedAt = submittedAt;
      await submission.save();
    } else {
      await Submission.create({
        assignment: assignment.id,
        classroom: membership.classroom.id,
        teacher: assignment.teacher,
        student: req.user.id,
        textAnswer: req.body.textAnswer || '',
        attachment,
        status: 'submitted',
        submittedAt,
      });
    }

    // Record completion in the shared ledger so the computed course-progress
    // tree advances and the gradebook sees this assignment as done. Score is
    // unknown until the teacher grades; it is refreshed below at grade time.
    await markComplete({
      student: req.user.id,
      classroom: String(membership.classroom.id),
      itemType: CONTENT_TYPES.ASSIGNMENT,
      itemId: assignment.id,
      evidence: { maxScore: assignment.totalPoints, submittedAt },
    });

    return res.redirect(`/student/classrooms/${membership.classroom.id}/assignments/${assignment.id}/submission?feedback=${encodeURIComponent('Submission saved.')}`);
  } catch (error) {
    return next(error);
  }
}

async function renderSubmissionDetail(req, res, next) {
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

    const submission = await Submission.findOne({ assignment: assignment.id, student: req.user.id });

    return res.render('student/submissions/show', {
      title: `${assignment.title} submission`,
      membership,
      assignment,
      submission,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderSubmissionForm,
  createSubmissionHandler,
  renderSubmissionDetail,
};
