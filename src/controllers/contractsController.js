const { z } = require('zod');

const { prisma } = require('../prisma');
const { applyContractExpirySingle, expireStaleContractsForUser } = require('../utils/contractExpiry');

function mapDraftDataToContractUpdate(data) {
  if (!data || typeof data !== 'object') return {};
  const out = {};
  const pairs = [
    ['title', 'title'],
    ['description', 'description'],
    ['services_offered', 'servicesOffered'],
    ['start_date', 'startDate'],
    ['delivery_date', 'deliveryDate'],
    ['expiry_date', 'expiryDate'],
    ['total_amount', 'totalAmount'],
    ['currency', 'currency'],
    ['deliverables', 'deliverables'],
    ['acceptance_criteria', 'acceptanceCriteria'],
    ['communication_preferences', 'communicationPreferences'],
    ['intellectual_property_rights', 'intellectualPropertyRights'],
    ['confidentiality_terms', 'confidentialityTerms'],
    ['dispute_resolution', 'disputeResolution'],
    ['termination_clauses', 'terminationClauses']
  ];
  for (const [snake, key] of pairs) {
    const v = data[snake];
    if (v == null || v === '') continue;
    if (key === 'startDate' || key === 'deliveryDate' || key === 'expiryDate') {
      out[key] = new Date(v);
    } else if (key === 'totalAmount') {
      out[key] = String(v);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function milestonesFromDraft(draft) {
  const raw = draft.draftMilestones != null ? draft.draftMilestones : draft.draftData?.milestones;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((m) => ({
    title: String(m.title || ''),
    description: String(m.description ?? ''),
    amount: String(m.amount != null ? m.amount : 0),
    dueDate: new Date(m.due_date ?? m.dueDate),
    status: 'pending'
  }));
}

function isContractParty(contract, userId) {
  return contract.clientId === userId || contract.freelancerId === userId;
}

function serializeUser(user) {
  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    user_name: user.userName,
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

function serializeMilestone(m) {
  return {
    uuid: m.uuid,
    title: m.title,
    amount: String(m.amount),
    status: m.status,
    due_date: m.dueDate.toISOString().slice(0, 10)
  };
}

function computeFlags(contract, requesterId) {
  const isClient = contract.clientId === requesterId;
  const isFreelancer = contract.freelancerId === requesterId;

  const canAccept =
    (isClient && contract.status === 'pending_client_approval') ||
    (isFreelancer && contract.status === 'pending_freelancer_approval');

  const canReject = isContractParty(contract, requesterId) && contract.status.startsWith('pending_');
  const canComplete = isFreelancer && contract.status === 'active';

  return { can_accept: canAccept, can_reject: canReject, can_complete: canComplete };
}

function serializeContract(contract, requesterId) {
  const now = new Date();
  const daysRemaining = Math.ceil((contract.deliveryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const isOverdue = contract.deliveryDate < now && contract.status !== 'completed';

  const flags = computeFlags(contract, requesterId);

  return {
    uuid: contract.uuid,
    status: contract.status,
    client: contract.client ? serializeUser(contract.client) : undefined,
    freelancer: contract.freelancer ? serializeUser(contract.freelancer) : undefined,
    title: contract.title,
    total_amount: String(contract.totalAmount),
    currency: contract.currency,
    milestones: contract.milestones ? contract.milestones.map(serializeMilestone) : [],
    days_remaining: daysRemaining,
    is_overdue: isOverdue,
    ...flags
  };
}

async function list(req, res, next) {
  try {
    const schema = z.object({ status: z.string().optional() });
    const q = schema.parse(req.query);

    const where = {
      OR: [{ clientId: req.user.id }, { freelancerId: req.user.id }]
    };
    if (q.status) where.status = q.status;

    await expireStaleContractsForUser(prisma, req.user.id);

    const rows = await prisma.contract.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        client: { include: { profile: true } },
        freelancer: { include: { profile: true } },
        milestones: true
      }
    });
    return res.json(rows.map((c) => serializeContract(c, req.user.id)));
  } catch (e) {
    return next(e);
  }
}

async function create(req, res, next) {
  try {
    const schema = z.object({
      application_id: z.number().int().optional(),
      title: z.string(),
      description: z.string(),
      services_offered: z.string(),
      start_date: z.string(),
      delivery_date: z.string(),
      expiry_date: z.string(),
      total_amount: z.number(),
      currency: z.string().length(3).optional(),
      deliverables: z.string(),
      acceptance_criteria: z.string(),
      communication_preferences: z.string().optional().nullable(),
      intellectual_property_rights: z.string().optional().nullable(),
      confidentiality_terms: z.string().optional().nullable(),
      dispute_resolution: z.string().optional().nullable(),
      termination_clauses: z.string().optional().nullable(),
      milestones: z
        .array(
          z.object({
            title: z.string(),
            description: z.string(),
            amount: z.number(),
            due_date: z.string()
          })
        )
        .optional()
    });
    const body = schema.parse(req.body);

    let status = 'draft';
    let clientId = req.user.id;
    let freelancerId = req.user.id;
    let application = null;
    let gigId = null;

    if (body.application_id != null) {
      application = await prisma.applicationModel.findUnique({
        where: { id: body.application_id },
        include: { gig: true }
      });
      if (!application) return res.status(400).json({ error: 'Application not found' });
      if (application.freelancerId !== req.user.id) {
        return res.status(400).json({ error: 'Only the freelancer can create contracts for their applications' });
      }
      const existing = await prisma.contract.findFirst({ where: { applicationId: application.id } });
      if (existing) return res.status(400).json({ error: 'Contract already exists for this application' });

      status = 'pending_client_approval';
      clientId = application.gig.clientId;
      freelancerId = application.freelancerId;
      gigId = application.gigId;
    }

    const created = await prisma.contract.create({
      data: {
        applicationId: application ? application.id : null,
        gigId,
        clientId,
        freelancerId,
        title: body.title,
        description: body.description,
        servicesOffered: body.services_offered,
        startDate: new Date(body.start_date),
        deliveryDate: new Date(body.delivery_date),
        expiryDate: new Date(body.expiry_date),
        totalAmount: String(body.total_amount),
        currency: body.currency || 'USD',
        deliverables: body.deliverables,
        acceptanceCriteria: body.acceptance_criteria,
        communicationPreferences: body.communication_preferences ?? null,
        intellectualPropertyRights: body.intellectual_property_rights ?? null,
        confidentialityTerms: body.confidentiality_terms ?? null,
        disputeResolution: body.dispute_resolution ?? null,
        terminationClauses: body.termination_clauses ?? null,
        status,
        milestones: body.milestones
          ? {
              create: body.milestones.map((m) => ({
                title: m.title,
                description: m.description,
                amount: String(m.amount),
                dueDate: new Date(m.due_date),
                status: 'pending'
              }))
            }
          : undefined
      },
      include: {
        client: { include: { profile: true } },
        freelancer: { include: { profile: true } },
        milestones: true
      }
    });

    return res.status(201).json({
      message: 'Contract created successfully',
      contract: serializeContract(created, req.user.id)
    });
  } catch (e) {
    return next(e);
  }
}

async function stats(req, res, next) {
  try {
    await expireStaleContractsForUser(prisma, req.user.id);

    const rows = await prisma.contract.groupBy({
      by: ['status'],
      where: { OR: [{ clientId: req.user.id }, { freelancerId: req.user.id }] },
      _count: { _all: true }
    });
    return res.json({ by_status: rows.reduce((acc, r) => ({ ...acc, [r.status]: r._count._all }), {}) });
  } catch (e) {
    return next(e);
  }
}

async function availableApplications(req, res, next) {
  try {
    const rows = await prisma.applicationModel.findMany({
      where: { freelancerId: req.user.id, status: 'ACCEPTED', contract: null },
      include: { gig: true }
    });
    return res.json(
      rows.map((a) => ({
        application_id: a.id,
        gig: { uuid: a.gig.uuid, title: a.gig.title },
        created_at: a.createdAt.toISOString()
      }))
    );
  } catch (e) {
    return next(e);
  }
}

async function getByUuid(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);

    let contract = await prisma.contract.findUnique({
      where: { uuid },
      include: {
        client: { include: { profile: true } },
        freelancer: { include: { profile: true } },
        milestones: true
      }
    });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'You are not authorized to view this contract' });

    contract = await applyContractExpirySingle(prisma, contract);
    return res.json(serializeContract(contract, req.user.id));
  } catch (e) {
    return next(e);
  }
}

