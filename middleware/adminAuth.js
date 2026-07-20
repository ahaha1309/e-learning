const Notification = require('../models/Notification');
const SystemSetting = require('../models/SystemSetting');
const User = require('../models/User');

function timeAgo(date) {
  var now = new Date();
  var diff = Math.floor((now - new Date(date)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function requireAdminAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/admin/login');
  }

  if (req.user.role !== 'admin') {
    return res.redirect('/admin/login');
  }

  if (req.user.status !== 'active') {
    return res.status(403).render('admin/errors/forbidden', {
      title: 'Access denied',
    });
  }

  return next();
}

async function attachAdminLocals(req, res, next) {
  res.locals.currentUser = req.user || null;
  res.locals.isAuthenticated = Boolean(req.user);
  res.locals.pendingCount = 0;
  res.locals.siteName = 'Admin Panel';
  res.locals.timeAgo = timeAgo;
  res.locals.path = req.originalUrl || req.path;

  // Derive active navigation from request path
  var pathSegments = req.originalUrl.replace(/^\/admin\/?/, '').split('/');
  res.locals.activeNav = pathSegments[0] || 'dashboard';

  if (req.user && req.user.role === 'admin') {
    try {
      res.locals.pendingCount = await User.countDocuments({
        role: 'teacher',
        status: 'pending',
      });
    } catch (err) {
      res.locals.pendingCount = 0;
    }

    try {
      const siteNameSetting = await SystemSetting.findOne({ key: 'siteName' });
      res.locals.siteName = siteNameSetting ? siteNameSetting.value : 'Admin Panel';
    } catch (err) {
      // keep default
    }
  }

  next();
}

module.exports = {
  requireAdminAuth,
  attachAdminLocals,
};
