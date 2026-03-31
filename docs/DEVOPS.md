# AssuredGig Backend — Infrastructure / DevOps

## Docker / docker-compose (high)

**Current state:** no Docker setup exists in the repo. Local onboarding currently requires either:

- a reachable CockroachDB (cloud), or
- using `assuredgig_backend.settings_ci` (SQLite) for local dev.

**Recommendation:**

- Add `docker-compose.yml` with:
  - `web` (Django)
  - `cockroach` (local CockroachDB) OR `postgres` (dev-only; not identical)
  - `redis` (for Channels + Celery later)

## Environments: staging vs production

**Current state:** there is a CI override (`settings_ci.py`), but no explicit staging/prod settings split.

**Recommendation:**

- Introduce environment-specific settings modules or env-driven toggles:
  - `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`
  - `CHANNEL_LAYERS` backend (Redis in prod)
  - Security settings (HTTPS redirect, HSTS)
  - Logging configuration

## Deployment pipeline completeness

**Current state:**

- `.github/workflows/deploy.yml` deploys over SSH and runs migrations.
- Restart step is commented out.

**Recommendation:**

- Use a process manager (systemd/supervisor) and un-comment/implement a restart step.
- Add smoke checks post-deploy:
  - `GET /health/` must return `{ "status": "ok" }`

## Rollback strategy (migrations)

**Current state:** not documented.

**Recommendation:**

- Treat DB migrations as a release artifact:
  - “expand/contract” pattern for breaking changes
  - deploy code that supports both old+new schema before dropping old columns
- Maintain a rollback runbook:
  - revert code to previous commit/tag
  - apply safe reverse migrations only when verified

## Health checks

**Implemented:**

- `GET /health/` (see `assuredgig_backend/views.py`)

Use cases:

- Load balancer health probes
- Uptime monitors
- CI/CD smoke tests

## Logging

**Current state:** default Django logging (no explicit `LOGGING` dict in settings).

**Recommendation:**

- Add a structured logging configuration:
  - JSON logs in production
  - request ID correlation (middleware)
  - separate levels/handlers for app logs vs access logs

