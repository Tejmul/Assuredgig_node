const express = require('express');
const { z } = require('zod');

const { prisma } = require('../prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serializeUser(user) {
  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    user_name: user.userName,
    verified: user.verified,
    profile: user.profile
      ? {
          bio: user.profile.bio || null,
          skills: user.profile.skills || [],
          hourly_rate: user.profile.hourlyRate ? String(user.profile.hourlyRate) : null,
          created_at: user.profile.createdAt.toISOString(),
          updated_at: user.profile.updatedAt.toISOString()
        }
      : null
  };
}

router.post('/apply-gig/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      gig_id: z.string().uuid(),
      description: z.string().optional().nullable()
    });
    const body = schema.parse(req.body);

    const gig = await prisma.clientPost.findUnique({ where: { uuid: body.gig_id } });
    if (!gig) return res.status(404).json({ error: 'Gig not found.' });

    if (gig.clientId === req.user.id) {
      return res.status(400).json({ error: 'You cannot apply to your own gig.' });
    }
    if (gig.status !== 'open') {
      return res.status(400).json({ error: 'This gig is not open for applications.' });
    }

    const existing = await prisma.applicationModel.findFirst({
      where: { gigId: gig.id, freelancerId: req.user.id }
    });
    if (existing) return res.status(400).json({ error: 'You have already applied to this gig.' });

    const application = await prisma.applicationModel.create({
      data: {
        gigId: gig.id,
        freelancerId: req.user.id,
        description: body.description ?? null
      },
      include: {
        freelancer: { include: { profile: true } }
      }
    });

    return res.json({
      message: 'Application submitted successfully.',
      application: {
        application_id: application.id,
        gig_id: gig.uuid,
        freelancer: serializeUser(application.freelancer),
        description: application.description,
        status: application.status,
        created_at: application.createdAt.toISOString(),
        gig: { uuid: gig.uuid, title: gig.title, status: gig.status },
        contract: null
      }
    });
  } catch (e) {
    return next(e);
  }
});

router.post('/cancel-appl/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ application_id: z.number().int() });
    const { application_id } = schema.parse(req.body);

    const appl = await prisma.applicationModel.findUnique({ where: { id: application_id } });
    if (!appl || appl.freelancerId !== req.user.id) return res.status(404).json({ error: 'Application not found.' });

    await prisma.applicationModel.update({ where: { id: appl.id }, data: { status: 'CANCELLED' } });
    return res.json({ message: 'Application cancelled successfully.' });
  } catch (e) {
    return next(e);
  }
});

router.get('/applied-gigs/', requireAuth, async (req, res, next) => {
  try {
    const rows = await prisma.applicationModel.findMany({
      where: { freelancerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { gig: true }
    });

    return res.json(
      rows.map((a) => ({
        application_id: a.id,
        uuid: a.uuid,
        gig_id: a.gig.uuid,
        description: a.description,
        status: a.status,
        created_at: a.createdAt.toISOString(),
        gig: { uuid: a.gig.uuid, title: a.gig.title, status: a.gig.status }
      }))
    );
  } catch (e) {
    return next(e);
  }
});

module.exports = { router };

