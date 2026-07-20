const Notification = require('../models/Notification');

async function renderIndex(req, res, next) {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.render('notifications/index', {
      title: 'Notifications',
      notifications
    });
  } catch (error) {
    return next(error);
  }
}

async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user.id },
      { isRead: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).send('Notification not found');
    }

    return res.redirect(notification.link || '/notifications');
  } catch (error) {
    return next(error);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true }
    );
    
    return res.redirect('back');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderIndex,
  markAsRead,
  markAllAsRead
};
