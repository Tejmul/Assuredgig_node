const { z } = require('zod');

const { prisma } = require('../prisma');
const freelancerService = require('../services/freelancerService');

async function applyGig(req, res, next) {
  try {
    const schema = z.object({
      gig_id: z.string().uuid(),
      description: z.string().optional().nullable()
    });
    const body = schema.parse(req.body);

    const payload = await freelancerService.applyGig(prisma, req.user, body);
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
}

async function cancelApplication(req, res, next) {
  try {
    const schema = z.object({ application_id: z.number().int() });
    const { application_id } = schema.parse(req.body);

    await freelancerService.cancelApplication(prisma, req.user, application_id);
    return res.json({ message: 'Application cancelled successfully.' });
  } catch (e) {
    return next(e);
  }
}

async function appliedGigs(req, res, next) {
  try {
    const rows = await freelancerService.listAppliedGigs(prisma, req.user.id);
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
}

module.exports = { applyGig, cancelApplication, appliedGigs };

