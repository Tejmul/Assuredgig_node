const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { nanoid } = require('nanoid');

const { prisma } = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, refreshTtlSeconds } = require('../utils/jwt');
const { sendOtpEmail } = require('../utils/mail');

const router = express.Router();

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

async function issueTokens(user) {
  const access = signAccessToken(user);
  const refreshJwt = signRefreshToken(user, nanoid(16));
  const refreshHash = hashToken(refreshJwt);
  const expiresAt = new Date(Date.now() + refreshTtlSeconds() * 1000);

  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: refreshHash, expiresAt } });

  return { access, refresh: refreshJwt };
}

router.post('/register/', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      password2: z.string().min(8),
      user_name: z.string().min(3).max(20).optional(),
      phone_number: z.string().min(6).max(20).optional().nullable(),
      profile: z
        .object({
          bio: z.string().optional().nullable(),
          skills: z.array(z.string()).optional(),
          hourly_rate: z.number().optional().nullable(),
          profile_picture: z.string().optional().nullable()
        })
        .optional()
    });

    const body = schema.parse(req.body);
    if (body.password !== body.password2) {
      return res.status(400).json({ password2: ['Passwords do not match.'] });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    const userName = body.user_name || `${body.email.split('@')[0]}-${nanoid(6)}`;

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        userName,
        phoneNumber: body.phone_number || null,
        passwordHash,
        profile: {
          create: {
            bio: body.profile?.bio ?? null,
            skills: body.profile?.skills ?? [],
            hourlyRate: body.profile?.hourly_rate ?? null,
            profilePicture: body.profile?.profile_picture ?? null
          }
        }
      },
      include: { profile: true }
    });

    const access = signAccessToken(user);
    const refreshJwt = signRefreshToken(user, nanoid(16));
    const refreshHash = hashToken(refreshJwt);
    const expiresAt = new Date(Date.now() + refreshTtlSeconds() * 1000);

    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: refreshHash, expiresAt }
    });

    return res.status(201).json({
      user: serializeUser(user),
      access,
      refresh: refreshJwt
    });
  } catch (e) {
    // Prisma unique constraint => mimic DRF-ish field errors when possible
    if (e?.code === 'P2002') {
      const field = Array.isArray(e.meta?.target) ? e.meta.target[0] : 'detail';
      return res.status(400).json({ [field]: ['Already exists.'] });
    }
    return next(e);
  }
});

router.post('/login/', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1)
    });
    const body = schema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: { email: body.email.toLowerCase() },
      include: { profile: true }
    });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    const access = signAccessToken(user);
    const refreshJwt = signRefreshToken(user, nanoid(16));
    const refreshHash = hashToken(refreshJwt);
    const expiresAt = new Date(Date.now() + refreshTtlSeconds() * 1000);

    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: refreshHash, expiresAt }
    });

    return res.json({
      user: serializeUser(user),
      access,
      refresh: refreshJwt
    });
  } catch (e) {
    return next(e);
  }
});

router.post('/token/refresh/', async (req, res, next) => {
  try {
    const schema = z.object({ refresh: z.string().min(1) });
    const { refresh } = schema.parse(req.body);

    const payload = verifyRefreshToken(refresh);
    const userId = Number(payload.sub);
    if (!userId) return res.status(401).json({ error: 'Invalid token' });

    const refreshHash = hashToken(refresh);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: refreshHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    const access = signAccessToken(user);
    return res.json({ access });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

router.get('/profile/', requireAuth, async (req, res) => {
  return res.json(serializeUser(req.user));
});

router.put('/profile/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      user_name: z.string().min(3).max(20).optional(),
      phone_number: z.string().min(6).max(20).nullable().optional(),
      profile: z
        .object({
          profile_picture: z.string().nullable().optional(),
          bio: z.string().nullable().optional(),
          skills: z.array(z.string()).optional(),
          hourly_rate: z.number().nullable().optional()
        })
        .optional()
    });

    const body = schema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        userName: body.user_name ?? undefined,
        phoneNumber: body.phone_number ?? undefined,
        profile: body.profile
          ? {
              upsert: {
                create: {
                  profilePicture: body.profile.profile_picture ?? null,
                  bio: body.profile.bio ?? null,
                  skills: body.profile.skills ?? [],
                  hourlyRate: body.profile.hourly_rate ?? null
                },
                update: {
                  profilePicture: body.profile.profile_picture ?? undefined,
                  bio: body.profile.bio ?? undefined,
                  skills: body.profile.skills ?? undefined,
                  hourlyRate: body.profile.hourly_rate ?? undefined
                }
              }
            }
          : undefined
      },
      include: { profile: true }
    });

    return res.json(serializeUser(user));
  } catch (e) {
    if (e?.code === 'P2002') {
      const field = Array.isArray(e.meta?.target) ? e.meta.target[0] : 'detail';
      return res.status(400).json({ [field]: ['Already exists.'] });
    }
    return next(e);
  }
});

router.post('/forgot-password/', async (req, res, next) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(req.body);

    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    // Avoid leaking which emails exist
    if (!user) return res.json({ message: 'OTP sent to email.' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await prisma.passwordResetOTP.create({
      data: { userId: user.id, otp }
    });

    await sendOtpEmail({ to: user.email, otp }).catch(() => {});

    return res.json({ message: 'OTP sent to email.' });
  } catch (e) {
    return next(e);
  }
});

router.post('/forgot-password/verify-otp/', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      otp: z.string().length(6)
    });
    const { email, otp } = schema.parse(req.body);

    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(400).json({ error: 'Invalid OTP' });

    const row = await prisma.passwordResetOTP.findFirst({
      where: { userId: user.id, otp, isUsedAt: null },
      orderBy: { createdAt: 'desc' }
    });
    if (!row) return res.status(400).json({ error: 'Invalid OTP' });

    await prisma.passwordResetOTP.update({
      where: { id: row.id },
      data: { isAuthenticated: true }
    });

    return res.json({ message: 'OTP verified successfully.' });
  } catch (e) {
    return next(e);
  }
});

router.post('/forgot-password/reset-password/', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      new_password: z.string().min(8)
    });
    const { email, new_password } = schema.parse(req.body);

    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(400).json({ error: 'Invalid OTP' });

    const latest = await prisma.passwordResetOTP.findFirst({
      where: { userId: user.id, isAuthenticated: true, isUsedAt: null },
      orderBy: { createdAt: 'desc' }
    });
    if (!latest) return res.status(400).json({ error: 'OTP not verified' });

    const passwordHash = await bcrypt.hash(new_password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await prisma.passwordResetOTP.update({ where: { id: latest.id }, data: { isUsedAt: new Date() } });

    return res.json({ message: 'Password reset successfully.' });
  } catch (e) {
    return next(e);
  }
});

module.exports = { router };

