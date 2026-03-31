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

async function list(prisma, q) {
  const where = {};
  if (q.location) where.location = { contains: q.location, mode: 'insensitive' };
  if (q.search) {
    where.OR = [
      { title: { contains: q.search, mode: 'insensitive' } },
      { user: { userName: { contains: q.search, mode: 'insensitive' } } }
    ];
  }

  return prisma.portfolioProfile.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { user: true }
  });
}

async function createOrUpdate(prisma, userId, body) {
  return prisma.portfolioProfile.upsert({
    where: { userId },
    create: {
      userId,
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
}

async function getByUserId(prisma, userId) {
  const row = await prisma.portfolioProfile.findUnique({ where: { userId } });
  if (!row) {
    const err = new Error('Portfolio not found');
    err.status = 404;
    throw err;
  }
  return row;
}

async function update(prisma, userId, body) {
  return prisma.portfolioProfile.update({
    where: { userId },
    data: {
      title: body.title ?? undefined,
      location: body.location ?? undefined,
      links: body.links ?? undefined,
      isOnline: body.is_online ?? undefined
    }
  });
}

async function getById(prisma, id) {
  const row = await prisma.portfolioProfile.findUnique({ where: { id } });
  if (!row) {
    const err = new Error('Portfolio not found');
    err.status = 404;
    throw err;
  }
  return row;
}

async function listReviews(prisma, freelancerId) {
  const reviews = await prisma.userReview.findMany({
    where: { freelancerId },
    orderBy: { createdAt: 'desc' }
  });

  return reviews.map((r) => ({
    uuid: r.uuid,
    rating: r.rating,
    comment: r.comment,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString()
  }));
}

async function upsertReview(prisma, { freelancerId, clientId, rating, comment }) {
  const created = await prisma.userReview.upsert({
    where: { freelancerId_clientId: { freelancerId, clientId } },
    create: { freelancerId, clientId, rating, comment },
    update: { rating, comment }
  });

  return {
    uuid: created.uuid,
    rating: created.rating,
    comment: created.comment,
    created_at: created.createdAt.toISOString(),
    updated_at: created.updatedAt.toISOString()
  };
}

module.exports = {
  serializePortfolio,
  list,
  createOrUpdate,
  getByUserId,
  update,
  getById,
  listReviews,
  upsertReview
};

