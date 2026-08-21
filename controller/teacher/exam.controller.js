const { validationResult } = require('express-validator');
const Classroom = require('../../models/Classroom');
const Exam = require('../../models/Exam');
const Question = require('../../models/Question');
const ExamSubmission = require('../../models/ExamSubmission');
const { Parser } = require('json2csv');
const { sendNotification } = require('../../helper/notification.helper');

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

    const exam = new Exam({
      classroom: classroom.id,
      teacher: req.user.id,
      title: req.body.title,
      description: req.body.description || '',
      duration: Number(req.body.duration || 60),
      password: req.body.password || '',
      maxAttempts: Number(req.body.maxAttempts || 1),
      showResult: req.body.showResult || 'after_submit',
      isPublished: req.body.isPublished === 'true',
      strictMode: req.body.strictMode === 'true',
      maxViolations: Number(req.body.maxViolations || 0),
      shuffle: req.body.shuffle === 'true',
    });

    if (req.body.startTime) exam.startTime = new Date(req.body.startTime);
    if (req.body.endTime) exam.endTime = new Date(req.body.endTime);

    await exam.save();
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

    const { type, content, points, order } = req.body;
    
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
      content: content.trim(),
      options,
      points: Number(points || 1),
      order: Number(order || 0),
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
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, teacher: req.user.id });
    if (!exam) return res.status(404).send('Not found');

    const question = await Question.findOneAndDelete({ _id: req.params.questionId, exam: exam.id });
    if (question) {
      exam.totalPoints = Math.max(0, exam.totalPoints - question.points);
      exam.questionCount = Math.max(0, exam.questionCount - 1);
      await exam.save();
    }

    return res.redirect(`/teacher/classrooms/${classroom.id}/exams/${exam.id}/questions?feedback=Question+deleted`);
  } catch (error) {
    return next(error);
  }
}

async function generateMatrixHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Not found');

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

    res.header('Content-Type', 'text/csv');
    res.attachment(`${exam.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_grades.csv`);
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderExamIndex,
  renderCreateExam,
  createExamHandler,
  renderExamDetail,
  renderManageQuestions,
  addQuestionHandler,
  deleteQuestionHandler,
  generateMatrixHandler,
  renderSubmissions,
  renderGradeSubmission,
  submitGradeHandler,
  exportGradesCSVHandler
};
