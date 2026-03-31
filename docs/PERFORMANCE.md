# AssuredGig Backend — Performance & scalability

## Pagination (critical)

**Current state:**

- DRF global pagination is configured (`PageNumberPagination`, `PAGE_SIZE=10`), but several list endpoints manually serialize querysets and therefore **do not paginate**.

High-risk endpoints (examples):

- `GET /api/v1/client/get-all-gigs/` (returns all gigs)
- `GET /api/v1/chat/messages/?room_slug=...` (returns full history)
- `GET /api/v1/chat/user-chats/` (returns all rooms)
- `GET /api/v1/portfolio/` (portfolio list)

**Recommendation:**

- Convert list endpoints to DRF generic views/viewsets or explicitly apply pagination using the configured paginator.
- Document query params consistently:
  - `?page=1&page_size=20` (if you add page size overrides)

## Caching strategy

**Current state:** no caching layer is configured.

**Recommendation:**

- Introduce Redis for:
  - hot list endpoints (public portfolio listing, gig listing)
  - rate limiting counters
  - Channels channel layer (required for websocket scaling)

## Database indexing strategy

**Current state:** only a few explicit indexes/constraints exist (e.g., OTP index, some unique_together).

**Recommendation:**

- Add indexes for common filters and joins:
  - `ClientPost.status`, `ClientPost.created_at`
  - `ApplicationModel.gig_id`, `ApplicationModel.freelancer`, `ApplicationModel.status`
  - `Contract.client`, `Contract.freelancer`, `Contract.status`
  - `ChatMessage.chat_room`, `ChatMessage.created_at`

## WebSocket scaling (critical)

**Current state:**

- `CHANNEL_LAYERS` uses `InMemoryChannelLayer`, which does **not** work across multiple server instances.

**Recommendation (production):**

- Use Redis channel layer:
  - `channels_redis.core.RedisChannelLayer`
- Ensure websocket sticky sessions are not required (Redis handles fanout).

