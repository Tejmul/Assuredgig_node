# AssuredGig Backend — Testing strategy

## Current state

- `pytest.ini` and `conftest.py` are present.
- Test settings default to `assuredgig_backend.settings_ci` (SQLite).
- Test discovery is currently scoped to:
  - `chatApp/tests`
  - `contracts`

## What’s tested vs what isn’t (as of now)

**Documented by structure only:**

- There is scaffolding to test **chat** and **contracts**.

**Not yet documented/guaranteed:**

- Coverage for `users`, `client`, `freelancer`, `portfolio` apps
- End-to-end flows that span multiple apps (gig → application → contract)

## Recommended test layers

### 1) Unit tests (fast)

- Serializer validation rules (e.g. contract transitions, application rules)
- Utility functions (email formatting, token logic if extracted)

### 2) API tests (DRF client)

- For each endpoint: success + common error responses
- Permission checks (owner vs non-owner, contract party vs non-party)

### 3) Integration tests (WebSockets)

**Goal:** verify `chatApp.consumers.ChatConsumer` protocol end-to-end.

Recommended approach:

- Use Channels testing tools (e.g., `WebsocketCommunicator`) to:
  - Connect with/without token
  - Verify room membership checks
  - Send `{ "message": "..." }` and assert the broadcast payload matches `ChatMessageSerializer`

## Mocking external services

### SMTP (Gmail)

**Current state:** email is sent synchronously using Django email backend configured for SMTP in `settings.py`. CI uses `locmem` backend (`settings_ci.py`).

Recommended in tests:

- Run all tests under CI settings (`DJANGO_SETTINGS_MODULE=assuredgig_backend.settings_ci`)
- Assert emails via Django mail outbox (`django.core.mail.outbox`) when using locmem backend

### CockroachDB

**Current state:** CI uses SQLite; production uses CockroachDB.

Recommended:

- Keep unit/API tests on SQLite for speed.
- Add a separate “DB-compat” job that runs a subset against a local Cockroach container (see `docs/DEVOPS.md` for Docker notes) to catch SQL/DDL incompatibilities early.

