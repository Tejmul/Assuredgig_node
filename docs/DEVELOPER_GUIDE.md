# AssuredGig Backend (Node) — Developer Guide

This guide explains how to run and extend the **Node + Express + Prisma + PostgreSQL** backend from a clean machine.

## Tech stack

- **Runtime**: Node.js (CommonJS)
- **HTTP**: Express 4
- **Validation**: Zod
- **ORM**: Prisma 6 → PostgreSQL
- **Auth**: JWT access + refresh (refresh rows in DB, hashed)
- **Realtime**: `ws` (WebSocket) for chat
- **Email**: Nodemailer (SMTP), optional in dev

Dependencies and scripts are defined in `package.json`.

## Repository structure (high signal)

- `src/index.js` — process entry; HTTP + WebSocket
- `src/app.js` — Express app factory
- `src/routes/` — API routers; `index.js` mounts them under `/api/v1`
- `src/middleware/` — auth, errors
- `src/utils/` — JWT, mail, contract helpers
- `src/ws.js` — WebSocket attachment
- `prisma/schema.prisma` — data model
- `prisma/migrations/` — SQL migrations
- `prisma/seed.js` — optional seed (see `npm run db:seed`)
- `.env.example` — environment template

## Local setup

### 1) Requirements

- Node.js 18+ recommended
- PostgreSQL 14+ (or compatible managed Postgres)

### 2) Install dependencies

```bash
cd Assuredgig-Node
npm install
```

### 3) Environment

Copy `.env.example` to `.env` and set at least:

- `DATABASE_URL` — must point at a database you can migrate
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — long random strings in any real environment

Optional: SMTP settings so forgot-password emails actually send.

### 4) Database

```bash
npm run prisma:generate
npm run prisma:migrate
# optional
npm run db:seed
```

### 5) Run the API

```bash
npm run dev
```

Defaults:

- HTTP: `http://localhost:8000` (or `PORT`)
- Health: `GET /health/`
- API prefix: `/api/v1/`

### 6) WebSockets

Connect to:

`ws://localhost:8000/ws/chat/<room_slug>/`

Authenticate with the same JWT as HTTP, either:

- Query: `?token=<access_jwt>`, or
- Header on upgrade: `Authorization: Bearer <access_jwt>`

## Authentication (HTTP)

- Send `Authorization: Bearer <access_token>` on protected routes.
- Obtain tokens via `POST /api/v1/users/login/` or `POST /api/v1/users/register/`.
- Refresh access with `POST /api/v1/users/token/refresh/` (body: `{ "refresh": "..." }`).

## Adding a new endpoint

1. Choose the router in `src/routes/` (or add a new file and mount it in `src/routes/index.js`).
2. Validate the body/query with Zod.
3. Use `requireAuth` when the caller must be logged in.
4. Use `prisma` from `src/prisma.js` for DB access.
5. Return JSON consistent with neighboring handlers (snake_case fields in responses matches much of the legacy API).

## Prisma workflow

- Edit `prisma/schema.prisma`, then:

```bash
npm run prisma:migrate
```

- Production deploy: `npm run prisma:migrate:deploy` (after `prisma generate` if your image does not run it automatically).

## Testing

There is no default `npm test` script yet. For a quick smoke check:

```bash
node -e "require('./src/app').createApp().then(() => console.log('ok')).catch(console.error)"
```

Add a test runner (e.g. Vitest or Node’s built-in test) when you start locking in behavior.

## Operational notes

- **Contract expiry**: Pre-active contracts past `expiryDate` are moved to `expired` when loaded through list/detail flows (see `src/utils/contractExpiry.js`).
- **Draft approval**: Approving a draft applies `draftData` to the contract and can replace milestones when `draftMilestones` is set (see `src/routes/contracts.js`).
- **Portfolio**: Related tables (`PortfolioSkill`, `PortfolioProject`, etc.) exist in Prisma; expose them via new routes when the product needs parity with the legacy API.

## Related docs

- `docs/ARCHITECTURE.md` — components and request flow
- `docs/CONTRACT_STATE_MACHINE.md` — contract and milestone rules
- `docs/BACKGROUND_JOBS.md` — queue / worker plan
- `docs/DATA_MODEL_SCHEMA.md` — model field reference (cross-check with `schema.prisma`)
