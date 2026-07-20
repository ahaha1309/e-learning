const QuestionBank = require('../../models/QuestionBank');

async function renderQuestionBankIndex(req, res, next) {
  try {
    const { subject, chapter, difficulty } = req.query;
    const filter = { teacher: req.user.id };
    
    if (subject) filter.subject = new RegExp(subject, 'i');
    if (chapter) filter.chapter = new RegExp(chapter, 'i');
    if (difficulty) filter.difficulty = difficulty;

    const questions = await QuestionBank.find(filter).sort({ createdAt: -1 });

    return res.render('teacher/questionBank/index', {
      title: 'Question Bank',
      questions,
      query: req.query,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderCreateQuestion(req, res, next) {
  try {
    return res.render('teacher/questionBank/new', {
      title: 'Add to Question Bank',
      formData: {},
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createQuestionHandler(req, res, next) {
  try {
    const { subject, chapter, difficulty, type, content, points } = req.body;
    
    let options = [];
    if (type === 'multiple_choice' || type === 'multiple_answer') {
      const optionTexts = req.body['optionText[]'] || [];
      const optionCorrects = req.body['optionCorrect[]'] || [];
      
      const texts = Array.isArray(optionTexts) ? optionTexts : [optionTexts];
      const corrects = Array.isArray(optionCorrects) ? optionCorrects : [optionCorrects];
      
      options = texts.map((text, idx) => ({
        text,
        isCorrect: corrects.includes(idx.toString()) || corrects.includes(text),
      }));
    }

    const qb = new QuestionBank({
      teacher: req.user.id,
      subject,
      chapter,
      difficulty,
      type: type || 'multiple_choice',
      content,
      options,
      points: Number(points || 1),
    });

    await qb.save();

    return res.redirect(`/teacher/question-banks?feedback=Question+added+successfully`);
  } catch (error) {
    return next(error);
  }
}

async function deleteQuestionHandler(req, res, next) {
  try {
    const deleted = await QuestionBank.findOneAndDelete({ _id: req.params.id, teacher: req.user.id });
    return res.redirect(`/teacher/question-banks?feedback=${deleted ? 'Question+deleted' : 'Question+not+found'}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderQuestionBankIndex,
  renderCreateQuestion,
  createQuestionHandler,
  deleteQuestionHandler,
};
