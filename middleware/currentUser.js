const Notification = require('../models/Notification');
const SystemSetting = require('../models/SystemSetting');
const User = require('../models/User');
const DirectMessage = require('../models/DirectMessage');

async function attachCurrentUser(req, res, next) {
  const authenticated = req.isAuthenticated ? req.isAuthenticated() : Boolean(req.user);
  res.locals.currentUser = authenticated ? req.user : null;
  res.locals.isAuthenticated = authenticated;
  res.locals.pendingCount = 0;
  res.locals.path = req.originalUrl || req.path;
  
  if (authenticated && req.user) {
    try {
      res.locals.unreadCount = await Notification.countDocuments({
        recipient: req.user.id,
        isRead: false
      });
    } catch (err) {
      console.error('Failed to get unread notification count:', err);
      res.locals.unreadCount = 0;
    }

    try {
      res.locals.unreadChatCount = await DirectMessage.countDocuments({
        recipient: req.user.id,
        isRead: false
      });
    } catch (err) {
      console.error('Failed to get unread chat count:', err);
      res.locals.unreadChatCount = 0;
    }

    if (req.user.role === 'admin') {
      try {
        res.locals.pendingCount = await User.countDocuments({
          role: 'teacher',
          status: 'pending',
        });
      } catch (err) {
        res.locals.pendingCount = 0;
      }
    }
  } else {
    res.locals.unreadCount = 0;
    res.locals.unreadChatCount = 0;
  }
  
  try {
    const siteNameSetting = await SystemSetting.findOne({ key: 'siteName' });
    res.locals.siteName = siteNameSetting ? siteNameSetting.value : 'E-Learning LMS';
  } catch (err) {
    res.locals.siteName = 'E-Learning LMS';
  }
  
  next();
}

module.exports = {
  attachCurrentUser,
};
