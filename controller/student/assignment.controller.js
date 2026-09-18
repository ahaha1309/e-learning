const ClassroomMember = require('../../models/ClassroomMember');
const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');

// ── Cross-classroom aggregator: all assignments across the student's approved
// enrollments, each annotated with the student's submission state. Audit A2:
// promotes "my assignments" from 3–4 clicks (sidebar → classrooms → pick class
// → Assignments tab, one classroom at a time) to a single sidebar entry.
async function renderAllStudentAssignments(req, res, next) {
  try {
    const memberships = await ClassroomMember.find({ student: req.user.id, status: 'approved' })
      .populate('classroom', 'name code').lean();
    const valid = memberships.filter(m => m.classroom);
    const classroomIds = valid.map(m => m.classroom._id);

    let upcoming = [];
    let pastDue = [];
    let completed = [];

    if (classroomIds.length) {
      const assignments = await Assignment.find({ classroom: { $in: classroomIds }, isPublished: true })
        .populate('classroom', 'name code').sort({ dueDate: 1, createdAt: -1 }).lean();
      const submissions = await Submission.find({ student: req.user.id, assignment: { $in: assignments.map(a => a._id) } }).lean();
      const subByAssignment = {};
      submissions.forEach(s => { subByAssignment[String(s.assignment)] = s; });

      const now = new Date();
      assignments.forEach(a => {
        const sub = subByAssignment[String(a._id)] || null;
        const isPast = a.dueDate && now > new Date(a.dueDate);
        const isExpired = isPast && !a.allowLateSubmission;

        const enriched = Object.assign(a, { mySubmission: sub, isPastDue: isPast, isExpired });

        if (sub || isExpired) {
          completed.push(enriched);
        } else if (isPast) {
          pastDue.push(enriched);
        } else {
          upcoming.push(enriched);
        }
      });
    }

    return res.render('student/assignments/all', {
      title: 'Tất cả bài tập',
      upcoming,
      pastDue,
      completed,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderStudentAssignments(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');

    if (!membership) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const assignments = await Assignment.find({ classroom: membership.classroom.id, isPublished: true }).sort({ dueDate: 1, createdAt: -1 }).lean();
    const assignmentIds = assignments.map(a => a._id);
    const submissions = await Submission.find({ student: req.user.id, assignment: { $in: assignmentIds } }).lean();
    const subMap = {};
    submissions.forEach(s => { subMap[String(s.assignment)] = s; });

    const enrichedAssignments = assignments.map(a => {
      const sub = subMap[String(a._id)] || null;
      const isPastDue = a.dueDate && new Date() > new Date(a.dueDate);
      const isExpired = isPastDue && !a.allowLateSubmission && !sub;
      return {
        ...a,
        mySubmission: sub,
        isPastDue,
        isExpired,
      };
    });

    return res.render('student/assignments/index', {
      title: `${membership.classroom.name} assignments`,
      membership,
      assignments: enrichedAssignments,
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
  renderAllStudentAssignments,
  renderStudentAssignments,
  renderStudentAssignmentDetail,
};
