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
    phone_number: user.phoneNumber,
    verified: user.verified,
    date_joined: user.dateJoined.toISOString().slice(0, 10),
    profile: user.profile
      ? {
          profile_picture: user.profile.profilePicture || null,
          bio: user.profile.bio || null,
          skills: user.profile.skills || [],
          hourly_rate: user.profile.hourlyRate ? String(user.profile.hourlyRate) : null,
          created_at: user.profile.createdAt.toISOString(),
          updated_at: user.profile.updatedAt.toISOString()
        }
      : null
  };
}

function serializeGig(gig) {
  return {
    id: gig.id,
    uuid: gig.uuid,
    client: gig.client ? serializeUser(gig.client) : undefined,
    client_name: gig.clientName,
    title: gig.title,
    description: gig.description,
    category: gig.category,
    budget: String(gig.budget),
    project_type: gig.projectType,
    duration: gig.duration,
    skills_required: gig.skillsRequired || [],
    location: gig.location,
    difficulty: gig.difficulty,
    verified: gig.verified,
    featured: gig.featured,
    deadline: gig.deadline ? gig.deadline.toISOString().slice(0, 10) : null,
    status: gig.status,
    created_at: gig.createdAt.toISOString(),
    updated_at: gig.updatedAt.toISOString()
  };
}

router.post('/create-gig/', requireAuth, async (req, res, next) => {
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

    const gig = await prisma.clientPost.create({
      data: {
        clientId: req.user.id,
        clientName: body.client_name,
        title: body.title,
        description: body.description,
        category: body.category ?? null,
        budget: String(body.budget),
        projectType: body.project_type,
        duration: body.duration ?? null,
        skillsRequired: body.skills_required ?? [],
        location: body.location ?? null,
        difficulty: body.difficulty ?? null,
        verified: body.verified ?? false,
        featured: body.featured ?? false,
        deadline: body.deadline ? new Date(body.deadline) : null,
        status: body.status ?? 'open'
      },
      include: { client: { include: { profile: true } } }
    });

    return res.status(201).json({
      message: 'Gig created successfully',
      gig: serializeGig(gig)
    });
  } catch (e) {
    return next(e);
  }
});

router.post('/update-gig/', requireAuth, async (req, res, next) => {
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
    const gig = await prisma.clientPost.findUnique({ where: { uuid: body.gig_id } });
    if (!gig || gig.clientId !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to update this gig.' });
    }

    const updated = await prisma.clientPost.update({
      where: { id: gig.id },
      data: {
        clientName: body.client_name ?? undefined,
        title: body.title ?? undefined,
        description: body.description ?? undefined,
        category: body.category ?? undefined,
        budget: body.budget != null ? String(body.budget) : undefined,
        projectType: body.project_type ?? undefined,
        duration: body.duration ?? undefined,
        skillsRequired: body.skills_required ?? undefined,
        location: body.location ?? undefined,
        difficulty: body.difficulty ?? undefined,
        verified: body.verified ?? undefined,
        featured: body.featured ?? undefined,
        deadline: body.deadline != null ? (body.deadline ? new Date(body.deadline) : null) : undefined,
        status: body.status ?? undefined
      },
      include: { client: { include: { profile: true } } }
    });

    return res.json(serializeGig(updated));
  } catch (e) {
    return next(e);
  }
});

router.delete('/delete-gig/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ gig_id: z.string().uuid() });
    const { gig_id } = schema.parse(req.query);

    const gig = await prisma.clientPost.findUnique({ where: { uuid: gig_id } });
    if (!gig || gig.clientId !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to delete this gig' });
    }

    await prisma.clientPost.delete({ where: { id: gig.id } });
    return res.json({ message: 'Gig Deleted Successfully' });
  } catch (e) {
    return next(e);
  }
});

router.get('/get-all-gigs/', async (req, res, next) => {
  try {
    const gigs = await prisma.clientPost.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: { include: { profile: true } } }
    });
    return res.json(gigs.map(serializeGig));
  } catch (e) {
    return next(e);
  }
});

router.get('/get-a-gig/', async (req, res, next) => {
  try {
    const schema = z.object({ gig_id: z.string().uuid() });
    const { gig_id } = schema.parse(req.query);

    const gig = await prisma.clientPost.findUnique({
      where: { uuid: gig_id },
      include: { client: { include: { profile: true } } }
    });
    if (!gig) return res.status(404).json({ error: 'Gig not found.' });

    return res.json(serializeGig(gig));
  } catch (e) {
    return next(e);
  }
});

