const { validationResult } = require('express-validator');
const Classroom = require('../../models/Classroom');
const ClassroomMember = require('../../models/ClassroomMember');
const Exam = require('../../models/Exam');
const Question = require('../../models/Question');
const ExamSubmission = require('../../models/ExamSubmission');
const Submission = require('../../models/Submission');
const { Parser } = require('json2csv');
const { sanitizeRichHtml } = require('../../helper/sanitize');
const { sendNotification } = require('../../helper/notification.helper');
const path = require('path');

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderExamIndex(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const exams = await Exam.find({ classroom: classroom.id, teacher: req.user.id }).sort({ createdAt: -1 });

    return res.render('teacher/exams/index', {
      title: `${classroom.name} exams`,
      classroom,
      exams,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderCreateExam(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    return res.render('teacher/exams/new', {
      title: 'Create Exam',
      classroom,
      formData: {},
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createExamHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('teacher/exams/new', {
        title: 'Create Exam',
        classroom,
        formData: req.body,
        errorMessage: validationMessage,
      });
    }

    const examCategory = req.body.examCategory || 'NORMAL';
    if (examCategory === 'FINAL') {
      const existingFinal = await Exam.findOne({ classroom: classroom.id, examCategory: 'FINAL' });
      if (existingFinal) {
        return res.status(422).render('teacher/exams/new', {
          title: 'Create Exam',
          classroom,
          formData: req.body,
          errorMessage: 'Lớp học này đã có bài thi FINAL. Mỗi lớp chỉ được phép có tối đa 1 bài thi kết thúc môn.',
        });
      }
    }

    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((f) => {
        const ext = path.extname(f.originalname).replace('.', '').toLowerCase();
        attachments.push({
          fileName: f.originalname,
          fileUrl: `/uploads/exams/${f.filename}`,
          fileType: ext || 'file',
          fileSize: f.size,
          uploadedAt: new Date(),
        });
      });
    }

    const exam = new Exam({
      classroom: classroom.id,
      teacher: req.user.id,
      title: req.body.title,
      description: sanitizeRichHtml(req.body.description || ''),
      type: req.body.type === 'upload' ? 'upload' : 'quiz',
      examCategory: examCategory,
      instructions: sanitizeRichHtml(req.body.instructions || ''),
      duration: Number(req.body.duration || 60),
      password: req.body.password || '',
      maxAttempts: Number(req.body.maxAttempts || 1),
      showResult: req.body.showResult || 'after_submit',
      isPublished: req.body.isPublished === 'true',
      strictMode: req.body.strictMode === 'true',
      isCoding: req.body.isCoding === 'true',
      maxViolations: Number(req.body.maxViolations || 0),
      shuffle: req.body.shuffle === 'true',
      attachments,
      totalPoints: Number(req.body.totalPoints || 10),
    });

    if (req.body.startTime) exam.startTime = new Date(req.body.startTime);
    if (req.body.endTime) exam.endTime = new Date(req.body.endTime);

    await exam.save();

    // Send notifications to all students if published
    if (exam.isPublished) {
      const members = await ClassroomMember.find({ classroom: classroom.id, status: 'approved' });
      const notificationPromises = members.map(m => {
        return sendNotification(
          m.student,
          'Bài thi mới',
          `Giáo viên đã tạo một bài thi mới: ${exam.title}`,
          `/student/classrooms/${classroom.id}/exams`
        );
      });
      await Promise.allSettled(notificationPromises);
    }

    return res.redirect(`/teacher/classrooms/${classroom.id}/exams?feedback=${encodeURIComponent('Exam created successfully.')}`);
  } catch (error) {
    return next(error);
  }
}

async function renderExamDetail(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) {
      return res.status(404).render('errors/404', { title: 'Exam not found', path: req.originalUrl });
    }

    const questions = await Question.find({ exam: exam.id }).sort({ order: 1, createdAt: 1 });
    
    // Also fetch submissions summary if needed, but for now just questions.

    return res.render('teacher/exams/show', {
      title: exam.title,
      classroom,
      exam,
      questions,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderManageQuestions(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) return res.status(404).render('errors/404', { title: 'Exam not found', path: req.originalUrl });

    if (exam.type === 'upload') {
      return res.redirect(`/teacher/classrooms/${classroom.id}/exams/${exam.id}?feedback=${encodeURIComponent('Upload exams do not have questions.')}`);
    }

    const questions = await Question.find({ exam: exam.id }).sort({ order: 1, createdAt: 1 });

    return res.render('teacher/exams/questions', {
      title: `Manage Questions - ${exam.title}`,
      classroom,
      exam,
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

    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) return res.status(404).send('Exam not found');

    const submissionCount = await ExamSubmission.countDocuments({ exam: exam.id });
    if (submissionCount > 0) {
      return res.redirect(`/teacher/classrooms/${classroom.id}/exams/${exam.id}/questions?error=Cannot+modify+questions+after+students+have+submitted`);
    }

    const { type, content, order, isCoding } = req.body;
    
    if (!content || !content.trim()) {
      const questions = await Question.find({ exam: exam.id }).sort({ order: 1, createdAt: 1 });
      return res.render('teacher/exams/questions', {
        title: `Manage Questions - ${exam.title}`,
        classroom,
        exam,
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
        const questions = await Question.find({ exam: exam.id }).sort({ order: 1, createdAt: 1 });
        return res.render('teacher/exams/questions', {
          title: `Manage Questions - ${exam.title}`,
          classroom,
          exam,
          questions,
          errorMessage: 'Multiple-choice questions need at least one option with text.',
        });
      }
    }

    const question = new Question({
      exam: exam.id,
      type: type || 'multiple_choice',
      content: sanitizeRichHtml(content),
      options,
      order: Number(order || 0),
      isCoding: type === 'essay' && isCoding === 'true',
    });

    await question.save();
    return res.redirect(`/teacher/classrooms/${classroom.id}/exams/${exam.id}/questions?feedback=Question+added`);
  } catch (error) {
    return next(error);
  }
}

async function deleteQuestionHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).json({ success: false, message: 'Classroom not found' });
    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const submissionCount = await ExamSubmission.countDocuments({ exam: exam.id });
    if (submissionCount > 0) {
      return res.status(400).json({ success: false, message: 'Không thể xóa câu hỏi vì đã có học sinh nộp bài.' });
    }

    const question = await Question.findOneAndDelete({ _id: req.params.questionId, exam: exam.id });
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    return res.json({ success: true, message: 'Xóa câu hỏi thành công' });
  } catch (error) {
    return next(error);
  }
}

async function generateMatrixHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Not found');

    const submissionCount = await ExamSubmission.countDocuments({ exam: req.params.examId });
    if (submissionCount > 0) {
      return res.redirect(`/teacher/classrooms/${classroom.id}/exams/${req.params.examId}/questions?error=Cannot+modify+questions+after+students+have+submitted`);
    }

    const { subject, chapter, num_nhan_biet, num_thong_hieu, num_van_dung } = req.body;
    const requirements = [
      { difficulty: 'nhan_biet', count: Number(num_nhan_biet || 0) },
      { difficulty: 'thong_hieu', count: Number(num_thong_hieu || 0) },
      { difficulty: 'van_dung', count: Number(num_van_dung || 0) }
    ];

    const { generateMatrixQuestions } = require('../../services/exam.service');
    const generatedCount = await generateMatrixQuestions(req.params.examId, req.user._id, subject, chapter, requirements);

    if (generatedCount > 0) {
      return res.redirect(`/teacher/classrooms/${classroom.id}/exams/${req.params.examId}/questions?feedback=Generated+${generatedCount}+questions`);
    } else {
      return res.redirect(`/teacher/classrooms/${classroom.id}/exams/${req.params.examId}/questions?feedback=No+questions+found+matching+criteria`);
    }
  } catch (error) {
    return next(error);
  }
}

