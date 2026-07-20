'use strict';

const Question = require('../models/Question');
const Exam = require('../models/Exam');
const AppError = require('../utils/AppError');

/**
 * Validate a single parsed question object coming from the client.
 * Returns null if valid, or an error string if invalid.
 */
function validateQuestion(q, index) {
  if (!q || typeof q.content !== 'string' || !q.content.trim()) {
    return `Question ${index + 1}: missing question content.`;
  }
  if (!['multiple_choice', 'multiple_answer', 'essay'].includes(q.type)) {
    return `Question ${index + 1}: unknown type "${q.type}".`;
  }
  if (q.type !== 'essay') {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return `Question ${index + 1}: needs at least 2 answer options.`;
    }
    for (let i = 0; i < q.options.length; i++) {
      if (!q.options[i] || !String(q.options[i].text || '').trim()) {
        return `Question ${index + 1}: option ${i + 1} has empty text.`;
      }
    }
  }
  return null;
}

/**
 * Bulk-import questions into an exam.
 *
 * @param {string}   examId      - Mongoose ObjectId string
 * @param {string}   teacherId   - Mongoose ObjectId string
 * @param {object[]} rawQuestions - Array from the client preview/edit step
 * @param {number}   defaultPoints - Score per question (default 1)
 * @returns {{ inserted: number, errors: string[] }}
 */
async function bulkImportQuestions(examId, teacherId, rawQuestions, defaultPoints = 1) {
  const exam = await Exam.findOne({ _id: examId, teacher: teacherId });
  if (!exam) throw new AppError('Exam not found', 404);

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new AppError('No questions provided.', 422);
  }

  if (rawQuestions.length > 500) {
    throw new AppError('Cannot import more than 500 questions at once.', 422);
  }

  const errors = [];
  const validDocs = [];

  // Determine starting order so imported questions append after existing ones
  const lastQuestion = await Question.findOne({ exam: examId }).sort({ order: -1 });
  let currentOrder = lastQuestion ? lastQuestion.order : 0;

  for (let i = 0; i < rawQuestions.length; i++) {
    const raw = rawQuestions[i];
    const validationError = validateQuestion(raw, i);
    if (validationError) {
      errors.push(validationError);
      continue;
    }

    const points = Number(raw.points) > 0 ? Number(raw.points) : defaultPoints;
    currentOrder++;

    const options = (raw.type !== 'essay' && Array.isArray(raw.options))
      ? raw.options.map((opt) => ({
          text: String(opt.text || '').trim(),
          isCorrect: opt.isCorrect === true || opt.isCorrect === 'true',
        }))
      : [];

    validDocs.push({
      exam: examId,
      type: raw.type || 'multiple_choice',
      content: String(raw.content).trim(),
      options,
      points,
      order: currentOrder,
    });
  }

  let inserted = 0;
  if (validDocs.length > 0) {
    // Use insertMany with ordered:false so partial failures don't block the rest
    const result = await Question.insertMany(validDocs, { ordered: false });
    inserted = result.length;

    // Update exam counters
    const totalPoints = validDocs.reduce((sum, q) => sum + q.points, 0);
    await Exam.findByIdAndUpdate(examId, {
      $inc: { questionCount: inserted, totalPoints },
    });
  }

  return { inserted, errors };
}

module.exports = { bulkImportQuestions };
