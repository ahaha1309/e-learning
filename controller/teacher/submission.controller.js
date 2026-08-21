const { validationResult } = require('express-validator');
const Classroom = require('../../models/Classroom');
const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');
const Rubric = require('../../models/Rubric');
const { markComplete, CONTENT_TYPES } = require('../../helper/progress');
const { gradeWithRubric } = require('../../services/grading.service');

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderSubmissionsIndex(req, res, next) {
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

    const submissions = await Submission.find({ assignment: assignment.id }).populate('student').sort({ submittedAt: -1 });

    return res.render('teacher/submissions/index', {
      title: `${assignment.title} submissions`,
      classroom,
      assignment,
      submissions,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderSubmissionDetail(req, res, next) {
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

    const submission = await Submission.findOne({ _id: req.params.submissionId, assignment: assignment.id }).populate('student');
    if (!submission) {
      return res.status(404).render('errors/404', {
        title: 'Submission not found',
        path: req.originalUrl,
      });
    }

    return res.render('teacher/submissions/show', {
      title: `${assignment.title} submission`,
      classroom,
      assignment,
      submission,
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function gradeSubmissionHandler(req, res, next) {
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

    const submission = await Submission.findOne({ _id: req.params.submissionId, assignment: assignment.id }).populate('student');
    if (!submission) {
      return res.status(404).render('errors/404', {
        title: 'Submission not found',
        path: req.originalUrl,
      });
    }

    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('teacher/submissions/show', {
        title: `${assignment.title} submission`,
        classroom,
        assignment,
        submission,
        errorMessage: validationMessage,
      });
    }

    const scoreVal = Number(req.body.score);
    submission.score = Math.max(0, Math.min(scoreVal, assignment.totalPoints));
    submission.teacherComment = req.body.teacherComment || '';
    submission.status = 'graded';
    submission.gradedAt = new Date();
    await submission.save();

    // Refresh the completion ledger with the graded score so the gradebook
    // reads an accurate per-item score. Idempotent: same (student, assignment)
    // row already created at submit time; this updates score + completedAt.
    await markComplete({
      student: String(submission.student._id || submission.student),
      classroom: String(classroom.id),
      itemType: CONTENT_TYPES.ASSIGNMENT,
      itemId: assignment.id,
      evidence: {
        score: submission.score,
        maxScore: assignment.totalPoints,
        submittedAt: submission.submittedAt,
      },
    });

    return res.redirect(`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}/submissions/${submission.id}?feedback=${encodeURIComponent('Submission graded.')}`);
  } catch (error) {
    return next(error);
  }
}

async function renderRubricGrade(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: classroom.id, teacher: req.user.id });
    if (!assignment || !assignment.rubric) {
      return res.status(404).render('errors/404', { title: 'This assignment has no rubric', path: req.originalUrl });
    }

    const submission = await Submission.findOne({ _id: req.params.submissionId, assignment: assignment.id }).populate('student');
    if (!submission) {
      return res.status(404).render('errors/404', { title: 'Submission not found', path: req.originalUrl });
    }

    const rubric = await Rubric.findOne({ _id: assignment.rubric, teacher: req.user.id });
    if (!rubric) {
      return res.status(404).render('errors/404', { title: 'Rubric not found', path: req.originalUrl });
    }

    // Pre-fill any previously-awarded criterion points.
    const awarded = {};
    submission.rubricGrades.forEach((g) => { awarded[String(g.criterion)] = g.points; });

    return res.render('teacher/submissions/grade-rubric', {
      title: `Grade: ${assignment.title}`,
      classroom,
      assignment,
      submission,
      rubric,
      awarded,
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function rubricGradeHandler(req, res, next) {
  try {
    // Body fields are named crit_<criterionId>. Anything else is ignored.
    const gradesMap = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith('crit_')) {
        gradesMap[key.slice('crit_'.length)] = value;
      }
    }

    await gradeWithRubric({
      submissionId: req.params.submissionId,
      assignmentId: req.params.assignmentId,
      teacherId: req.user.id,
      gradesMap,
    });

    return res.redirect(`/teacher/classrooms/${req.params.classroomId}/assignments/${req.params.assignmentId}/submissions/${req.params.submissionId}?feedback=${encodeURIComponent('Rubric grade saved.')}`);
  } catch (error) {
    if (error.statusCode) return next(error);
    return next(error);
  }
}

module.exports = {
  renderSubmissionsIndex,
  renderSubmissionDetail,
  gradeSubmissionHandler,
  renderRubricGrade,
  rubricGradeHandler,
};
