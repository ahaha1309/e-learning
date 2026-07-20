const { body } = require('express-validator');

const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }).withMessage('Name is too long'),
  body('email').trim().isEmail().withMessage('Email is invalid').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('Passwords do not match'),
  body('role').isIn(['admin', 'teacher', 'student']).withMessage('Invalid role selected'),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }).withMessage('Phone number is too long'),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('Email is invalid').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

module.exports = {
  registerRules,
  loginRules,
};
