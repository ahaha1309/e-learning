const express = require('express');
const { body, validationResult } = require('express-validator');

const qbController = require('../controller/teacher/questionBank.controller');

const router = express.Router();

const validateQuestion = [
  body('subject').notEmpty().withMessage('Subject is required'),
  body('chapter').notEmpty().withMessage('Chapter is required'),
  body('content').notEmpty().withMessage('Content is required'),
];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('teacher/questionBank/new', {
      title: 'Add to Question Bank',
      formData: req.body,
      errorMessage: errors.array()[0].msg,
    });
  }
  next();
}

router.get('/', qbController.renderQuestionBankIndex);
router.get('/api/search', qbController.searchQuestionsApi);
router.get('/new', qbController.renderCreateQuestion);
router.post('/', validateQuestion, handleValidation, qbController.createQuestionHandler);
router.post('/:id/delete', qbController.deleteQuestionHandler);

module.exports = router;