async function history(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'You are not authorized to view this contract' });

    contract = await applyContractExpirySingle(prisma, contract);

    const rows = await prisma.contractUpdateHistory.findMany({
      where: { contractId: contract.id },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
}

async function accept(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);

    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    contract = await applyContractExpirySingle(prisma, contract);
    if (contract.status === 'expired') {
      return res.status(400).json({ error: 'Contract has expired' });
    }

    if (req.user.id === contract.clientId) {
      if (contract.status !== 'pending_client_approval') {
        return res.status(400).json({ error: 'Contract is not pending client approval' });
      }
      await prisma.contract.update({ where: { id: contract.id }, data: { status: 'active', clientApprovedAt: new Date() } });
    } else {
      if (contract.status !== 'pending_freelancer_approval') {
        return res.status(400).json({ error: 'Contract is not pending freelancer approval' });
      }
      await prisma.contract.update({
        where: { id: contract.id },
        data: { status: 'active', freelancerApprovedAt: new Date() }
      });
    }

    return res.json({ message: 'Accepted' });
  } catch (e) {
    return next(e);
  }
}

async function reject(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);

    const bodySchema = z.object({ reason: z.string().min(1) });
    bodySchema.parse(req.body);

    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    contract = await applyContractExpirySingle(prisma, contract);

    await prisma.contract.update({ where: { id: contract.id }, data: { status: 'cancelled' } });
    return res.json({ message: 'Rejected' });
  } catch (e) {
    return next(e);
  }
}

