const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    }
  );
}

function createRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      tokenType: 'refresh',
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  hashToken,
};
