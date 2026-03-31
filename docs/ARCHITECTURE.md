# AssuredGig Backend (Node) — Architecture

## High-level overview

AssuredGig Backend is an **Express** service with a **versioned REST API** under `/api/v1/`, **PostgreSQL** via **Prisma**, and a **native WebSocket** server for chat. It replaces the legacy Django + DRF monolith while keeping the same domain boundaries and API shape where possible.

### Main components

- **HTTP app**: `src/app.js` — Express, JSON body, Helmet, CORS, Morgan, `/health/`, `/api/v1/*`, centralized errors.
- **Entrypoint**: `src/index.js` — creates HTTP server, attaches WebSockets (`src/ws.js`), listens on `PORT` (default `8000`).
- **Data access**: `src/prisma.js` — Prisma client singleton; schema in `prisma/schema.prisma`.
- **Auth**: `src/middleware/auth.js` — `Authorization: Bearer <access>` for protected HTTP routes; JWT signed in `src/utils/jwt.js`.
- **Realtime chat**: `src/ws.js` — `ws` package; JWT via query `?token=` or `Authorization: Bearer` on the upgrade request; path `/ws/chat/<room_slug>/` (also accepted under `/api/v1/ws/chat/<room_slug>/`).
- **Domain routes** (mounted under `/api/v1/`):
  - `src/routes/users.js` — register, login, refresh, profile, forgot-password OTP flow
  - `src/routes/client.js` — gigs (CRUD-ish), applications (view/accept/reject/finish), public feedback
  - `src/routes/freelancer.js` — apply, cancel application, list own applications
  - `src/routes/portfolio.js` — portfolio profile CRUD, listing, reviews
  - `src/routes/chat.js` — rooms, messages (REST); realtime via `ws`
  - `src/routes/contracts.js` — contracts, drafts (`ContractUpdateHistory`), milestones, disputes, progress-update requests

## Runtime architecture (request flow)

### HTTP (REST)

1. Client calls `/api/v1/<area>/...` (see `src/routes/index.js`).
2. Express matches the route handler; global middleware already parsed JSON.
3. Protected routes use `requireAuth`: JWT verified, user loaded from DB, attached as `req.user`.
4. Handlers validate input with **Zod** and use **Prisma** for reads/writes.
5. JSON responses; errors flow to `src/middleware/errors.js`.

### WebSocket (chat)

1. Client connects to `/ws/chat/<room_slug>/` (or `/api/v1/ws/chat/<room_slug>/`) with a valid access JWT.
2. Server resolves the room, checks membership, registers the socket in an in-memory room → clients map.
3. Incoming JSON frames `{ "message": "..." }` persist a `ChatMessage` and broadcast the serialized message to other clients in the room.

## Configuration

### Environment

See `.env.example`. Notable variables:

- `DATABASE_URL` — PostgreSQL URL for Prisma
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, optional TTL overrides
- `FRONTEND_BASE_URL` — used for email links where applicable
- SMTP vars for outbound mail (OTP, etc.) via `src/utils/mail.js`

### Database

- **Production / local dev**: PostgreSQL (`provider = "postgresql"` in `schema.prisma`).
- Migrations live in `prisma/migrations/`; use `npm run prisma:migrate` in development.

### Auth & permissions

- Default for business routes: **authenticated** (`requireAuth`).
- Public endpoints are explicit (e.g. gig listing, portfolio listing, feedback, registration/login).
- Access tokens are JWTs; refresh tokens are stored hashed in `RefreshToken`.

### CORS

`src/app.js` uses `cors({ origin: true })` — convenient for development; tighten for production (explicit origins).

## Domain boundaries (what lives where)

Same conceptual split as the legacy Django apps; implementation is plain Express routers + Prisma models.

| Area        | Router              | Prisma models (primary) |
|------------|---------------------|-------------------------|
| Users      | `routes/users.js`   | `User`, `UserProfile`, `RefreshToken`, `PasswordResetOTP` |
| Client     | `routes/client.js`  | `ClientPost`, `ApplicationModel`, `FeedbackModel` |
| Freelancer | `routes/freelancer.js` | `ApplicationModel`, `ClientPost` |
| Portfolio  | `routes/portfolio.js` | `PortfolioProfile`, `UserReview` (+ extended profile tables in schema for future endpoints) |
| Chat       | `routes/chat.js`, `ws.js` | `ChatRoom`, `ChatMessage` |
| Contracts  | `routes/contracts.js` | `Contract`, `ContractMilestone`, `ContractUpdateHistory`, `ContractDispute` |

## Deployment notes

- Process: run `node src/index.js` (or `npm start`) behind a reverse proxy with WebSocket upgrade support.
- Run `npm run prisma:migrate:deploy` (or equivalent) before starting new versions.
- No bundled GitHub Actions in this repo snapshot; align secrets and SSH steps with your hosting provider.

## Further reading

- `docs/DEVELOPER_GUIDE.md` — setup, scripts, extending the API
- `docs/CONTRACT_STATE_MACHINE.md` — contract and milestone lifecycle (behavioral spec)
- `docs/BACKGROUND_JOBS.md` — async work (queues) roadmap
- `docs/DATA_MODEL_SCHEMA.md` — field-level model reference (verify against `schema.prisma` when in doubt)
