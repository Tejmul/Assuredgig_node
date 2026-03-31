# AssuredGig — Node.js Backend (Express + Prisma + Postgres)

This is a JavaScript (no TypeScript) implementation of the backend described in the provided `docs/*` specs:

- REST API under `/api/v1/`
- JWT auth (access + refresh)
- Chat websockets:
  - `ws/chat/<room_slug>/?token=<JWT>`
  - `api/v1/ws/chat/<room_slug>/?token=<JWT>`

## Quickstart (local)

### 1) Start Postgres

```bash
docker compose up -d
```

### 2) Install deps

```bash
npm install
```

### 3) Configure env

```bash
cp .env.example .env
```

### 4) Migrate + generate Prisma client

**Non-interactive (recommended for CI / first run):** applies existing migrations and generates the client—no prompts.

```bash
npm run db:setup
```

**Interactive (creates new migrations during development):**

```bash
npm run prisma:migrate
```

### 5) Seed example users/gig

```bash
npm run db:seed
```

### 6) Run server

```bash
npm run dev
```

Health check:

- `GET /health/` → `{ "status": "ok" }`

## Notes

- This repo exposes UUIDs for API usage, while keeping integer PKs internally (similar to the Django version).
- Error envelopes are kept intentionally close to the shapes documented (some endpoints return `{ error: ... }`, others `{ message: ... }`).

# Assuredgig_node
