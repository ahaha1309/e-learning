function renderForbidden(res) {
  return res.status(403).render('errors/403', {
    title: 'Access denied',
  });
}

function isActiveAuthenticated(req) {
  const authenticated = req.isAuthenticated ? req.isAuthenticated() : Boolean(req.user);
  return authenticated && req.user && req.user.status === 'active';
}

function requireAuth(req, res, next) {
  const authenticated = req.isAuthenticated ? req.isAuthenticated() : Boolean(req.user);

  if (!authenticated || !req.user) {
    return res.redirect('/auth/login');
  }

  if (req.user.status !== 'active') {
    return renderForbidden(res);
  }

  return next();
}

function requireRole(...allowedRoles) {
  return function roleGuard(req, res, next) {
    const authenticated = req.isAuthenticated ? req.isAuthenticated() : Boolean(req.user);

    if (!authenticated || !req.user) {
      return res.redirect('/auth/login');
    }

    if (req.user.status !== 'active') {
      return renderForbidden(res);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return renderForbidden(res);
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};