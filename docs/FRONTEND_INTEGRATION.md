# AssuredGig Backend — Frontend integration

## API versioning strategy

**Current state:** REST endpoints are namespaced under `/api/v1/`.

**Recommendation:**

- Keep `/api/v1/` stable; when introducing breaking changes:
  - add `/api/v2/` routes and run both in parallel during migration
  - document deprecation timelines

## Postman / SDK (low)

**Current state:** no Postman collection or SDK is included.

**Recommendation:**

- Add an exported Postman collection (or OpenAPI export workflow) so frontend devs can:
  - authenticate
  - hit common flows (gigs, applications, contracts, chat)

## WebSocket reconnection / heartbeat

**Current state:** chat websocket protocol does not define heartbeat/ping messages.

**Recommendation:**

- Frontend should implement:
  - exponential backoff reconnect
  - token refresh handling (reconnect with new token)
- Backend options:
  - define a `ping/pong` message type, or rely on platform websocket keepalives

