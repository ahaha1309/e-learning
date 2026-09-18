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

async function renderAdminEditAssignment(req, res, next) {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId)
      .populate('classroom', 'name')
      .populate('teacher', 'name');

    if (!assignment) {
      return res.status(404).render('admin/errors/notFound', { title: 'Assignment not found', path: req.originalUrl });
    }

    const dueDateFormatted = assignment.dueDate ? new Date(assignment.dueDate.getTime() - (assignment.dueDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : '';

    return res.render('admin/assignments/edit', {
      title: `Admin - Edit: ${assignment.title}`,
      assignment,
      dueDateFormatted,
      formData: {
        title: assignment.title,
        description: assignment.description,
        instructions: assignment.instructions,
        totalPoints: assignment.totalPoints,
        dueDate: dueDateFormatted,
        isPublished: String(assignment.isPublished),
        allowLateSubmission: String(assignment.allowLateSubmission),
      },
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateAdminAssignmentHandler(req, res, next) {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) {
      return res.status(404).render('admin/errors/notFound', { title: 'Assignment not found', path: req.originalUrl });
    }

    assignment.title = req.body.title;
    assignment.description = req.body.description || '';
    assignment.instructions = req.body.instructions || '';
    assignment.totalPoints = Number(req.body.totalPoints || 10);
    assignment.dueDate = new Date(req.body.dueDate);
    assignment.isPublished = req.body.isPublished !== 'false';
    assignment.allowLateSubmission = req.body.allowLateSubmission === 'true';

    const path = require('path');
    if (req.files && req.files.length > 0) {
      req.files.forEach((f) => {
        const ext = path.extname(f.originalname).replace('.', '').toLowerCase();
        assignment.attachments.push({
          fileName: f.originalname,
          fileUrl: `/uploads/assignments/${f.filename}`,
          fileType: ext || 'file',
          fileSize: f.size,
          uploadedAt: new Date(),
        });
      });
    } else if (req.file) {
      const ext = path.extname(req.file.originalname).replace('.', '').toLowerCase();
      assignment.attachments.push({
        fileName: req.file.originalname,
        fileUrl: `/uploads/assignments/${req.file.filename}`,
        fileType: ext || 'file',
        fileSize: req.file.size,
        uploadedAt: new Date(),
      });
    }

    await assignment.save();

    return res.redirect(`/admin/assignments/${assignment.id}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listAssignments,
  showAssignment,
  renderAdminEditAssignment,
  updateAdminAssignmentHandler,
};
