/* eslint-disable no-console */
const http = require('http');
const { randomUUID } = require('crypto');

require('dotenv').config();

const { createApp } = require('../../src/app');
const { prisma } = require('../../src/prisma');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildUrl(base, path, query) {
  const u = new URL(path, base);
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v == null) continue;
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function request(base, { method, path, token, query, body }) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(buildUrl(base, path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json };
}

function expectOk(name, got, { allowStatuses = [200, 201, 204] } = {}) {
  if (!allowStatuses.includes(got.status)) {
    const msg = `[FAIL] ${name}: expected ${allowStatuses.join('/')} got ${got.status}\n${JSON.stringify(got.json, null, 2)}`;
    throw new Error(msg);
  }
}

function expectNot500(name, got) {
  if (got.status >= 500) {
    const msg = `[FAIL] ${name}: server error ${got.status}\n${JSON.stringify(got.json, null, 2)}`;
    throw new Error(msg);
  }
}

async function latestOtpForEmail(email) {
  const user = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
  if (!user) throw new Error(`No user for OTP lookup: ${email}`);
  const row = await prisma.passwordResetOTP.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  });
  if (!row) throw new Error(`No OTP row for ${email}`);
  return row.otp;
}

async function run() {
  const app = await createApp();
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });

  const addr = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const results = [];
  async function step(name, fn) {
    const started = Date.now();
    try {
      const out = await fn();
      results.push({ name, ok: true, ms: Date.now() - started });
      return out;
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - started, error: e?.message || String(e) });
      throw e;
    }
  }

  const suffix = randomUUID().slice(0, 8);
  const clientEmail = `e2e-client-${suffix}@example.com`;
  const freelancerEmail = `e2e-freelancer-${suffix}@example.com`;
  const freelancer2Email = `e2e-freelancer2-${suffix}@example.com`;
  const password = `Passw0rd!${suffix}`;
  const contractDates = {
    start_date: '2030-01-01',
    delivery_date: '2030-12-31',
    expiry_date: '2030-12-15'
  };

  try {
    // ── Health ──────────────────────────────────────────────────────────────
    await step('GET /health/', async () => {
      const r = await request(base, { method: 'GET', path: '/health/' });
      expectOk('health', r, { allowStatuses: [200] });
      return r;
    });

    // ── Users ───────────────────────────────────────────────────────────────
    const client = await step('POST /users/register/ (client)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/users/register/',
        body: { email: clientEmail, password, password2: password, user_name: `client-${suffix}` }
      });
      expectOk('users.register (client)', r, { allowStatuses: [201] });
      return r.json;
    });

    const freelancer = await step('POST /users/register/ (freelancer)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/users/register/',
        body: { email: freelancerEmail, password, password2: password, user_name: `freelancer-${suffix}` }
      });
      expectOk('users.register (freelancer)', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('POST /users/register/ (freelancer2)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/users/register/',
        body: { email: freelancer2Email, password, password2: password, user_name: `freel2-${suffix}` }
      });
      expectOk('users.register (freelancer2)', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('POST /users/login/', async () => {
      const r = await request(base, { method: 'POST', path: '/api/v1/users/login/', body: { email: clientEmail, password } });
      expectOk('users.login', r, { allowStatuses: [200] });
      return r.json;
    });

    const refreshed = await step('POST /users/token/refresh/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/users/token/refresh/',
        body: { refresh: client.refresh }
      });
      expectOk('users.token.refresh', r, { allowStatuses: [200] });
      if (!r.json.access) throw new Error('expected access token');
      return r.json;
    });
    client.access = refreshed.access;

    await step('GET /users/profile/ (401 without token)', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/users/profile/' });
      if (r.status !== 401) throw new Error(`expected 401 got ${r.status}`);
      return r;
    });

    await step('GET /users/profile/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/users/profile/', token: client.access });
      expectOk('users.profile', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('PUT /users/profile/', async () => {
      const r = await request(base, {
        method: 'PUT',
        path: '/api/v1/users/profile/',
        token: client.access,
        body: { phone_number: `555${suffix}`.slice(0, 9), profile: { bio: 'e2e bio', skills: ['node'], hourly_rate: 25 } }
      });
      expectOk('users.updateProfile', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /users/forgot-password/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/users/forgot-password/',
        body: { email: clientEmail }
      });
      expectOk('users.forgotPassword', r, { allowStatuses: [200] });
      return r.json;
    });

    const otp = await step('POST /users/forgot-password/verify-otp/', async () => {
      const code = await latestOtpForEmail(clientEmail);
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/users/forgot-password/verify-otp/',
        body: { email: clientEmail, otp: code }
      });
      expectOk('users.verifyOtp', r, { allowStatuses: [200] });
      return code;
    });

    await step('POST /users/forgot-password/reset-password/', async () => {
      const newPassword = `NewPass0!${suffix}`;
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/users/forgot-password/reset-password/',
        body: { email: clientEmail, new_password: newPassword }
      });
      expectOk('users.resetPassword', r, { allowStatuses: [200] });
      const login = await request(base, {
        method: 'POST',
        path: '/api/v1/users/login/',
        body: { email: clientEmail, password: newPassword }
      });
      expectOk('users.login after reset', login, { allowStatuses: [200] });
      client.access = login.json.access;
      client.refresh = login.json.refresh;
      return r.json;
    });

    // ── Portfolio ───────────────────────────────────────────────────────────
    const portfolio = await step('POST /portfolio/create/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/portfolio/create/',
        token: freelancer.access,
        body: { title: 'E2E Portfolio', location: 'Remote', links: 'https://example.com' }
      });
      expectOk('portfolio.create', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('GET /portfolio/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/portfolio/' });
      expectOk('portfolio.list', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /portfolio/my/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/portfolio/my/', token: freelancer.access });
      expectOk('portfolio.my', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('PUT /portfolio/update/', async () => {
      const r = await request(base, {
        method: 'PUT',
        path: '/api/v1/portfolio/update/',
        token: freelancer.access,
        body: { title: 'Updated Portfolio', location: 'NYC', is_online: true }
      });
      expectOk('portfolio.update', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /portfolio/:id/', async () => {
      const r = await request(base, { method: 'GET', path: `/api/v1/portfolio/${portfolio.id}/` });
      expectOk('portfolio.getById', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /portfolio/:user_id/reviews/', async () => {
      const r = await request(base, { method: 'GET', path: `/api/v1/portfolio/${freelancer.user.id}/reviews/` });
      expectOk('portfolio.listReviews', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /portfolio/:user_id/reviews/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/portfolio/${freelancer.user.id}/reviews/`,
        token: client.access,
        body: { rating: 5, comment: 'Great work in e2e' }
      });
      expectOk('portfolio.upsertReview', r, { allowStatuses: [201] });
      return r.json;
    });

    // ── Client gigs (main flow) ─────────────────────────────────────────────
    const gig = await step('POST /client/create-gig/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/create-gig/',
        token: client.access,
        body: {
          client_name: 'E2E Client',
          title: 'E2E Gig',
          description: 'Build something',
          budget: 100,
          project_type: 'fixed',
          skills_required: ['node']
        }
      });
      expectOk('client.createGig', r, { allowStatuses: [201] });
      return r.json.gig;
    });

    await step('POST /client/update-gig/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/update-gig/',
        token: client.access,
        body: { gig_id: gig.uuid, title: 'E2E Gig Updated', budget: 150 }
      });
      expectOk('client.updateGig', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /client/get-all-gigs/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/client/get-all-gigs/' });
      expectOk('client.getAllGigs', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /client/get-a-gig/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/client/get-a-gig/', query: { gig_id: gig.uuid } });
      expectOk('client.getGig', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /client/get-user-gigs/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/client/get-user-gigs/', token: client.access });
      expectOk('client.getUserGigs', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /freelancer/apply-gig/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/freelancer/apply-gig/',
        token: freelancer.access,
        body: { gig_id: gig.uuid, description: 'I can do it' }
      });
      expectOk('freelancer.applyGig', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /freelancer/applied-gigs/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/freelancer/applied-gigs/', token: freelancer.access });
      expectOk('freelancer.appliedGigs', r, { allowStatuses: [200] });
      return r.json;
    });

    const applications = await step('GET /client/view-gig-appl/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: '/api/v1/client/view-gig-appl/',
        token: client.access,
        query: { gig_id: gig.uuid }
      });
      expectOk('client.viewGigApplications', r, { allowStatuses: [200] });
      if (!Array.isArray(r.json) || r.json.length === 0) throw new Error('expected at least one application');
      return r.json;
    });

    const applicationId = applications[0].application_id;

    await step('POST /client/accept-appl/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/accept-appl/',
        token: client.access,
        body: { application_id: applicationId }
      });
      expectOk('client.acceptApplication', r, { allowStatuses: [200] });
      return r.json;
    });

    // ── Secondary gig: reject + cancel flows ────────────────────────────────
    const rejectGig = await step('POST /client/create-gig/ (reject flow)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/create-gig/',
        token: client.access,
        body: {
          client_name: 'E2E Client',
          title: 'Reject Gig',
          description: 'For reject flow',
          budget: 50,
          project_type: 'fixed'
        }
      });
      expectOk('client.createGig reject', r, { allowStatuses: [201] });
      return r.json.gig;
    });

    await step('POST /freelancer/apply-gig/ (reject flow)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/freelancer/apply-gig/',
        token: freelancer.access,
        body: { gig_id: rejectGig.uuid, description: 'apply to reject' }
      });
      expectOk('freelancer.applyGig reject', r, { allowStatuses: [200] });
      return r.json;
    });

    const rejectApps = await step('GET /client/view-gig-appl/ (reject flow)', async () => {
      const r = await request(base, {
        method: 'GET',
        path: '/api/v1/client/view-gig-appl/',
        token: client.access,
        query: { gig_id: rejectGig.uuid }
      });
      expectOk('client.viewGigApplications reject', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /client/reject-appl/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/reject-appl/',
        token: client.access,
        body: { application_id: rejectApps[0].application_id }
      });
      expectOk('client.rejectApplication', r, { allowStatuses: [200] });
      return r.json;
    });

    const cancelGig = await step('POST /client/create-gig/ (cancel flow)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/create-gig/',
        token: client.access,
        body: {
          client_name: 'E2E Client',
          title: 'Cancel Gig',
          description: 'For cancel flow',
          budget: 50,
          project_type: 'fixed'
        }
      });
      expectOk('client.createGig cancel', r, { allowStatuses: [201] });
      return r.json.gig;
    });

    const cancelApply = await step('POST /freelancer/apply-gig/ (cancel flow)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/freelancer/apply-gig/',
        token: freelancer.access,
        body: { gig_id: cancelGig.uuid, description: 'apply to cancel' }
      });
      expectOk('freelancer.applyGig cancel', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /freelancer/cancel-appl/', async () => {
      const cancelApps = await request(base, {
        method: 'GET',
        path: '/api/v1/client/view-gig-appl/',
        token: client.access,
        query: { gig_id: cancelGig.uuid }
      });
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/freelancer/cancel-appl/',
        token: freelancer.access,
        body: { application_id: cancelApps.json[0].application_id }
      });
      expectOk('freelancer.cancelApplication', r, { allowStatuses: [200] });
      return r.json;
    });

    // ── Contracts (main flow) ─────────────────────────────────────────────────
    const contract = await step('POST /contracts/create/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/contracts/create/',
        token: freelancer.access,
        body: {
          application_id: applicationId,
          title: 'E2E Contract',
          description: 'Do the work',
          services_offered: 'Dev',
          ...contractDates,
          total_amount: 100,
          currency: 'USD',
          deliverables: 'Code',
          acceptance_criteria: 'Tests pass',
          milestones: [{ title: 'M1', description: 'First', amount: 50, due_date: '2030-06-01' }]
        }
      });
      expectOk('contracts.create', r, { allowStatuses: [201] });
      return r.json.contract;
    });

    await step('GET /contracts/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/contracts/', token: client.access });
      expectOk('contracts.list', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /contracts/stats/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/contracts/stats/', token: client.access });
      expectNot500('contracts.stats', r);
      return r.json;
    });

    await step('GET /contracts/available-applications/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: '/api/v1/contracts/available-applications/',
        token: freelancer.access
      });
      expectNot500('contracts.availableApplications', r);
      return r.json;
    });

    await step('GET /contracts/:uuid/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: `/api/v1/contracts/${contract.uuid}/`,
        token: client.access
      });
      expectOk('contracts.getByUuid', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /contracts/:uuid/history/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: `/api/v1/contracts/${contract.uuid}/history/`,
        token: client.access
      });
      expectNot500('contracts.history', r);
      return r.json;
    });

    await step('POST /contracts/:uuid/accept/ (client)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/accept/`,
        token: client.access
      });
      expectOk('contracts.accept', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /contracts/:uuid/milestones/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: `/api/v1/contracts/${contract.uuid}/milestones/`,
        token: client.access
      });
      expectOk('contracts.milestonesList', r, { allowStatuses: [200] });
      if (!Array.isArray(r.json) || r.json.length === 0) throw new Error('expected milestones');
      return r.json;
    });

    const milestoneUuid = (await request(base, {
      method: 'GET',
      path: `/api/v1/contracts/${contract.uuid}/milestones/`,
      token: client.access
    })).json[0].uuid;

    await step('GET /contracts/:uuid/milestones/:milestone_uuid/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: `/api/v1/contracts/${contract.uuid}/milestones/${milestoneUuid}/`,
        token: client.access
      });
      expectOk('contracts.milestonesGet', r, { allowStatuses: [200] });
      return r.json;
    });

    const extraMilestone = await step('POST /contracts/:uuid/milestones/create/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/milestones/create/`,
        token: freelancer.access,
        body: { title: 'M2', description: 'Second', amount: 50, due_date: '2030-09-01' }
      });
      expectOk('contracts.milestonesCreate', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('POST /contracts/:uuid/milestones/:id/complete/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/milestones/${milestoneUuid}/complete/`,
        token: freelancer.access
      });
      expectOk('contracts.milestonesComplete', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /contracts/:uuid/milestones/:id/approve/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/milestones/${milestoneUuid}/approve/`,
        token: client.access
      });
      expectOk('contracts.milestonesApprove', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /contracts/:uuid/milestones/:id/reject/', async () => {
      await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/milestones/${extraMilestone.uuid}/complete/`,
        token: freelancer.access
      });
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/milestones/${extraMilestone.uuid}/reject/`,
        token: client.access
      });
      expectOk('contracts.milestonesReject', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /contracts/:uuid/create-draft/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/create-draft/`,
        token: freelancer.access,
        body: { title: 'Draft title', total_amount: 120, milestones: [] }
      });
      expectOk('contracts.draftCreate', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('GET /contracts/:uuid/draft/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: `/api/v1/contracts/${contract.uuid}/draft/`,
        token: client.access
      });
      expectOk('contracts.draftGet', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /contracts/:uuid/approve-draft/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/approve-draft/`,
        token: client.access
      });
      expectOk('contracts.draftApprove', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /contracts/:uuid/request-progress-update/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/request-progress-update/`,
        token: client.access,
        body: { request_message: 'How is progress?' }
      });
      expectOk('contracts.requestProgressUpdate', r, { allowStatuses: [200, 201] });
      return r.json;
    });

    const dispute = await step('POST /contracts/:uuid/disputes/create/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/disputes/create/`,
        token: client.access,
        body: {
          dispute_type: 'quality',
          title: 'E2E dispute',
          description: 'Testing dispute flow',
          evidence: 'none'
        }
      });
      expectOk('contracts.disputesCreate', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('GET /contracts/:uuid/disputes/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: `/api/v1/contracts/${contract.uuid}/disputes/`,
        token: client.access
      });
      expectOk('contracts.disputesList', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /contracts/:uuid/disputes/:dispute_uuid/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: `/api/v1/contracts/${contract.uuid}/disputes/${dispute.uuid}/`,
        token: client.access
      });
      expectOk('contracts.disputesGet', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /contracts/:uuid/disputes/:dispute_uuid/close/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/disputes/${dispute.uuid}/close/`,
        token: client.access
      });
      expectOk('contracts.disputesClose', r, { allowStatuses: [200] });
      return r.json;
    });

    // Contract reject flow (separate contract before accept)
    const rejectContractGig = await step('POST /client/create-gig/ (contract reject)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/create-gig/',
        token: client.access,
        body: {
          client_name: 'E2E Client',
          title: 'Contract Reject Gig',
          description: 'For contract reject',
          budget: 80,
          project_type: 'fixed'
        }
      });
      expectOk('client.createGig contract reject', r, { allowStatuses: [201] });
      return r.json.gig;
    });

    await step('POST /freelancer/apply-gig/ (contract reject)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/freelancer/apply-gig/',
        token: freelancer.access,
        body: { gig_id: rejectContractGig.uuid, description: 'for contract reject' }
      });
      expectOk('freelancer.applyGig contract reject', r, { allowStatuses: [200] });
      return r.json;
    });

    const rejectContractApps = await step('GET /client/view-gig-appl/ (contract reject)', async () => {
      const r = await request(base, {
        method: 'GET',
        path: '/api/v1/client/view-gig-appl/',
        token: client.access,
        query: { gig_id: rejectContractGig.uuid }
      });
      expectOk('client.viewGigApplications contract reject', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /client/accept-appl/ (contract reject)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/accept-appl/',
        token: client.access,
        body: { application_id: rejectContractApps[0].application_id }
      });
      expectOk('client.acceptApplication contract reject', r, { allowStatuses: [200] });
      return r.json;
    });

    const rejectContract = await step('POST /contracts/create/ (reject)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/contracts/create/',
        token: freelancer.access,
        body: {
          application_id: rejectContractApps[0].application_id,
          title: 'Reject Contract',
          description: 'Will be rejected',
          services_offered: 'Dev',
          ...contractDates,
          total_amount: 80,
          currency: 'USD',
          deliverables: 'Code',
          acceptance_criteria: 'Tests pass'
        }
      });
      expectOk('contracts.create reject', r, { allowStatuses: [201] });
      return r.json.contract;
    });

    await step('POST /contracts/:uuid/reject/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${rejectContract.uuid}/reject/`,
        token: client.access,
        body: { reason: 'Not a fit' }
      });
      expectOk('contracts.reject', r, { allowStatuses: [200] });
      return r.json;
    });

    // Draft reject + cancel on active contract
    await step('POST /contracts/:uuid/create-draft/ (draft reject)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/create-draft/`,
        token: client.access,
        body: { title: 'Client draft', total_amount: 130 }
      });
      expectOk('contracts.draftCreate client', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('POST /contracts/:uuid/reject-draft/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/reject-draft/`,
        token: freelancer.access
      });
      expectOk('contracts.draftReject', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /contracts/:uuid/create-draft/ (draft cancel)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/create-draft/`,
        token: freelancer.access,
        body: { title: 'Cancel draft', total_amount: 140 }
      });
      expectOk('contracts.draftCreate cancel', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('POST /contracts/:uuid/cancel-draft/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/cancel-draft/`,
        token: freelancer.access
      });
      expectOk('contracts.draftCancel', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('PATCH /client/finish-gig-appl/', async () => {
      const r = await request(base, {
        method: 'PATCH',
        path: '/api/v1/client/finish-gig-appl/',
        token: client.access,
        body: { application_id: applicationId }
      });
      expectOk('client.finishApplication', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /contracts/:uuid/complete/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: `/api/v1/contracts/${contract.uuid}/complete/`,
        token: freelancer.access
      });
      expectOk('contracts.complete', r, { allowStatuses: [200] });
      return r.json;
    });

    // ── Chat ──────────────────────────────────────────────────────────────────
    const room = await step('POST /chat/create-get-room/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/chat/create-get-room/',
        token: client.access,
        body: { user_id: freelancer.user.id }
      });
      expectOk('chat.createOrGetRoom', r, { allowStatuses: [200, 201] });
      return r.json;
    });

    await step('GET /chat/get-room/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: '/api/v1/chat/get-room/',
        token: client.access,
        query: { room_slug: room.chat_room_slug }
      });
      expectOk('chat.getRoom', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('POST /chat/send-message/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/chat/send-message/',
        token: client.access,
        body: { chat_room: room.chat_room_slug, message: 'hello from e2e' }
      });
      expectOk('chat.sendMessage', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('GET /chat/messages/', async () => {
      const r = await request(base, {
        method: 'GET',
        path: '/api/v1/chat/messages/',
        token: client.access,
        query: { room_slug: room.chat_room_slug }
      });
      expectOk('chat.listMessages', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('GET /chat/user-chats/', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/chat/user-chats/', token: client.access });
      expectOk('chat.userChats', r, { allowStatuses: [200] });
      return r.json;
    });

    // ── Client misc ─────────────────────────────────────────────────────────
    await step('POST /client/feedback/', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/feedback/',
        body: { email: `fb-${suffix}@example.com`, name: 'E2E', message: 'ok' }
      });
      expectOk('client.feedback', r, { allowStatuses: [201] });
      return r.json;
    });

    const deleteGig = await step('POST /client/create-gig/ (delete flow)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/create-gig/',
        token: client.access,
        body: {
          client_name: 'E2E Client',
          title: 'Delete Gig',
          description: 'To be deleted',
          budget: 10,
          project_type: 'fixed'
        }
      });
      expectOk('client.createGig delete', r, { allowStatuses: [201] });
      return r.json.gig;
    });

    await step('PATCH /client/close-gig/', async () => {
      const r = await request(base, {
        method: 'PATCH',
        path: '/api/v1/client/close-gig/',
        token: client.access,
        body: { gig_id: rejectGig.uuid }
      });
      expectNot500('client.closeGig', r);
      return r.json;
    });

    await step('DELETE /client/delete-gig/', async () => {
      const r = await request(base, {
        method: 'DELETE',
        path: '/api/v1/client/delete-gig/',
        token: client.access,
        query: { gig_id: deleteGig.uuid }
      });
      expectOk('client.deleteGig', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('DELETE /portfolio/delete/', async () => {
      const r = await request(base, { method: 'DELETE', path: '/api/v1/portfolio/delete/', token: freelancer.access });
      expectNot500('portfolio.delete', r);
      return r.json;
    });

    return { ok: true, results };
  } finally {
    await sleep(50);
    await prisma.$disconnect().catch(() => {});
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

run()
  .then(({ results }) => {
    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    console.log(`\nE2E API results: ${ok} passed, ${fail} failed (${results.length} total)`);
    for (const r of results) {
      const mark = r.ok ? 'PASS' : 'FAIL';
      console.log(`${mark} ${r.name} (${r.ms}ms)${r.ok ? '' : `\n  ${r.error}`}`);
    }
    process.exitCode = fail ? 1 : 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
