const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { randomUUID } = require('crypto');

const { prisma } = require('../prisma');
const usersService = require('../services/usersService');

async function register(req, res, next) {
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
    const userName = body.user_name || usersService.generateDefaultUserName(body.email);

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

    const tokens = await usersService.issueTokens(prisma, user, { tokenId: randomUUID() });

    return res.status(201).json({
      user: usersService.serializeUser(user),
      access: tokens.access,
      refresh: tokens.refresh
    });
  } catch (e) {
    if (e?.code === 'P2002') {
      const field = Array.isArray(e.meta?.target) ? e.meta.target[0] : 'detail';
      return res.status(400).json({ [field]: ['Already exists.'] });
    }
    return next(e);
  }
}

async function login(req, res, next) {
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

    const tokens = await usersService.issueTokens(prisma, user, { tokenId: randomUUID() });

    return res.json({
      user: usersService.serializeUser(user),
      access: tokens.access,
      refresh: tokens.refresh
    });
  } catch (e) {
    return next(e);
  }
}

async function refresh(req, res) {
  try {
    const schema = z.object({ refresh: z.string().min(1) });
    const { refresh: refreshJwt } = schema.parse(req.body);

    const access = await usersService.refreshAccessToken(prisma, refreshJwt);
    return res.json({ access });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function profile(req, res) {
  return res.json(usersService.serializeUser(req.user));
}

async function updateProfile(req, res, next) {
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

    return res.json(usersService.serializeUser(user));
  } catch (e) {
    if (e?.code === 'P2002') {
      const field = Array.isArray(e.meta?.target) ? e.meta.target[0] : 'detail';
      return res.status(400).json({ [field]: ['Already exists.'] });
    }
    return next(e);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(req.body);

    await usersService.sendPasswordResetOtp(prisma, email);
    return res.json({ message: 'OTP sent to email.' });
  } catch (e) {
    return next(e);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const schema = z.object({
      email: z.string().email(),
      otp: z.string().length(6)
    });
    const { email, otp } = schema.parse(req.body);

    await usersService.verifyPasswordResetOtp(prisma, email, otp);
    return res.json({ message: 'OTP verified successfully.' });
  } catch (e) {
    return next(e);
  }
}

async function resetPassword(req, res, next) {
  try {
    const schema = z.object({
      email: z.string().email(),
      new_password: z.string().min(8)
    });
    const { email, new_password } = schema.parse(req.body);

    const passwordHash = await bcrypt.hash(new_password, 10);
    await usersService.resetPasswordWithOtp(prisma, email, passwordHash);
    return res.json({ message: 'Password reset successfully.' });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  register,
  login,
  refresh,
  profile,
  updateProfile,
  forgotPassword,
  verifyOtp,
  resetPassword
};

