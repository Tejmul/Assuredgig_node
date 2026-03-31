const { z } = require('zod');

const { prisma } = require('../prisma');
const portfolioService = require('../services/portfolioService');

async function list(req, res, next) {
  try {
    const schema = z.object({
      search: z.string().optional(),
      location: z.string().optional(),
      min_rate: z.string().optional(),
      max_rate: z.string().optional(),
      skills: z.string().optional()
    });
    const q = schema.parse(req.query);

    const rows = await portfolioService.list(prisma, q);
    return res.json(rows.map(portfolioService.serializePortfolio));
  } catch (e) {
    return next(e);
  }
}

async function create(req, res, next) {
  try {
    const schema = z.object({
      title: z.string().optional().nullable(),
      location: z.string().optional().nullable(),
      links: z.string().optional().nullable()
    });
    const body = schema.parse(req.body);

    const created = await portfolioService.createOrUpdate(prisma, req.user.id, body);
    return res.status(201).json(portfolioService.serializePortfolio(created));
  } catch (e) {
    return next(e);
  }
}

async function my(req, res, next) {
  try {
    const row = await portfolioService.getByUserId(prisma, req.user.id);
    return res.json(portfolioService.serializePortfolio(row));
  } catch (e) {
    return next(e);
  }
}

async function update(req, res, next) {
  try {
    const schema = z.object({
      title: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      links: z.string().nullable().optional(),
      is_online: z.boolean().optional()
    });
    const body = schema.parse(req.body);

    const updated = await portfolioService.update(prisma, req.user.id, body);
    return res.json(portfolioService.serializePortfolio(updated));
  } catch (e) {
    return next(e);
  }
}

async function remove(req, res, next) {
  try {
    await prisma.portfolioProfile.delete({ where: { userId: req.user.id } });
    return res.json({ message: 'Deleted' });
  } catch (e) {
    return next(e);
  }
}

async function getById(req, res, next) {
  try {
    const schema = z.object({ portfolio_id: z.string() });
    const { portfolio_id } = schema.parse(req.params);
    const id = Number(portfolio_id);

    const row = await portfolioService.getById(prisma, id);
    return res.json(portfolioService.serializePortfolio(row));
  } catch (e) {
    return next(e);
  }
}

async function listReviews(req, res, next) {
  try {
    const schema = z.object({ user_id: z.string() });
    const { user_id } = schema.parse(req.params);
    const uid = Number(user_id);

    const reviews = await portfolioService.listReviews(prisma, uid);
    return res.json(reviews);
  } catch (e) {
    return next(e);
  }
}

async function upsertReview(req, res, next) {
  try {
    const paramsSchema = z.object({ user_id: z.string() });
    const { user_id } = paramsSchema.parse(req.params);
    const freelancerId = Number(user_id);

    const bodySchema = z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().min(1)
    });
    const body = bodySchema.parse(req.body);

    const created = await portfolioService.upsertReview(prisma, { freelancerId, clientId: req.user.id, ...body });
    return res.status(201).json(created);
  } catch (e) {
    return next(e);
  }
}

module.exports = { list, create, my, update, remove, getById, listReviews, upsertReview };

