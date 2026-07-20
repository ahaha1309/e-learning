const Assignment = require('../../models/Assignment');
const Submission = require('../../models/Submission');

async function listAssignments(req, res, next) {
  try {
    const query = req.query.q;
    let filter = {};
    if (query) {
      filter.title = { $regex: query, $options: 'i' };
    }
    const assignments = await Assignment.find(filter)
      .populate('classroom', 'name')
      .populate('teacher', 'name')
      .sort({ createdAt: -1 });

    return res.render('admin/assignments/index', {
      title: 'Assignments',
      assignments,
      query
    });
  } catch (error) {
    return next(error);
  }
}

async function showAssignment(req, res, next) {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId)
      .populate('classroom', 'name')
      .populate('teacher', 'name');

    if (!assignment) {
      return res.status(404).render('admin/errors/notFound', { title: 'Assignment not found', path: req.originalUrl });
    }

    const submissions = await Submission.find({ assignment: assignment.id })
      .populate('student', 'name email')
      .sort({ createdAt: -1 });

    return res.render('admin/assignments/show', {
      title: assignment.title,
      assignment,
      submissions,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listAssignments, showAssignment };
