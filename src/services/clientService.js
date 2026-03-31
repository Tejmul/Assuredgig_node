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

async function createGig(prisma, user, body) {
  return prisma.clientPost.create({
    data: {
      clientId: user.id,
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
}

async function updateGig(prisma, user, body) {
  const gig = await prisma.clientPost.findUnique({ where: { uuid: body.gig_id } });
  if (!gig || gig.clientId !== user.id) {
    const err = new Error('You are not authorized to update this gig.');
    err.status = 403;
    throw err;
  }

  return prisma.clientPost.update({
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
}

async function deleteGig(prisma, user, gigUuid) {
  const gig = await prisma.clientPost.findUnique({ where: { uuid: gigUuid } });
  if (!gig || gig.clientId !== user.id) {
    const err = new Error('You are not authorized to delete this gig');
    err.status = 403;
    throw err;
  }
  await prisma.clientPost.delete({ where: { id: gig.id } });
}

async function listAllGigs(prisma) {
  return prisma.clientPost.findMany({
    orderBy: { createdAt: 'desc' },
    include: { client: { include: { profile: true } } }
  });
}

async function getGig(prisma, gigUuid) {
  const gig = await prisma.clientPost.findUnique({
    where: { uuid: gigUuid },
    include: { client: { include: { profile: true } } }
  });
  if (!gig) {
    const err = new Error('Gig not found.');
    err.status = 404;
    throw err;
  }
  return gig;
}

async function listUserGigs(prisma, userId) {
  return prisma.clientPost.findMany({
    where: { clientId: userId },
    orderBy: { createdAt: 'desc' },
    include: { client: { include: { profile: true } } }
  });
}

async function viewGigApplications(prisma, user, gigUuid) {
  const gig = await prisma.clientPost.findUnique({ where: { uuid: gigUuid } });
  if (!gig || gig.clientId !== user.id) {
    const err = new Error('Not authorized');
    err.status = 403;
    throw err;
  }

  const applications = await prisma.applicationModel.findMany({
    where: { gigId: gig.id },
    orderBy: { createdAt: 'desc' },
    include: { freelancer: { include: { profile: true } }, gig: true, contract: true }
  });

  return applications.map((a) => ({
    application_id: a.id,
    uuid: a.uuid,
    gig_id: gig.uuid,
    freelancer: serializeUser(a.freelancer),
    description: a.description,
    status: a.status,
    created_at: a.createdAt.toISOString(),
    gig: { uuid: gig.uuid, title: gig.title, status: gig.status },
    contract: a.contract ? { uuid: a.contract.uuid } : null
  }));
}

async function rejectApplication(prisma, user, applicationId) {
  const appl = await prisma.applicationModel.findUnique({ where: { id: applicationId }, include: { gig: true } });
  if (!appl || appl.gig.clientId !== user.id) {
    const err = new Error('Application not found.');
    err.status = 404;
    throw err;
  }

  if (appl.status !== 'PENDING') {
    const err = new Error('Application must be in PENDING status to be rejected');
    err.status = 400;
    throw err;
  }

  await prisma.applicationModel.update({ where: { id: appl.id }, data: { status: 'REJECTED' } });
}

async function acceptApplication(prisma, user, applicationId) {
  const appl = await prisma.applicationModel.findUnique({
    where: { id: applicationId },
    include: { gig: true, freelancer: { include: { profile: true } }, contract: true }
  });
  if (!appl || appl.gig.clientId !== user.id) {
    const err = new Error('Application not found.');
    err.status = 404;
    throw err;
  }

  if (appl.status !== 'PENDING') {
    const err = new Error('Application must be in PENDING status to be accepted');
    err.status = 400;
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    await tx.applicationModel.update({ where: { id: appl.id }, data: { status: 'ACCEPTED' } });
    await tx.applicationModel.updateMany({
      where: { gigId: appl.gigId, id: { not: appl.id }, status: 'PENDING' },
      data: { status: 'REJECTED' }
    });
    await tx.clientPost.update({ where: { id: appl.gigId }, data: { status: 'closed' } });
  });

  const refreshed = await prisma.applicationModel.findUnique({
    where: { id: appl.id },
    include: { gig: true, freelancer: { include: { profile: true } }, contract: true }
  });

  return {
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
  };
}

async function closeGig(prisma, user, gigUuid) {
  const gig = await prisma.clientPost.findUnique({ where: { uuid: gigUuid } });
  if (!gig || gig.clientId !== user.id) {
    const err = new Error('Gig not found or you are not authorized to close it');
    err.status = 404;
    throw err;
  }

  const updated = await prisma.clientPost.update({ where: { id: gig.id }, data: { status: 'closed' } });
  return { message: 'Gig closed', gig: serializeGig({ ...updated, client: user }) };
}

async function finishApplication(prisma, user, applicationId) {
  const appl = await prisma.applicationModel.findUnique({ where: { id: applicationId }, include: { gig: true } });
  if (!appl || appl.gig.clientId !== user.id) {
    const err = new Error('Application not found.');
    err.status = 404;
    throw err;
  }

  if (appl.status !== 'ACCEPTED') {
    const err = new Error('Application must be accepted before it can be finished');
    err.status = 400;
    throw err;
  }

  await prisma.applicationModel.update({ where: { id: appl.id }, data: { status: 'FINISHED' } });
}

module.exports = {
  serializeGig,
  createGig,
  updateGig,
  deleteGig,
  listAllGigs,
  getGig,
  listUserGigs,
  viewGigApplications,
  rejectApplication,
  acceptApplication,
  closeGig,
  finishApplication
};