async function importFromBankHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Not found');

    const submissionCount = await ExamSubmission.countDocuments({ exam: req.params.examId });
    if (submissionCount > 0) {
      return res.status(400).json({ success: false, message: 'Cannot modify questions after students have submitted' });
    }

    const { questionBankIds } = req.body;
    if (!questionBankIds || !Array.isArray(questionBankIds) || questionBankIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No questions selected' });
    }

    const { importQuestionsFromBank } = require('../../services/exam.service');
    const importedCount = await importQuestionsFromBank(req.params.examId, req.user._id, questionBankIds);

    return res.json({ success: true, importedCount });
  } catch (error) {
    return next(error);
  }
}

async function renderSubmissions(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) return res.status(404).render('errors/404', { title: 'Exam not found', path: req.originalUrl });

    const submissions = await ExamSubmission.find({ exam: exam.id })
      .populate('student', 'name email')
      .sort({ submittedAt: -1 });

    return res.render('teacher/exams/submissions', {
      title: `Submissions - ${exam.title}`,
      classroom,
      exam,
      submissions,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderGradeSubmission(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) return res.status(404).send('Exam not found');

    const submission = await ExamSubmission.findOne({ _id: req.params.submissionId, exam: exam.id })
      .populate('student', 'name email')
      .populate('answers.question');

    if (!submission) return res.status(404).send('Submission not found');

    return res.render('teacher/exams/grade', {
      title: `Grade Submission - ${submission.student.name}`,
      classroom,
      exam,
      submission,
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function submitGradeHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Classroom not found');

    const { gradeSubmission } = require('../../services/exam.service');
    await gradeSubmission(req.params.submissionId, req.params.examId, req.user._id, req.body);

    return res.redirect(`/teacher/classrooms/${classroom.id}/exams/${req.params.examId}/submissions?feedback=Grades+updated+successfully`);
  } catch (error) {
    return next(error);
  }
}

async function exportGradesCSVHandler(req, res, next) {
  try {
    const exam = await Exam.findOne({ _id: req.params.examId, teacher: req.user.id });
    if (!exam) return res.status(404).send('Exam not found');

    const submissions = await ExamSubmission.find({ exam: exam.id })
      .populate('student', 'name email')
      .sort({ submittedAt: -1 });

    const data = submissions.map(sub => ({
      'Student Name': sub.student?.name || 'Unknown',
      'Email': sub.student?.email || 'Unknown',
      'Status': sub.status,
      'Grading Status': sub.gradingStatus,
      'Score': sub.score,
      'Max Score': exam.totalPoints,
      'Submitted At': sub.submittedAt ? sub.submittedAt.toLocaleString('en-GB') : 'N/A',
      'Violations Count': sub.violations ? sub.violations.length : 0
    }));

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(data);

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`${exam.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_grades.csv`);
    return res.send('\uFEFF' + csv);
  } catch (error) {
    return next(error);
  }
}

async function renderEditExam(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) {
      return res.status(404).render('errors/404', { title: 'Exam not found', path: req.originalUrl });
    }

    const startTimeFormatted = exam.startTime ? exam.startTime.toISOString().slice(0, 16) : '';
    const endTimeFormatted = exam.endTime ? exam.endTime.toISOString().slice(0, 16) : '';

    return res.render('teacher/exams/edit', {
      title: 'Edit Exam',
      classroom,
      exam,
      formData: {},
      startTimeFormatted,
      endTimeFormatted,
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateExamHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) {
      return res.status(404).render('errors/404', { title: 'Exam not found', path: req.originalUrl });
    }

    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      const startTimeFormatted = exam.startTime ? exam.startTime.toISOString().slice(0, 16) : '';
      const endTimeFormatted = exam.endTime ? exam.endTime.toISOString().slice(0, 16) : '';
      return res.status(422).render('teacher/exams/edit', {
        title: 'Edit Exam',
        classroom,
        exam,
        formData: req.body,
        startTimeFormatted,
        endTimeFormatted,
        errorMessage: validationMessage,
      });
    }

    const examCategory = req.body.examCategory || 'NORMAL';
    if (examCategory === 'FINAL') {
      const existingFinal = await Exam.findOne({ classroom: classroom.id, examCategory: 'FINAL', _id: { $ne: exam.id } });
      if (existingFinal) {
        const startTimeFormatted = exam.startTime ? exam.startTime.toISOString().slice(0, 16) : '';
        const endTimeFormatted = exam.endTime ? exam.endTime.toISOString().slice(0, 16) : '';
        return res.status(422).render('teacher/exams/edit', {
          title: 'Edit Exam',
          classroom,
          exam,
          formData: req.body,
          startTimeFormatted,
          endTimeFormatted,
          errorMessage: 'Lớp học này đã có bài thi FINAL. Mỗi lớp chỉ được phép có tối đa 1 bài thi kết thúc môn.',
        });
      }
    }

    exam.title = req.body.title;
    exam.description = sanitizeRichHtml(req.body.description || '');
    exam.type = req.body.type === 'upload' ? 'upload' : 'quiz';
    exam.examCategory = examCategory;
    exam.instructions = sanitizeRichHtml(req.body.instructions || '');
    exam.duration = Number(req.body.duration || 60);
    exam.password = req.body.password || '';
    exam.showResult = req.body.showResult || 'after_submit';
    
    const wasPublished = exam.isPublished;
    exam.isPublished = req.body.isPublished === 'true';
    exam.strictMode = req.body.strictMode === 'true';
    exam.isCoding = req.body.isCoding === 'true';
    exam.maxViolations = Number(req.body.maxViolations || 0);
    exam.totalPoints = Number(req.body.totalPoints || 10);

    if (req.files && req.files.length > 0) {
      req.files.forEach((f) => {
        const ext = path.extname(f.originalname).replace('.', '').toLowerCase();
        exam.attachments.push({
          fileName: f.originalname,
          fileUrl: `/uploads/exams/${f.filename}`,
          fileType: ext || 'file',
          fileSize: f.size,
          uploadedAt: new Date(),
        });
      });
    }

    if (req.body.startTime) {
      exam.startTime = new Date(req.body.startTime);
    } else {
      exam.startTime = null;
    }
    if (req.body.endTime) {
      exam.endTime = new Date(req.body.endTime);
    } else {
      exam.endTime = null;
    }

    await exam.save();

    // Send notifications to all students if it was just published
    if (!wasPublished && exam.isPublished) {
      const members = await ClassroomMember.find({ classroom: classroom.id, status: 'approved' });
      const notificationPromises = members.map(m => {
        return sendNotification(
          m.student,
          'Bài thi mới',
          `Giáo viên đã cập nhật và mở một bài thi mới: ${exam.title}`,
          `/student/classrooms/${classroom.id}/exams`
        );
      });
      await Promise.allSettled(notificationPromises);
    }

    return res.redirect(`/teacher/classrooms/${classroom.id}/exams/${exam.id}?feedback=${encodeURIComponent('Exam updated successfully.')}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderExamIndex,
  renderCreateExam,
  createExamHandler,
  renderExamDetail,
  renderEditExam,
  updateExamHandler,
  renderManageQuestions,
  addQuestionHandler,
  deleteQuestionHandler,
  generateMatrixHandler,
  importFromBankHandler,
  renderSubmissions,
  renderGradeSubmission,
  submitGradeHandler,
  exportGradesCSVHandler
};
