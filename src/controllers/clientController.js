const { z } = require('zod');

const { prisma } = require('../prisma');
const clientService = require('../services/clientService');

async function createGig(req, res, next) {
  try {
    const schema = z.object({
      client_name: z.string().min(1).max(77),
      title: z.string().min(1).max(200),
      description: z.string().min(1),
      category: z.string().optional().nullable(),
      budget: z.number(),
      project_type: z.enum(['fixed', 'hourly']),
      duration: z.string().optional().nullable(),
      skills_required: z.array(z.string()).optional(),
      location: z.string().optional().nullable(),
      difficulty: z.enum(['beginner', 'intermediate', 'expert']).optional().nullable(),
      verified: z.boolean().optional(),
      featured: z.boolean().optional(),
      deadline: z.string().optional().nullable(),
      status: z.enum(['open', 'closed']).optional()
    });

    const body = schema.parse(req.body);
    const gig = await clientService.createGig(prisma, req.user, body);
    return res.status(201).json({ message: 'Gig created successfully', gig: clientService.serializeGig(gig) });
  } catch (e) {
    return next(e);
  }
}

async function updateGig(req, res, next) {
  try {
    const schema = z
      .object({
        gig_id: z.string().uuid(),
        client_name: z.string().min(1).max(77).optional(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().min(1).optional(),
        category: z.string().nullable().optional(),
        budget: z.number().optional(),
        project_type: z.enum(['fixed', 'hourly']).optional(),
        duration: z.string().nullable().optional(),
        skills_required: z.array(z.string()).optional(),
        location: z.string().nullable().optional(),
        difficulty: z.enum(['beginner', 'intermediate', 'expert']).nullable().optional(),
        verified: z.boolean().optional(),
        featured: z.boolean().optional(),
        deadline: z.string().nullable().optional(),
        status: z.enum(['open', 'closed']).optional()
      })
      .strict();

    const body = schema.parse(req.body);
    const updated = await clientService.updateGig(prisma, req.user, body);
    return res.json(clientService.serializeGig(updated));
  } catch (e) {
    return next(e);
  }
}

async function deleteGig(req, res, next) {
  try {
    const schema = z.object({ gig_id: z.string().uuid() });
    const { gig_id } = schema.parse(req.query);

    await clientService.deleteGig(prisma, req.user, gig_id);
    return res.json({ message: 'Gig Deleted Successfully' });
  } catch (e) {
    return next(e);
  }
}

async function allGigs(req, res, next) {
  try {
    const gigs = await clientService.listAllGigs(prisma);
    return res.json(gigs.map(clientService.serializeGig));
  } catch (e) {
    return next(e);
  }
}

async function getGig(req, res, next) {
  try {
    const schema = z.object({ gig_id: z.string().uuid() });
    const { gig_id } = schema.parse(req.query);

    const gig = await clientService.getGig(prisma, gig_id);
    return res.json(clientService.serializeGig(gig));
  } catch (e) {
    return next(e);
  }
}

async function userGigs(req, res, next) {
  try {
    const gigs = await clientService.listUserGigs(prisma, req.user.id);
    return res.json(gigs.map(clientService.serializeGig));
  } catch (e) {
    return next(e);
  }
}

async function viewGigApplications(req, res, next) {
  try {
    const schema = z.object({ gig_id: z.string().uuid() });
    const { gig_id } = schema.parse(req.query);

    const rows = await clientService.viewGigApplications(prisma, req.user, gig_id);
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
}

async function rejectApplication(req, res, next) {
  try {
    const schema = z.object({ application_id: z.number().int() });
    const { application_id } = schema.parse(req.body);

    await clientService.rejectApplication(prisma, req.user, application_id);
    return res.json({ message: 'Application successfully rejected' });
  } catch (e) {
    return next(e);
  }
}

async function acceptApplication(req, res, next) {
  try {
    const schema = z.object({ application_id: z.number().int() });
    const { application_id } = schema.parse(req.body);

    const payload = await clientService.acceptApplication(prisma, req.user, application_id);
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
}

async function closeGig(req, res, next) {
  try {
    const schema = z.object({ gig_id: z.string().uuid() });
    const { gig_id } = schema.parse(req.body);

    const payload = await clientService.closeGig(prisma, req.user, gig_id);
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
}

async function finishApplication(req, res, next) {
  try {
    const schema = z.object({ application_id: z.number().int() });
    const { application_id } = schema.parse(req.body);

    await clientService.finishApplication(prisma, req.user, application_id);
    return res.json({ message: 'Application finished' });
  } catch (e) {
    return next(e);
  }
}

async function feedback(req, res, next) {
  try {
    const schema = z.object({
      email: z.string().email(),
      message: z.string().min(1),
      name: z.string().min(1)
    });
    const body = schema.parse(req.body);

    await prisma.feedbackModel.create({ data: { email: body.email, message: body.message, name: body.name } });
    return res.status(201).json({ message: 'Feedback submitted' });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  createGig,
  updateGig,
  deleteGig,
  allGigs,
  getGig,
  userGigs,
  viewGigApplications,
  rejectApplication,
  acceptApplication,
  closeGig,
  finishApplication,
  feedback
};