async function complete(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);

    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    contract = await applyContractExpirySingle(prisma, contract);

    if (contract.status !== 'active') return res.status(400).json({ error: 'Contract must be active' });
    if (contract.freelancerId !== req.user.id) return res.status(400).json({ error: 'Only the freelancer can complete the contract' });

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contract.id },
        data: { status: 'completed', completedAt: new Date(), progressPercentage: 100 }
      });
      if (contract.applicationId) {
        await tx.applicationModel.update({ where: { id: contract.applicationId }, data: { status: 'FINISHED' } });
      }
    });

    return res.json({ message: 'Completed' });
  } catch (e) {
    return next(e);
  }
}

async function draftGet(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const draft = await prisma.contractUpdateHistory.findFirst({
      where: { contractId: contract.id, approvalStatus: 'pending', updateType: 'contract_draft_created' },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(draft || null);
  } catch (e) {
    return next(e);
  }
}

async function draftCreate(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const existingPending = await prisma.contractUpdateHistory.findFirst({
      where: { contractId: contract.id, approvalStatus: 'pending', updateType: 'contract_draft_created' }
    });
    if (existingPending) return res.status(400).json({ error: 'A draft is already pending' });

    const created = await prisma.contractUpdateHistory.create({
      data: {
        contractId: contract.id,
        updatedById: req.user.id,
        updateType: 'contract_draft_created',
        isUpdateRequest: true,
        approvalStatus: 'pending',
        draftData: req.body || {},
        draftMilestones: req.body?.milestones || null
      }
    });
    return res.status(201).json(created);
  } catch (e) {
    return next(e);
  }
}

async function draftApprove(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    contract = await applyContractExpirySingle(prisma, contract);

    const draft = await prisma.contractUpdateHistory.findFirst({
      where: {
        contractId: contract.id,
        approvalStatus: 'pending',
        updateType: 'contract_draft_created'
      },
      orderBy: { createdAt: 'desc' }
    });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.updatedById === req.user.id) return res.status(400).json({ error: 'Cannot approve your own draft' });

    const draftData = draft.draftData && typeof draft.draftData === 'object' ? draft.draftData : {};
    const contractUpdates = mapDraftDataToContractUpdate(draftData);
    const milestoneRows = milestonesFromDraft(draft);

    await prisma.$transaction(async (tx) => {
      await tx.contractUpdateHistory.update({
        where: { id: draft.id },
        data: { approvalStatus: 'approved', approvedAt: new Date(), approvedById: req.user.id }
      });

      if (Object.keys(contractUpdates).length > 0) {
        await tx.contract.update({ where: { id: contract.id }, data: contractUpdates });
      }

      if (milestoneRows) {
        await tx.contractMilestone.deleteMany({ where: { contractId: contract.id } });
        await tx.contractMilestone.createMany({
          data: milestoneRows.map((m) => ({ ...m, contractId: contract.id }))
        });
      }
    });

    const updated = await prisma.contract.findUnique({
      where: { id: contract.id },
      include: {
        client: { include: { profile: true } },
        freelancer: { include: { profile: true } },
        milestones: true
      }
    });

    return res.json({
      message: 'Approved',
      contract: serializeContract(updated, req.user.id)
    });
  } catch (e) {
    return next(e);
  }
}

