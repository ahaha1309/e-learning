const express = require('express');
const passport = require('passport');
const { authLimiter } = require('../middleware/rateLimiter');

const {
  renderRegister,
  renderLogin,
  register,
  login,
  logout,
  refresh,
  me,
  pendingApproval,
  completeOAuthLogin,
} = require('../controller/auth/auth.controller');
const { registerRules, loginRules } = require('../validate/auth.validate');

const router = express.Router();

router.get('/register', renderRegister);
router.post('/register', authLimiter, registerRules, register);
router.get('/login', renderLogin);
router.post('/login', authLimiter, loginRules, login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', me);
router.get('/pending-approval', pendingApproval);

router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', {
    title: 'Reset password',
    message: null,
    errorMessage: null,
  });
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user) {
      return res.render('auth/forgot-password', {
        title: 'Reset password',
        message: 'If that email exists in our system, we\'ve sent instructions.',
        errorMessage: null,
      });
    }
    return res.render('auth/forgot-password', {
      title: 'Reset password',
      message: 'If that email exists in our system, we\'ve sent instructions.',
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/auth/login' }), completeOAuthLogin);
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));
router.get('/facebook/callback', passport.authenticate('facebook', { session: false, failureRedirect: '/auth/login' }), completeOAuthLogin);

module.exports = router;
