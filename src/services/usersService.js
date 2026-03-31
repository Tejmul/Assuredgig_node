const { randomUUID } = require('crypto');

const { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, refreshTtlSeconds } = require('../utils/jwt');
const { sendOtpEmail } = require('../utils/mail');

function shortId(len = 6) {
  return randomUUID().replace(/-/g, '').slice(0, len);
}

function generateDefaultUserName(email) {
  return `${String(email).split('@')[0]}-${shortId(6)}`;
}

function serializeUser(user) {
  const profile = user.profile
    ? {
        profile_picture: user.profile.profilePicture || null,
        bio: user.profile.bio || null,
        skills: user.profile.skills || [],
        hourly_rate: user.profile.hourlyRate ? String(user.profile.hourlyRate) : null,
        created_at: user.profile.createdAt.toISOString(),
        updated_at: user.profile.updatedAt.toISOString()
      }
    : null;

  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    user_name: user.userName,
    phone_number: user.phoneNumber,
    verified: user.verified,
    date_joined: user.dateJoined.toISOString().slice(0, 10),
    profile
  };
}

async function issueTokens(prisma, user, { tokenId }) {
  const access = signAccessToken(user);
  const refreshJwt = signRefreshToken(user, tokenId);
  const refreshHash = hashToken(refreshJwt);
  const expiresAt = new Date(Date.now() + refreshTtlSeconds() * 1000);
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: refreshHash, expiresAt } });
  return { access, refresh: refreshJwt };
}

async function refreshAccessToken(prisma, refreshJwt) {
  const payload = verifyRefreshToken(refreshJwt);
  const userId = Number(payload.sub);
  if (!userId) {
    const err = new Error('Invalid token');
    err.status = 401;
    throw err;
  }

  const refreshHash = hashToken(refreshJwt);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: refreshHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    const err = new Error('Invalid token');
    err.status = 401;
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!user) {
    const err = new Error('Invalid token');
    err.status = 401;
    throw err;
  }

  return signAccessToken(user);
}

async function sendPasswordResetOtp(prisma, email) {
  const user = await prisma.user.findFirst({ where: { email: String(email).toLowerCase() } });
  if (!user) return;

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.passwordResetOTP.create({ data: { userId: user.id, otp } });
  await sendOtpEmail({ to: user.email, otp }).catch(() => {});
}

async function verifyPasswordResetOtp(prisma, email, otp) {
  const user = await prisma.user.findFirst({ where: { email: String(email).toLowerCase() } });
  if (!user) {
    const err = new Error('Invalid OTP');
    err.status = 400;
    throw err;
  }

  const row = await prisma.passwordResetOTP.findFirst({
    where: { userId: user.id, otp, isUsedAt: null },
    orderBy: { createdAt: 'desc' }
  });
  if (!row) {
    const err = new Error('Invalid OTP');
    err.status = 400;
    throw err;
  }

  await prisma.passwordResetOTP.update({ where: { id: row.id }, data: { isAuthenticated: true } });
}

async function resetPasswordWithOtp(prisma, email, passwordHash) {
  const user = await prisma.user.findFirst({ where: { email: String(email).toLowerCase() } });
  if (!user) {
    const err = new Error('Invalid OTP');
    err.status = 400;
    throw err;
  }

  const latest = await prisma.passwordResetOTP.findFirst({
    where: { userId: user.id, isAuthenticated: true, isUsedAt: null },
    orderBy: { createdAt: 'desc' }
  });
  if (!latest) {
    const err = new Error('OTP not verified');
    err.status = 400;
    throw err;
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await prisma.passwordResetOTP.update({ where: { id: latest.id }, data: { isUsedAt: new Date() } });
}

module.exports = {
  generateDefaultUserName,
  serializeUser,
  issueTokens,
  refreshAccessToken,
  sendPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithOtp
};

