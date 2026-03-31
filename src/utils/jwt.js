const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function seconds(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function accessTtlSeconds() {
  return seconds(process.env.JWT_ACCESS_TTL_SECONDS, 3600);
}

function refreshTtlSeconds() {
  return seconds(process.env.JWT_REFRESH_TTL_SECONDS, 86400);
}

function accessSecret() {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('JWT_ACCESS_SECRET is required');
  return s;
}

function refreshSecret() {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error('JWT_REFRESH_SECRET is required');
  return s;
}

function signAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iat: now
    },
    accessSecret(),
    {
      subject: String(user.id),
      expiresIn: accessTtlSeconds()
    }
  );
}

function signRefreshToken(user, tokenId) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      tid: tokenId,
      iat: now
    },
    refreshSecret(),
    {
      subject: String(user.id),
      expiresIn: refreshTtlSeconds()
    }
  );
}

function verifyRefreshToken(token) {
  return jwt.verify(token, refreshSecret());
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  accessTtlSeconds,
  refreshTtlSeconds
};