router.get('/get-user-gigs/', requireAuth, async (req, res, next) => {
  try {
    const gigs = await prisma.clientPost.findMany({
      where: { clientId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { client: { include: { profile: true } } }
    });
    return res.json(gigs.map(serializeGig));
  } catch (e) {
    return next(e);
  }
});

router.get('/view-gig-appl/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ gig_id: z.string().uuid() });
    const { gig_id } = schema.parse(req.query);

    const gig = await prisma.clientPost.findUnique({ where: { uuid: gig_id } });
    if (!gig || gig.clientId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const applications = await prisma.applicationModel.findMany({
      where: { gigId: gig.id },
      orderBy: { createdAt: 'desc' },
      include: { freelancer: { include: { profile: true } }, gig: true, contract: true }
    });

    return res.json(
      applications.map((a) => ({
        application_id: a.id,
        uuid: a.uuid,
        gig_id: gig.uuid,
        freelancer: serializeUser(a.freelancer),
        description: a.description,
        status: a.status,
        created_at: a.createdAt.toISOString(),
        gig: { uuid: gig.uuid, title: gig.title, status: gig.status },
        contract: a.contract ? { uuid: a.contract.uuid } : null
      }))
    );
  } catch (e) {
    return next(e);
  }
});

router.post('/reject-appl/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ application_id: z.number().int() });
    const { application_id } = schema.parse(req.body);

    const appl = await prisma.applicationModel.findUnique({ where: { id: application_id }, include: { gig: true } });
    if (!appl || appl.gig.clientId !== req.user.id) return res.status(404).json({ error: 'Application not found.' });

    if (appl.status !== 'PENDING') {
      return res.status(400).json({ message: 'Application must be in PENDING status to be rejected' });
    }

    await prisma.applicationModel.update({ where: { id: appl.id }, data: { status: 'REJECTED' } });
    return res.json({ message: 'Application successfully rejected' });
  } catch (e) {
    return next(e);
  }
});

router.post('/accept-appl/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ application_id: z.number().int() });
    const { application_id } = schema.parse(req.body);

    const appl = await prisma.applicationModel.findUnique({
      where: { id: application_id },
      include: { gig: true, freelancer: { include: { profile: true } }, contract: true }
    });
    if (!appl || appl.gig.clientId !== req.user.id) return res.status(404).json({ error: 'Application not found.' });

    if (appl.status !== 'PENDING') {
      return res.status(400).json({ message: 'Application must be in PENDING status to be accepted' });
    }

    await prisma.$transaction(async (tx) => {
      // accept chosen
      await tx.applicationModel.update({ where: { id: appl.id }, data: { status: 'ACCEPTED' } });
      // reject others
      await tx.applicationModel.updateMany({
        where: { gigId: appl.gigId, id: { not: appl.id }, status: 'PENDING' },
        data: { status: 'REJECTED' }
      });
      // close gig
      await tx.clientPost.update({ where: { id: appl.gigId }, data: { status: 'closed' } });
    });

    const refreshed = await prisma.applicationModel.findUnique({
      where: { id: appl.id },
      include: { gig: true, freelancer: { include: { profile: true } }, contract: true }
    });

    return res.json({
      message: 'Application Accepted',
      your_freelancer: {
        application_id: refreshed.id,
        gig: { uuid: refreshed.gig.uuid, title: refreshed.gig.title, status: refreshed.gig.status },
        freelancer: serializeUser(refreshed.freelancer),
        description: refreshed.description,
        status: refreshed.status,
        created_at: refreshed.createdAt.toISOString(),
        contract: refreshed.contract ? { uuid: refreshed.contract.uuid } : null
      }
    });
  } catch (e) {
    return next(e);
  }
});

router.patch('/close-gig/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ gig_id: z.string().uuid() });
    const { gig_id } = schema.parse(req.body);

    const gig = await prisma.clientPost.findUnique({ where: { uuid: gig_id } });
    if (!gig || gig.clientId !== req.user.id) {
      return res.status(404).json({ error: 'Gig not found or you are not authorized to close it' });
    }

    const updated = await prisma.clientPost.update({ where: { id: gig.id }, data: { status: 'closed' } });
    return res.json({ message: 'Gig closed', gig: serializeGig({ ...updated, client: req.user }) });
  } catch (e) {
    return next(e);
  }
});

router.patch('/finish-gig-appl/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ application_id: z.number().int() });
    const { application_id } = schema.parse(req.body);

    const appl = await prisma.applicationModel.findUnique({ where: { id: application_id }, include: { gig: true } });
    if (!appl || appl.gig.clientId !== req.user.id) return res.status(404).json({ error: 'Application not found.' });

    if (appl.status !== 'ACCEPTED') {
      return res.status(400).json({ message: 'Application must be accepted before it can be finished' });
    }

    await prisma.applicationModel.update({ where: { id: appl.id }, data: { status: 'FINISHED' } });
    return res.json({ message: 'Application finished' });
  } catch (e) {
    return next(e);
  }
});

router.post('/feedback/', async (req, res, next) => {
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
});

module.exports = { router };

