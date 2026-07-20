const User = require('../../models/User');
const { createAccessToken, createRefreshToken, hashToken } = require('../../helper/token');

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    provider: user.provider,
  };
}

async function registerUser(payload) {
  const email = payload.email.toLowerCase();
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    const error = new Error('An account with this email already exists.');
    error.statusCode = 409;
    throw error;
  }

  const user = new User({
    name: payload.name,
    email,
    role: payload.role,
    phone: payload.phone || null,
    provider: 'local',
    status: payload.role === 'teacher' ? 'pending' : 'active',
  });

  await user.setPassword(payload.password);
  await user.save();

  return user;
}

async function authenticateUser(email, password) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash +refreshTokenHash');

  if (!user || user.provider !== 'local') {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  const passwordMatches = await user.comparePassword(password);
  if (!passwordMatches) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  if (user.status === 'rejected') {
    const error = new Error('This account has been rejected by an administrator.');
    error.statusCode = 403;
    throw error;
  }

  return user;
}

async function buildAuthSession(user) {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  user.setRefreshToken(refreshToken);
  user.lastLoginAt = new Date();
  await user.save();

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
}

async function rotateRefreshToken(incomingToken) {
  const payload = require('jsonwebtoken').verify(incomingToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(payload.sub).select('+refreshTokenHash');

  if (!user || !user.matchesRefreshToken(incomingToken)) {
    const error = new Error('Refresh token is invalid or expired.');
    error.statusCode = 401;
    throw error;
  }

  const session = await buildAuthSession(user);
  return session;
}

async function revokeRefreshToken(userId) {
  const user = await User.findById(userId).select('+refreshTokenHash');
  if (!user) {
    return;
  }

  user.clearRefreshToken();
  await user.save();
}

async function upsertOAuthUser(profile, provider) {
  const providerId = profile.id;
  const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
  const name = profile.displayName || profile.name?.givenName || 'Platform user';
  const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

  let user = await User.findOne({
    $or: [
      { provider, providerId },
      ...(email ? [{ email }] : []),
    ],
  }).select('+refreshTokenHash');

  if (!user) {
    user = new User({
      name,
      email: email || `${providerId}@${provider}.local`,
      role: 'student',
      provider,
      providerId,
      avatarUrl,
      status: 'active',
    });
  } else {
    user.provider = provider;
    user.providerId = providerId;
    user.avatarUrl = avatarUrl || user.avatarUrl;
    user.status = user.status === 'rejected' ? 'rejected' : 'active';
  }

  await user.save();
  return user;
}

module.exports = {
  sanitizeUser,
  registerUser,
  authenticateUser,
  buildAuthSession,
  rotateRefreshToken,
  revokeRefreshToken,
  upsertOAuthUser,
};