async function draftReject(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const draft = await prisma.contractUpdateHistory.findFirst({
      where: { contractId: contract.id, approvalStatus: 'pending', updateType: 'contract_draft_created' },
      orderBy: { createdAt: 'desc' }
    });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.updatedById === req.user.id) return res.status(400).json({ error: 'Cannot reject your own draft' });

    await prisma.contractUpdateHistory.update({
      where: { id: draft.id },
      data: { approvalStatus: 'rejected', approvedAt: new Date(), approvedById: req.user.id }
    });
    return res.json({ message: 'Rejected' });
  } catch (e) {
    return next(e);
  }
}

async function draftCancel(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const draft = await prisma.contractUpdateHistory.findFirst({
      where: { contractId: contract.id, approvalStatus: 'pending', updateType: 'contract_draft_created' },
      orderBy: { createdAt: 'desc' }
    });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.updatedById !== req.user.id) return res.status(400).json({ error: 'Only the draft creator can cancel it' });

    await prisma.contractUpdateHistory.update({
      where: { id: draft.id },
      data: { approvalStatus: 'cancelled' }
    });
    return res.json({ message: 'Cancelled' });
  } catch (e) {
    return next(e);
  }
}

async function milestonesList(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const ms = await prisma.contractMilestone.findMany({ where: { contractId: contract.id }, orderBy: { dueDate: 'asc' } });
    return res.json(ms.map(serializeMilestone));
  } catch (e) {
    return next(e);
  }
}

async function milestonesCreate(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const bodySchema = z.object({
      title: z.string(),
      description: z.string(),
      amount: z.number(),
      due_date: z.string()
    });
    const body = bodySchema.parse(req.body);

    const created = await prisma.contractMilestone.create({
      data: {
        contractId: contract.id,
        title: body.title,
        description: body.description,
        amount: String(body.amount),
        dueDate: new Date(body.due_date),
        status: 'pending'
      }
    });
    return res.status(201).json(serializeMilestone(created));
  } catch (e) {
    return next(e);
  }
}

async function milestonesGet(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid(), milestone_uuid: z.string().uuid() });
    const { uuid, milestone_uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const ms = await prisma.contractMilestone.findFirst({ where: { contractId: contract.id, uuid: milestone_uuid } });
    if (!ms) return res.status(404).json({ error: 'Not found' });
    return res.json(ms);
  } catch (e) {
    return next(e);
  }
}

async function milestonesComplete(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid(), milestone_uuid: z.string().uuid() });
    const { uuid, milestone_uuid } = schema.parse(req.params);

    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    contract = await applyContractExpirySingle(prisma, contract);
    if (contract.status !== 'active') return res.status(400).json({ error: 'Contract must be active' });
    if (contract.freelancerId !== req.user.id) return res.status(403).json({ error: 'Only the freelancer can complete milestones' });

    const ms = await prisma.contractMilestone.findFirst({ where: { contractId: contract.id, uuid: milestone_uuid } });
    if (!ms) return res.status(404).json({ error: 'Not found' });
    if (!['pending', 'in_progress'].includes(ms.status)) {
      return res.status(400).json({ error: 'Milestone must be pending or in progress to mark complete' });
    }

    const updated = await prisma.contractMilestone.update({
      where: { id: ms.id },
      data: { status: 'completed', completedAt: new Date() }
    });
    return res.json(updated);
  } catch (e) {
    return next(e);
  }
}

async function milestonesApprove(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid(), milestone_uuid: z.string().uuid() });
    const { uuid, milestone_uuid } = schema.parse(req.params);

    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    contract = await applyContractExpirySingle(prisma, contract);
    if (contract.status !== 'active') return res.status(400).json({ error: 'Contract must be active' });
    if (contract.clientId !== req.user.id) return res.status(403).json({ error: 'Only the client can approve milestones' });

    const ms = await prisma.contractMilestone.findFirst({ where: { contractId: contract.id, uuid: milestone_uuid } });
    if (!ms) return res.status(404).json({ error: 'Not found' });
    if (ms.status !== 'completed') return res.status(400).json({ error: 'Milestone must be completed first' });

    const updated = await prisma.contractMilestone.update({
      where: { id: ms.id },
      data: { status: 'approved', approvedAt: new Date(), approvedById: req.user.id }
    });
    return res.json(updated);
  } catch (e) {
    return next(e);
  }
}

