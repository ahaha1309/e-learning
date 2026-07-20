const Notification = require('../models/Notification');

/**
 * Creates and saves a new notification for a specific user
 * @param {ObjectId|string} recipientId - The user receiving the notification
 * @param {string} title - Short title of the notification
 * @param {string} message - Details of the notification
 * @param {string} link - URL to redirect when clicked
 * @returns {Promise<Object>} The created notification
 */
async function sendNotification(recipientId, title, message, link = '#') {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      title,
      message,
      link
    });
    return notification;
  } catch (error) {
    console.error('Failed to send notification:', error);
    // We don't want notification errors to crash the main flow
    return null; 
  }
}

/**
 * Creates notifications for multiple users in bulk
 * @param {Array<ObjectId|string>} recipientIds - Array of user IDs
 * @param {string} title - Short title
 * @param {string} message - Details
 * @param {string} link - URL to redirect
 * @returns {Promise<void>}
 */
async function sendBulkNotifications(recipientIds, title, message, link = '#') {
  try {
    const notifications = recipientIds.map(id => ({
      recipient: id,
      title,
      message,
      link
    }));
    await Notification.insertMany(notifications);
  } catch (error) {
    console.error('Failed to send bulk notifications:', error);
  }
}

module.exports = {
  sendNotification,
  sendBulkNotifications
};
