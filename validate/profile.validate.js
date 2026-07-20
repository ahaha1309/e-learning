const { body } = require('express-validator');

const updateProfileRules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }).withMessage('Name is too long'),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }).withMessage('Phone number is too long'),
  // avatar is now an uploaded image file (validated by multer middleware),
  // no longer a manually entered URL, so there is no isURL() rule here.
];

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => value === req.body.newPassword).withMessage('Passwords do not match'),
];

module.exports = {
  updateProfileRules,
  changePasswordRules,
};
