/* eslint-disable no-console */
const http = require('http');
const { randomUUID } = require('crypto');

require('dotenv').config();

const { createApp } = require('../../src/app');

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

  try {
    await step('health', async () => {
      const r = await request(base, { method: 'GET', path: '/health/' });
      expectOk('health', r, { allowStatuses: [200] });
      return r;
    });

    // Auth: create two users (client + freelancer)
    const suffix = randomUUID().slice(0, 8);
    const clientEmail = `e2e-client-${suffix}@example.com`;
    const freelancerEmail = `e2e-freelancer-${suffix}@example.com`;
    const password = `Passw0rd!${suffix}`;

    const client = await step('users.register (client)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/users/register/',
        body: { email: clientEmail, password, password2: password, user_name: `client-${suffix}` }
      });
      expectOk('users.register (client)', r, { allowStatuses: [201] });
      return r.json;
    });

    const freelancer = await step('users.register (freelancer)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/users/register/',
        body: { email: freelancerEmail, password, password2: password, user_name: `freelancer-${suffix}` }
      });
      expectOk('users.register (freelancer)', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('users.login', async () => {
      const r = await request(base, { method: 'POST', path: '/api/v1/users/login/', body: { email: clientEmail, password } });
      expectOk('users.login', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('users.profile (401 without token)', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/users/profile/' });
      if (r.status !== 401) throw new Error(`expected 401 got ${r.status}`);
      return r;
    });

    await step('users.profile (client)', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/users/profile/', token: client.access });
      expectOk('users.profile (client)', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('users.updateProfile (client)', async () => {
      const r = await request(base, {
        method: 'PUT',
        path: '/api/v1/users/profile/',
        token: client.access,
        body: { phone_number: `555${suffix}`.slice(0, 9), profile: { bio: 'e2e bio', skills: ['node'], hourly_rate: 25 } }
      });
      expectOk('users.updateProfile (client)', r, { allowStatuses: [200] });
      return r.json;
    });

    // Portfolio
    const createdPortfolio = await step('portfolio.create', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/portfolio/create/',
        token: freelancer.access,
        body: { title: 'E2E Portfolio', location: 'Remote', links: 'https://example.com' }
      });
      expectOk('portfolio.create', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('portfolio.list', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/portfolio/' });
      expectOk('portfolio.list', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('portfolio.getById', async () => {
      const r = await request(base, { method: 'GET', path: `/api/v1/portfolio/${createdPortfolio.id}/` });
      expectOk('portfolio.getById', r, { allowStatuses: [200] });
      return r.json;
    });

    // Client + freelancer gig flow
    const gig = await step('client.createGig', async () => {
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

    await step('client.getAllGigs', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/client/get-all-gigs/' });
      expectOk('client.getAllGigs', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('client.getGig', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/client/get-a-gig/', query: { gig_id: gig.uuid } });
      expectOk('client.getGig', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('freelancer.applyGig', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/freelancer/apply-gig/',
        token: freelancer.access,
        body: { gig_id: gig.uuid, description: 'I can do it' }
      });
      expectOk('freelancer.applyGig', r, { allowStatuses: [200] });
      return r.json;
    });

    const applications = await step('client.viewGigApplications', async () => {
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

    await step('client.acceptApplication', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/accept-appl/',
        token: client.access,
        body: { application_id: applicationId }
      });
      expectOk('client.acceptApplication', r, { allowStatuses: [200] });
      return r.json;
    });

    // Contracts (created by freelancer for accepted application)
    const contract = await step('contracts.create', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/contracts/create/',
        token: freelancer.access,
        body: {
          application_id: applicationId,
          title: 'E2E Contract',
          description: 'Do the work',
          services_offered: 'Dev',
          start_date: '2026-01-01',
          delivery_date: '2026-12-31',
          expiry_date: '2026-12-15',
          total_amount: 100,
          currency: 'USD',
          deliverables: 'Code',
          acceptance_criteria: 'Tests pass',
          milestones: [{ title: 'M1', description: 'First', amount: 50, due_date: '2026-06-01' }]
        }
      });
      expectOk('contracts.create', r, { allowStatuses: [201] });
      return r.json.contract;
    });

    await step('contracts.list', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/contracts/', token: client.access });
      expectOk('contracts.list', r, { allowStatuses: [200] });
      return r.json;
    });

    await step('contracts.accept (client)', async () => {
      const r = await request(base, { method: 'POST', path: `/api/v1/contracts/${contract.uuid}/accept/`, token: client.access });
      expectOk('contracts.accept (client)', r, { allowStatuses: [200] });
      return r.json;
    });

    // Chat
    const room = await step('chat.createOrGetRoom', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/chat/create-get-room/',
        token: client.access,
        body: { user_id: freelancer.user.id }
      });
      expectOk('chat.createOrGetRoom', r, { allowStatuses: [200, 201] });
      return r.json;
    });

    await step('chat.sendMessage', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/chat/send-message/',
        token: client.access,
        body: { chat_room: room.chat_room_slug, message: 'hello from e2e' }
      });
      expectOk('chat.sendMessage', r, { allowStatuses: [201] });
      return r.json;
    });

    await step('chat.listMessages', async () => {
      const r = await request(base, {
        method: 'GET',
        path: '/api/v1/chat/messages/',
        token: client.access,
        query: { room_slug: room.chat_room_slug }
      });
      expectOk('chat.listMessages', r, { allowStatuses: [200] });
      return r.json;
    });

    // Remaining endpoints: smoke-check (ensure not 500)
    await step('contracts.stats (smoke)', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/contracts/stats/', token: client.access });
      expectNot500('contracts.stats (smoke)', r);
      return r.json;
    });

    await step('contracts.availableApplications (smoke)', async () => {
      const r = await request(base, { method: 'GET', path: '/api/v1/contracts/available-applications/', token: freelancer.access });
      expectNot500('contracts.availableApplications (smoke)', r);
      return r.json;
    });

    await step('client.feedback (public)', async () => {
      const r = await request(base, {
        method: 'POST',
        path: '/api/v1/client/feedback/',
        body: { email: `fb-${suffix}@example.com`, name: 'E2E', message: 'ok' }
      });
      expectOk('client.feedback (public)', r, { allowStatuses: [201] });
      return r.json;
    });

    // Cleanup-ish: deleting portfolio is safe
    await step('portfolio.delete', async () => {
      const r = await request(base, { method: 'DELETE', path: '/api/v1/portfolio/delete/', token: freelancer.access });
      expectNot500('portfolio.delete', r);
      return r.json;
    });

    return { ok: true, results };
  } finally {
    await sleep(50);
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

run()
  .then(({ results }) => {
    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    console.log(`\nE2E API results: ${ok} passed, ${fail} failed`);
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

