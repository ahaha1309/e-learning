const User = require('../../models/User');

async function getProfileById(userId) {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error('User profile not found.');
    error.statusCode = 404;
    throw error;
  }

  return user;
}

async function updateProfile(userId, payload) {
  const user = await getProfileById(userId);

  user.name = payload.name;
  user.phone = payload.phone || null;
  user.avatarUrl = payload.avatarUrl || null;
  user.emailNotifications = payload.emailNotifications === 'true';

  await user.save();
  return user;
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+passwordHash');

  if (!user || user.provider !== 'local') {
    const error = new Error('Password changes are only available for local accounts.');
    error.statusCode = 400;
    throw error;
  }

  const passwordMatches = await user.comparePassword(currentPassword);
  if (!passwordMatches) {
    const error = new Error('Current password is incorrect.');
    error.statusCode = 422;
    throw error;
  }

  await user.setPassword(newPassword);
  await user.save();
  return user;
}

module.exports = {
  getProfileById,
  updateProfile,
  changePassword,
};
