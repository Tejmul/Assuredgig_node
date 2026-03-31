# AssuredGig Backend (Node) — Background jobs

The Node service currently sends email (for example OTP) **synchronously** inside request handlers (see `src/utils/mail.js` and `src/routes/users.js`). There is **no job queue worker** in the repository yet.

## Recommended direction (Node)

When you need retries, throttling, or heavy work off the request thread, add a queue backed by **Redis**, for example:

- **BullMQ** (Redis) — common choice for Node; supports delayed jobs and repeatable schedules
- Or **graphile-worker** / **pg-boss** if you prefer Postgres as the broker

Typical jobs to move out of the HTTP path:

- Transactional and marketing email
- Contract expiry sweeps (if you prefer cron over “on read” expiry)
- Notifications and digest summaries

## Environment variables (when you add a worker)

Example:

```dotenv
REDIS_URL="redis://localhost:6379/0"
```

Worker process would be a second entrypoint, e.g. `node src/worker.js`, run alongside `node src/index.js` in production.

## Local commands (illustrative)

Once BullMQ (or similar) is wired:

```bash
# Terminal 1: Redis
redis-server

# Terminal 2: API
npm run dev

# Terminal 3: worker
node src/worker.js
```

Until then, keep SMTP optional in development so registration and password flows do not require outbound mail.
