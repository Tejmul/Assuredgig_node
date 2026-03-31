const express = require('express');
const { z } = require('zod');

const { prisma } = require('../prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serializePortfolio(profile) {
  return {
    id: profile.id,
    uuid: profile.uuid,
    user_id: profile.userId,
    title: profile.title,
    location: profile.location,
    response_time: profile.responseTime,
    is_online: profile.isOnline,
    verified: profile.verified,
    member_since: profile.memberSince.toISOString().slice(0, 10),
    completed_projects: profile.completedProjects,
    view_count: profile.viewCount,
    links: profile.links,
    created_at: profile.createdAt.toISOString(),
    updated_at: profile.updatedAt.toISOString()
  };
}

router.get('/', async (req, res, next) => {
  try {
    const schema = z.object({
      search: z.string().optional(),
      location: z.string().optional(),
      min_rate: z.string().optional(),
      max_rate: z.string().optional(),
      skills: z.string().optional()
    });
    const q = schema.parse(req.query);

    const where = {};
    if (q.location) where.location = { contains: q.location, mode: 'insensitive' };
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { user: { userName: { contains: q.search, mode: 'insensitive' } } }
      ];
    }

    const rows = await prisma.portfolioProfile.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { user: true }
    });

    return res.json(rows.map(serializePortfolio));
  } catch (e) {
    return next(e);
  }
});

router.post('/create/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().optional().nullable(),
      location: z.string().optional().nullable(),
      links: z.string().optional().nullable()
    });
    const body = schema.parse(req.body);

    const created = await prisma.portfolioProfile.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        title: body.title ?? null,
        location: body.location ?? null,
        links: body.links ?? null
      },
      update: {
        title: body.title ?? undefined,
        location: body.location ?? undefined,
        links: body.links ?? undefined
      }
    });

    return res.status(201).json(serializePortfolio(created));
  } catch (e) {
    return next(e);
  }
});

router.get('/my/', requireAuth, async (req, res, next) => {
  try {
    const row = await prisma.portfolioProfile.findUnique({ where: { userId: req.user.id } });
    if (!row) return res.status(404).json({ error: 'Portfolio not found' });
    return res.json(serializePortfolio(row));
  } catch (e) {
    return next(e);
  }
});

router.put('/update/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      links: z.string().nullable().optional(),
      is_online: z.boolean().optional()
    });
    const body = schema.parse(req.body);

    const updated = await prisma.portfolioProfile.update({
      where: { userId: req.user.id },
      data: {
        title: body.title ?? undefined,
        location: body.location ?? undefined,
        links: body.links ?? undefined,
        isOnline: body.is_online ?? undefined
      }
    });
    return res.json(serializePortfolio(updated));
  } catch (e) {
    return next(e);
  }
});

router.delete('/delete/', requireAuth, async (req, res, next) => {
  try {
    await prisma.portfolioProfile.delete({ where: { userId: req.user.id } });
    return res.json({ message: 'Deleted' });
  } catch (e) {
    return next(e);
  }
});

router.get('/:portfolio_id/', async (req, res, next) => {
  try {
    const schema = z.object({ portfolio_id: z.string() });
    const { portfolio_id } = schema.parse(req.params);

    const id = Number(portfolio_id);
    const row = await prisma.portfolioProfile.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ error: 'Portfolio not found' });
    return res.json(serializePortfolio(row));
  } catch (e) {
    return next(e);
  }
});

router.get('/:user_id/reviews/', async (req, res, next) => {
  try {
    const schema = z.object({ user_id: z.string() });
    const { user_id } = schema.parse(req.params);
    const uid = Number(user_id);

    const reviews = await prisma.userReview.findMany({
      where: { freelancerId: uid },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(
      reviews.map((r) => ({
        uuid: r.uuid,
        rating: r.rating,
        comment: r.comment,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString()
      }))
    );
  } catch (e) {
    return next(e);
  }
});

router.post('/:user_id/reviews/', requireAuth, async (req, res, next) => {
  try {
    const paramsSchema = z.object({ user_id: z.string() });
    const { user_id } = paramsSchema.parse(req.params);
    const freelancerId = Number(user_id);

    const bodySchema = z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().min(1)
    });
    const body = bodySchema.parse(req.body);

    const created = await prisma.userReview.upsert({
      where: { freelancerId_clientId: { freelancerId, clientId: req.user.id } },
      create: { freelancerId, clientId: req.user.id, rating: body.rating, comment: body.comment },
      update: { rating: body.rating, comment: body.comment }
    });
    return res.status(201).json({
      uuid: created.uuid,
      rating: created.rating,
      comment: created.comment,
      created_at: created.createdAt.toISOString(),
      updated_at: created.updatedAt.toISOString()
    });
  } catch (e) {
    return next(e);
  }
});

module.exports = { router };

