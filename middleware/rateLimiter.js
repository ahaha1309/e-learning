const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

// Stricter rate limiter for sensitive routes like Login/Register
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 requests per windowMs for auth
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError('Too many login attempts from this IP, please try again after 15 minutes', 429));
  },
});

module.exports = {
  authLimiter,
};
