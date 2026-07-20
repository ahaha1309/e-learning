const Notification = require('../../models/Notification');

async function listNotifications(req, res, next) {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.render('admin/notifications/index', {
      title: 'Notifications',
      notifications
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listNotifications };
