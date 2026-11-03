const { validationResult } = require('express-validator');
const Classroom = require('../../models/Classroom');
const Assignment = require('../../models/Assignment');
const Rubric = require('../../models/Rubric');
const ClassroomMember = require('../../models/ClassroomMember');
const { sendNotification } = require('../../helper/notification.helper');
const Question = require('../../models/Question');
const Submission = require('../../models/Submission');

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

    const assignments = await Assignment.find(filter).populate('rubric', 'name maxPoints criteria').sort({ dueDate: 1, createdAt: -1 });

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

    const rubrics = await Rubric.find({ classroom: classroom.id, teacher: req.user.id }).sort({ name: 1 }).lean();

    return res.render('teacher/assignments/new', {
      title: 'Create assignment',
      classroom,
      rubrics,
      formData: {
        rubric: req.query.rubricId || '',
      },
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

const path = require('path');

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
    const rubrics = await Rubric.find({ classroom: classroom.id, teacher: req.user.id }).sort({ name: 1 }).lean();
    if (validationMessage) {
      return res.status(422).render('teacher/assignments/new', {
        title: 'Create assignment',
        classroom,
        rubrics,
        formData: req.body,
        errorMessage: validationMessage,
      });
    }

    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((f) => {
        const ext = path.extname(f.originalname).replace('.', '').toLowerCase();
        attachments.push({
          fileName: f.originalname,
          fileUrl: `/uploads/assignments/${f.filename}`,
          fileType: ext || 'file',
          fileSize: f.size,
          uploadedAt: new Date(),
        });
      });
    } else if (req.file) {
      const ext = path.extname(req.file.originalname).replace('.', '').toLowerCase();
      attachments.push({
        fileName: req.file.originalname,
        fileUrl: `/uploads/assignments/${req.file.filename}`,
        fileType: ext || 'file',
        fileSize: req.file.size,
        uploadedAt: new Date(),
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
      type: req.body.type === 'quiz' ? 'quiz' : 'upload',
      attachments,
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

    const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: classroom.id, teacher: req.user.id }).populate('rubric');
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

async function renderEditAssignment(req, res, next) {
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

    const rubrics = await Rubric.find({ classroom: classroom.id, teacher: req.user.id }).sort({ name: 1 }).lean();
    const dueDateFormatted = assignment.dueDate ? new Date(assignment.dueDate.getTime() - (assignment.dueDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : '';

    return res.render('teacher/assignments/edit', {
      title: `Chỉnh sửa: ${assignment.title}`,
      classroom,
      assignment,
      rubrics,
      dueDateFormatted,
      formData: {
        title: assignment.title,
        description: assignment.description,
        instructions: assignment.instructions,
        totalPoints: assignment.totalPoints,
        dueDate: dueDateFormatted,
        isPublished: String(assignment.isPublished),
        allowLateSubmission: String(assignment.allowLateSubmission),
        rubric: assignment.rubric ? String(assignment.rubric) : '',
      },
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateAssignmentHandler(req, res, next) {
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

    const validationMessage = formatValidationErrors(req);
    const rubrics = await Rubric.find({ classroom: classroom.id, teacher: req.user.id }).sort({ name: 1 }).lean();
    if (validationMessage) {
      const dueDateFormatted = assignment.dueDate ? new Date(assignment.dueDate.getTime() - (assignment.dueDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : '';
      return res.status(422).render('teacher/assignments/edit', {
        title: `Chỉnh sửa: ${assignment.title}`,
        classroom,
        assignment,
        rubrics,
        dueDateFormatted,
        formData: req.body,
        errorMessage: validationMessage,
      });
    }

    assignment.title = req.body.title;
    assignment.description = req.body.description || '';
    assignment.instructions = req.body.instructions || '';
    assignment.totalPoints = Number(req.body.totalPoints || 10);
    assignment.dueDate = new Date(req.body.dueDate);
    assignment.isPublished = req.body.isPublished !== 'false';
    assignment.allowLateSubmission = req.body.allowLateSubmission === 'true';
    if (req.body.type) assignment.type = req.body.type === 'quiz' ? 'quiz' : 'upload';

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

    return res.redirect(`/teacher/classrooms/${classroom.id}/assignments?feedback=${encodeURIComponent('Đã cập nhật thông tin và gia hạn thời gian bài tập thành công.')}`);
  } catch (error) {
    return next(error);
  }
}

async function renderManageQuestions(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: classroom.id, teacher: req.user.id });
    if (!assignment || assignment.type !== 'quiz') return res.status(404).render('errors/404', { title: 'Assignment not found or not a quiz', path: req.originalUrl });

    const questions = await Question.find({ assignment: assignment.id }).sort({ order: 1, createdAt: 1 });

    return res.render('teacher/assignments/questions', {
      title: `Manage Questions - ${assignment.title}`,
      classroom,
      assignment,
      questions,
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function addQuestionHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Classroom not found');

    const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: classroom.id, teacher: req.user.id });
    if (!assignment || assignment.type !== 'quiz') return res.status(404).send('Assignment not found');

    const submissionCount = await Submission.countDocuments({ assignment: assignment.id });
    if (submissionCount > 0) {
      return res.redirect(`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}/questions?error=Cannot+modify+questions+after+students+have+submitted`);
    }

    const { type, content, order } = req.body;
    
    if (!content || !content.trim()) {
      const questions = await Question.find({ assignment: assignment.id }).sort({ order: 1, createdAt: 1 });
      return res.render('teacher/assignments/questions', {
        title: `Manage Questions - ${assignment.title}`,
        classroom,
        assignment,
        questions,
        errorMessage: 'Question content is required.',
      });
    }

    let options = [];
    if (type === 'multiple_choice' || type === 'multiple_answer') {
      const optionTexts = req.body['optionText[]'] || [];
      const optionCorrects = req.body['optionCorrect[]'] || [];
      
      const texts = Array.isArray(optionTexts) ? optionTexts : [optionTexts];
      const corrects = Array.isArray(optionCorrects) ? optionCorrects : [optionCorrects];
      
      options = texts
        .map((text, idx) => ({
          text: text.trim(),
          isCorrect: corrects.includes(idx.toString()),
        }))
        .filter(opt => opt.text.length > 0);

      if (options.length === 0) {
        const questions = await Question.find({ assignment: assignment.id }).sort({ order: 1, createdAt: 1 });
        return res.render('teacher/assignments/questions', {
          title: `Manage Questions - ${assignment.title}`,
          classroom,
          assignment,
          questions,
          errorMessage: 'Multiple-choice questions need at least one option with text.',
        });
      }
    }

    const question = new Question({
      assignment: assignment.id,
      type: type || 'multiple_choice',
      content: content.trim(),
      options,
      order: Number(order || 0),
    });

    await question.save();
    return res.redirect(`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}/questions?feedback=Question+added`);
  } catch (error) {
    return next(error);
  }
}

async function deleteQuestionHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).json({ success: false, message: 'Classroom not found' });
    const assignment = await Assignment.findOne({ _id: req.params.assignmentId, classroom: classroom.id, teacher: req.user.id });
    if (!assignment || assignment.type !== 'quiz') return res.status(404).json({ success: false, message: 'Assignment not found' });

    const submissionCount = await Submission.countDocuments({ assignment: assignment.id });
    if (submissionCount > 0) {
      return res.status(400).json({ success: false, message: 'Không thể xóa câu hỏi vì đã có học sinh nộp bài.' });
    }

    const question = await Question.findOneAndDelete({ _id: req.params.questionId, assignment: assignment.id });
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    return res.json({ success: true, message: 'Xóa câu hỏi thành công' });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderAssignmentIndex,
  renderCreateAssignment,
  createAssignmentHandler,
  renderAssignmentDetail,
  renderEditAssignment,
  updateAssignmentHandler,
  renderGlobalAssignments,
  renderManageQuestions,
  addQuestionHandler,
  deleteQuestionHandler,
};
