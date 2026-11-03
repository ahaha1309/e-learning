'use strict';

const path = require('path');
const Classroom = require('../../models/Classroom');
const Exam = require('../../models/Exam');
const ExamSubmission = require('../../models/ExamSubmission');
const { uploadAiDoc, cleanupTempFile } = require('../../middleware/aiDocUpload');
const { generateQuestionsFromDocument } = require('../../services/aiQuestionGen.service');

// ── Constants ───────────────────────────────────────────────────────────────
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.pptx']);
const MAX_FILE_SIZE_MB = 30;

// ── Render the AI generation page ───────────────────────────────────────────
async function renderAiGenerate(req, res, next) {
  try {
    const classroom = await Classroom.findOne({
      _id: req.params.classroomId,
      teacher: req.user.id,
    });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Không tìm thấy lớp học',
        path: req.originalUrl,
      });
    }

    const exam = await Exam.findOne({
      _id: req.params.examId,
      classroom: classroom.id,
      teacher: req.user.id,
    });
    if (!exam) {
      return res.status(404).render('errors/404', {
        title: 'Không tìm thấy bài thi',
        path: req.originalUrl,
      });
    }

    if (exam.type === 'upload') {
      return res.redirect(
        `/teacher/classrooms/${classroom.id}/exams/${exam.id}?feedback=${encodeURIComponent(
          'Bài thi upload không hỗ trợ tính năng này.'
        )}`
      );
    }

    return res.render('teacher/exams/ai-generate', {
      title: `Tạo câu hỏi bằng AI — ${exam.title}`,
      classroom,
      exam,
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

// ── POST: Process uploaded document and call Gemini ─────────────────────────
async function generateQuestionsHandler(req, res, next) {
  // Run multer upload first — we handle the error here to return JSON
  uploadAiDoc(req, res, async (uploadErr) => {
    const file = req.file;

    // Always try to clean up the temp file when done
    let cleanupPath = null;

    try {
      // ── Authorize ──
      const classroom = await Classroom.findOne({
        _id: req.params.classroomId,
        teacher: req.user.id,
      });
      if (!classroom) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học.' });
      }

      const exam = await Exam.findOne({
        _id: req.params.examId,
        classroom: classroom.id,
        teacher: req.user.id,
      });
      if (!exam) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài thi.' });
      }

      // ── Block modification if exam has submissions ──
      const submissionCount = await ExamSubmission.countDocuments({ exam: exam.id });
      if (submissionCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Không thể thêm câu hỏi vì đã có học sinh nộp bài.',
        });
      }

      // ── Handle upload error ──
      if (uploadErr) {
        return res.status(400).json({ success: false, message: uploadErr.message });
      }

      if (!file) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn tệp tài liệu.' });
      }

      cleanupPath = file.path;

      // ── Server-side file validation ──
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({
          success: false,
          message: `Định dạng tệp "${ext}" không được hỗ trợ. Vui lòng dùng PDF, DOCX, TXT, hoặc PPTX.`,
        });
      }

      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: `Tệp vượt quá giới hạn ${MAX_FILE_SIZE_MB}MB.`,
        });
      }

      // ── Parse & validate generation params ──
      const numQuestions = Math.min(Math.max(parseInt(req.body.numQuestions, 10) || 5, 1), 50);
      const difficulty = ['easy', 'medium', 'hard'].includes(req.body.difficulty)
        ? req.body.difficulty
        : 'medium';
      const language = ['vi', 'en'].includes(req.body.language) ? req.body.language : 'vi';
      const numOptions = Math.min(Math.max(parseInt(req.body.numOptions, 10) || 4, 2), 6);
      const focusTopic = typeof req.body.focusTopic === 'string'
        ? req.body.focusTopic.trim().slice(0, 200)
        : '';
      const includeExplanation = req.body.includeExplanation === 'true';

      // ── Call AI service ──
      const result = await generateQuestionsFromDocument({
        filePath: file.path,
        originalName: file.originalname,
        numQuestions,
        difficulty,
        language,
        numOptions,
        focusTopic,
        includeExplanation,
      });

      return res.json({
        success: true,
        questions: result.questions,
        warnings: result.errors,
        meta: {
          textLength: result.textLength,
          chunks: result.chunks,
          generated: result.questions.length,
          requested: numQuestions,
        },
      });
    } catch (error) {
      console.error('[AI Generate] Error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Đã xảy ra lỗi khi tạo câu hỏi. Vui lòng thử lại.',
      });
    } finally {
      // Always clean up temp file
      if (cleanupPath) cleanupTempFile(cleanupPath);
    }
  });
}

module.exports = {
  renderAiGenerate,
  generateQuestionsHandler,
};
