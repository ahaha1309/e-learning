const { validationResult } = require('express-validator');

const User = require('../../models/User');
const SystemSetting = require('../../models/SystemSetting');
const {
  registerUser,
  authenticateUser,
  buildAuthSession,
  rotateRefreshToken,
  revokeRefreshToken,
} = require('./auth.service');

function getValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

function setAuthCookies(res, authSession) {
  res.cookie('accessToken', authSession.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 15,
  });

  res.cookie('refreshToken', authSession.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
}

function renderRegister(req, res) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect(req.user.role === 'admin' ? '/admin' : req.user.role === 'teacher' ? '/teacher' : '/student');
  }
  SystemSetting.findOne({ key: 'allowRegistration' }).then(setting => {
    if (setting && setting.value === false) {
      return res.status(403).render('errors/403', {
        title: 'Registration Closed',
        message: 'The administrator has temporarily disabled new registrations. Please check back later.'
      });
    }

    res.render('auth/register', {
      title: 'Create an account',
      formData: {},
      errorMessage: null,
    });
  }).catch(() => {
    res.render('auth/register', { title: 'Create an account', formData: {}, errorMessage: null });
  });
}

function renderLogin(req, res) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect(req.user.role === 'admin' ? '/admin' : req.user.role === 'teacher' ? '/teacher' : '/student');
  }
  res.render('auth/login', {
    title: 'Sign in',
    formData: {},
    errorMessage: null,
  });
}

async function register(req, res, next) {
  try {
    const setting = await SystemSetting.findOne({ key: 'allowRegistration' });
    if (setting && setting.value === false) {
      return res.status(403).send('Registration is closed.');
    }

    const validationMessage = getValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('auth/register', {
        title: 'Create account',
        formData: req.body,
        errorMessage: validationMessage,
      });
    }

    const user = await registerUser(req.body);
    const authSession = await buildAuthSession(user);
    setAuthCookies(res, authSession);

    req.session.regenerate((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          return next(loginError);
        }

        req.session.role = user.role;
        req.session.save((saveError) => {
          if (saveError) {
            return next(saveError);
          }

          if (user.role === 'teacher' && user.status === 'pending') {
            return res.redirect('/auth/pending-approval');
          }

          if (user.role === 'teacher') return res.redirect('/teacher');
          return res.redirect('/student');
        });
      });
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const validationMessage = getValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('auth/login', {
        title: 'Sign in',
        formData: req.body,
        errorMessage: validationMessage,
      });
    }

    const user = await authenticateUser(req.body.email, req.body.password);
    const authSession = await buildAuthSession(user);
    setAuthCookies(res, authSession);

    req.session.regenerate((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          return next(loginError);
        }

        req.session.role = user.role;
        
        // Add audit log for login
        try {
          const AuditLog = require('../../models/AuditLog');
          AuditLog.create({
            action: 'USER_LOGIN',
            user: user._id,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
          }).catch(err => console.error('AuditLog error:', err));
        } catch (e) {
          // Ignore
        }

        req.session.save((saveError) => {
          if (saveError) {
            return next(saveError);
          }

          if (user.role === 'admin') {
            return res.status(403).render('auth/login', {
              title: 'Sign in',
              formData: req.body,
              errorMessage: 'This login is for students and teachers only. Please use the admin login.',
            });
          }

          if (user.role === 'teacher' && user.status === 'pending') {
            return res.redirect('/auth/pending-approval');
          }

          if (user.role === 'teacher') return res.redirect('/teacher');
          return res.redirect('/student');
        });
      });
    });
  } catch (error) {
    return res.status(error.statusCode || 500).render('auth/login', {
      title: 'Sign in',
      formData: req.body,
      errorMessage: error.message,
    });
  }
}

async function logout(req, res, next) {
  try {
    if (req.user?.id) {
      await revokeRefreshToken(req.user.id);
    }

    clearAuthCookies(res);

    req.session.destroy((error) => {
      if (error) {
        return next(error);
      }

      return res.redirect('/auth/login');
    });
  } catch (error) {
    return next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const incomingToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingToken) {
      return res.status(401).json({ message: 'Refresh token is required.' });
    }

    const authSession = await rotateRefreshToken(incomingToken);
    setAuthCookies(res, authSession);

    return res.status(200).json({
      user: authSession.user,
    });
  } catch (error) {
    return next(error);
  }
}

function me(req, res) {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated.' });
  }

  return res.status(200).json({ user: req.user });
}

function pendingApproval(req, res) {
  res.render('auth/pending-approval', {
    title: 'Pending approval',
  });
}

function completeOAuthLogin(req, res, next) {
  const user = req.user;

  if (!user) {
    return res.redirect('/auth/login');
  }

  buildAuthSession(user)
    .then((authSession) => {
      setAuthCookies(res, authSession);

      req.session.regenerate((sessionError) => {
        if (sessionError) {
          return next(sessionError);
        }

        req.logIn(user, (loginError) => {
          if (loginError) {
            return next(loginError);
          }

          req.session.role = user.role;
          req.session.save((saveError) => {
            if (saveError) {
              return next(saveError);
            }

            if (user.role === 'admin') return res.redirect('/admin/login');
            if (user.role === 'teacher') return res.redirect('/teacher');
            return res.redirect('/student');
          });
        });
      });
    })
    .catch((error) => next(error));
}

module.exports = {
  renderRegister,
  renderLogin,
  register,
  login,
  logout,
  refresh,
  me,
  pendingApproval,
  completeOAuthLogin,
};
