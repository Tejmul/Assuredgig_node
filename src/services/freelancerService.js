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

async function applyGig(prisma, user, body) {
  const gig = await prisma.clientPost.findUnique({ where: { uuid: body.gig_id } });
  if (!gig) {
    const err = new Error('Gig not found.');
    err.status = 404;
    throw err;
  }

  if (gig.clientId === user.id) {
    const err = new Error('You cannot apply to your own gig.');
    err.status = 400;
    throw err;
  }
  if (gig.status !== 'open') {
    const err = new Error('This gig is not open for applications.');
    err.status = 400;
    throw err;
  }

  const existing = await prisma.applicationModel.findFirst({
    where: { gigId: gig.id, freelancerId: user.id }
  });
  if (existing) {
    const err = new Error('You have already applied to this gig.');
    err.status = 400;
    throw err;
  }

  const application = await prisma.applicationModel.create({
    data: {
      gigId: gig.id,
      freelancerId: user.id,
      description: body.description ?? null
    },
    include: {
      freelancer: { include: { profile: true } }
    }
  });

  return {
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
  };
}

async function cancelApplication(prisma, user, applicationId) {
  const appl = await prisma.applicationModel.findUnique({ where: { id: applicationId } });
  if (!appl || appl.freelancerId !== user.id) {
    const err = new Error('Application not found.');
    err.status = 404;
    throw err;
  }

  await prisma.applicationModel.update({ where: { id: appl.id }, data: { status: 'CANCELLED' } });
}

async function listAppliedGigs(prisma, userId) {
  const rows = await prisma.applicationModel.findMany({
    where: { freelancerId: userId },
    orderBy: { createdAt: 'desc' },
    include: { gig: true }
  });

  return rows.map((a) => ({
    application_id: a.id,
    uuid: a.uuid,
    gig_id: a.gig.uuid,
    description: a.description,
    status: a.status,
    created_at: a.createdAt.toISOString(),
    gig: { uuid: a.gig.uuid, title: a.gig.title, status: a.gig.status }
  }));
}

module.exports = { applyGig, cancelApplication, listAppliedGigs };