async function milestonesReject(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid(), milestone_uuid: z.string().uuid() });
    const { uuid, milestone_uuid } = schema.parse(req.params);

    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    contract = await applyContractExpirySingle(prisma, contract);
    if (contract.status !== 'active') return res.status(400).json({ error: 'Contract must be active' });
    if (contract.clientId !== req.user.id) return res.status(403).json({ error: 'Only the client can reject milestones' });

    const ms = await prisma.contractMilestone.findFirst({ where: { contractId: contract.id, uuid: milestone_uuid } });
    if (!ms) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.contractMilestone.update({
      where: { id: ms.id },
      data: { status: 'in_progress', completedAt: null }
    });
    return res.json(updated);
  } catch (e) {
    return next(e);
  }
}

async function disputesList(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const disputes = await prisma.contractDispute.findMany({ where: { contractId: contract.id }, orderBy: { createdAt: 'desc' } });
    return res.json(disputes);
  } catch (e) {
    return next(e);
  }
}

async function disputesCreate(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });
    contract = await applyContractExpirySingle(prisma, contract);
    if (contract.status !== 'active') return res.status(400).json({ error: 'Contract must be active' });

    const bodySchema = z.object({
      dispute_type: z.string(),
      title: z.string(),
      description: z.string(),
      evidence: z.string().optional().nullable()
    });
    const body = bodySchema.parse(req.body);

    const created = await prisma.contractDispute.create({
      data: {
        contractId: contract.id,
        raisedById: req.user.id,
        disputeType: body.dispute_type,
        title: body.title,
        description: body.description,
        evidence: body.evidence ?? null,
        status: 'open'
      }
    });
    return res.status(201).json(created);
  } catch (e) {
    return next(e);
  }
}

async function disputesGet(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid(), dispute_uuid: z.string().uuid() });
    const { uuid, dispute_uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const dispute = await prisma.contractDispute.findFirst({ where: { contractId: contract.id, uuid: dispute_uuid } });
    if (!dispute) return res.status(404).json({ error: 'Not found' });
    return res.json(dispute);
  } catch (e) {
    return next(e);
  }
}

async function disputesClose(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid(), dispute_uuid: z.string().uuid() });
    const { uuid, dispute_uuid } = schema.parse(req.params);
    const contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (!isContractParty(contract, req.user.id)) return res.status(403).json({ error: 'Not authorized' });

    const dispute = await prisma.contractDispute.findFirst({ where: { contractId: contract.id, uuid: dispute_uuid } });
    if (!dispute) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.contractDispute.update({
      where: { id: dispute.id },
      data: { status: 'closed', closedAt: new Date() }
    });
    return res.json(updated);
  } catch (e) {
    return next(e);
  }
}

async function requestProgressUpdate(req, res, next) {
  try {
    const schema = z.object({ uuid: z.string().uuid() });
    const { uuid } = schema.parse(req.params);
    const bodySchema = z.object({ request_message: z.string() });
    const body = bodySchema.parse(req.body);

    let contract = await prisma.contract.findUnique({ where: { uuid } });
    if (!contract) return res.status(404).json({ error: 'Not found' });
    if (contract.clientId !== req.user.id) return res.status(403).json({ error: 'Only the client can request progress updates' });
    contract = await applyContractExpirySingle(prisma, contract);
    if (contract.status !== 'active') return res.status(400).json({ error: 'Progress updates can only be requested for active contracts' });

    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const count = await prisma.contractUpdateHistory.count({
      where: { contractId: contract.id, updateType: 'progress_update_requested', createdAt: { gte: since } }
    });
    if (count >= 3) return res.status(429).json({ error: 'You can only request 3 progress updates per day per contract' });

    await prisma.contractUpdateHistory.create({
      data: {
        contractId: contract.id,
        updatedById: req.user.id,
        updateType: 'progress_update_requested',
        isUpdateRequest: true,
        requestedChanges: { request_message: body.request_message }
      }
    });

    return res.json({ message: 'Progress update requested' });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  list,
  create,
  stats,
  availableApplications,
  getByUuid,
  history,
  accept,
  reject,
  complete,
  draftGet,
  draftCreate,
  draftApprove,
  draftReject,
  draftCancel,
  milestonesList,
  milestonesCreate,
  milestonesGet,
  milestonesComplete,
  milestonesApprove,
  milestonesReject,
  disputesList,
  disputesCreate,
  disputesGet,
  disputesClose,
  requestProgressUpdate
};

