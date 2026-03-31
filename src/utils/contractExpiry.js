const PRE_EXPIRY_STATUSES = new Set(['draft', 'pending_client_approval', 'pending_freelancer_approval']);

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Marks eligible contracts as expired (expiry date before today) and updates in-memory rows.
 * Mirrors Django-style "on access" expiry for pre-active statuses.
 */
async function applyContractExpiryInPlace(prisma, contracts) {
  if (!contracts || contracts.length === 0) return contracts;
  const today = startOfDay(new Date());
  const ids = [];
  for (const c of contracts) {
    if (PRE_EXPIRY_STATUSES.has(c.status) && startOfDay(c.expiryDate) < today) {
      ids.push(c.id);
    }
  }
  if (ids.length === 0) return contracts;

  await prisma.contract.updateMany({
    where: { id: { in: ids } },
    data: { status: 'expired' }
  });

  const expired = new Set(ids);
  return contracts.map((c) => (expired.has(c.id) ? { ...c, status: 'expired' } : c));
}

async function applyContractExpirySingle(prisma, contract) {
  if (!contract) return contract;
  const [out] = await applyContractExpiryInPlace(prisma, [contract]);
  return out;
}

/** Persists expiry for all stale contracts involving this user (for stats and consistency). */
async function expireStaleContractsForUser(prisma, userId) {
  const rows = await prisma.contract.findMany({
    where: {
      OR: [{ clientId: userId }, { freelancerId: userId }],
      status: { in: Array.from(PRE_EXPIRY_STATUSES) }
    },
    select: { id: true, expiryDate: true }
  });
  const today = startOfDay(new Date());
  const ids = rows.filter((r) => startOfDay(r.expiryDate) < today).map((r) => r.id);
  if (ids.length === 0) return;
  await prisma.contract.updateMany({
    where: { id: { in: ids } },
    data: { status: 'expired' }
  });
}

module.exports = {
  applyContractExpiryInPlace,
  applyContractExpirySingle,
  expireStaleContractsForUser,
  PRE_EXPIRY_STATUSES
};
