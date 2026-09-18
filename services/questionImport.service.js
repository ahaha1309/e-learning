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
 * Bulk-import questions into an exam or assignment.
 *
 * @param {string}   targetId    - Mongoose ObjectId string for Exam or Assignment
 * @param {string}   teacherId   - Mongoose ObjectId string
 * @param {object[]} rawQuestions - Array from the client preview/edit step
 * @param {string}   targetType  - 'exam' or 'assignment'
 * @returns {{ inserted: number, errors: string[] }}
 */
async function bulkImportQuestions(targetId, teacherId, rawQuestions, targetType = 'exam') {
  let target;
  if (targetType === 'assignment') {
    const Assignment = require('../models/Assignment');
    target = await Assignment.findOne({ _id: targetId, teacher: teacherId });
  } else {
    target = await Exam.findOne({ _id: targetId, teacher: teacherId });
  }
  
  if (!target) throw new AppError(`${targetType === 'exam' ? 'Exam' : 'Assignment'} not found`, 404);

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new AppError('No questions provided.', 422);
  }

  if (rawQuestions.length > 500) {
    throw new AppError('Cannot import more than 500 questions at once.', 422);
  }

  const errors = [];
  const validDocs = [];

  // Determine starting order so imported questions append after existing ones
  const query = {};
  if (targetType === 'assignment') {
    query.assignment = targetId;
  } else {
    query.exam = targetId;
  }
  const lastQuestion = await Question.findOne(query).sort({ order: -1 });
  let currentOrder = lastQuestion ? lastQuestion.order : 0;

  for (let i = 0; i < rawQuestions.length; i++) {
    const raw = rawQuestions[i];
    const validationError = validateQuestion(raw, i);
    if (validationError) {
      errors.push(validationError);
      continue;
    }

    const points = Number(raw.points) > 0 ? Number(raw.points) : 1;
    currentOrder++;

    const options = (raw.type !== 'essay' && Array.isArray(raw.options))
      ? raw.options.map((opt) => ({
          text: String(opt.text || '').trim(),
          isCorrect: opt.isCorrect === true || opt.isCorrect === 'true',
        }))
      : [];

    const doc = {
      type: raw.type || 'multiple_choice',
      content: String(raw.content).trim(),
      options,
      points, // default 1, though deprecated, kept for schema compat
      order: currentOrder,
    };
    if (targetType === 'assignment') {
      doc.assignment = targetId;
    } else {
      doc.exam = targetId;
    }
    validDocs.push(doc);
  }

  let inserted = 0;
  if (validDocs.length > 0) {
    // Use insertMany with ordered:false so partial failures don't block the rest
    const result = await Question.insertMany(validDocs, { ordered: false });
    inserted = result.length;

    // Update counters
    if (targetType === 'assignment') {
      const Assignment = require('../models/Assignment');
      await Assignment.findByIdAndUpdate(targetId, {
        $inc: { questionCount: inserted },
      });
    } else {
      await Exam.findByIdAndUpdate(targetId, {
        $inc: { questionCount: inserted },
      });
    }
  }

  return { inserted, errors };
}

module.exports = { bulkImportQuestions };
