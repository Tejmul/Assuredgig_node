# AssuredGig Backend — Business logic gaps / roadmap

This document lists major platform capabilities that are not implemented or not specified yet, but are critical for a production freelance marketplace.

## Payment / escrow (critical)

**Current state:** contracts have `escrow_status` / `escrow_amount` fields, but there is no payment provider integration or escrow ledger model documented.

**Needed spec:**

- Provider choice (Stripe Connect, Adyen, MangoPay, etc.)
- Money movement model:
  - client deposit (escrow)
  - milestone-based release
  - refunds / disputes
- Ledger tables + audit trail
- Webhooks (idempotent processing, signature validation)

## Notifications

**Current state:** emails are sent ad-hoc from request handlers.

**Recommended direction:**

- Introduce a unified Notification model:
  - channel: email / in-app / push
  - template key + context
  - delivery status + retries
- Move delivery to background jobs (Celery) once enabled.

## File uploads / media storage

**Current state:** Django `MEDIA_ROOT` is configured and some models use `ImageField`, but there is no documented production media storage plan.

**Recommendation:**

- Use S3-compatible storage in production:
  - signed upload URLs for frontend
  - lifecycle policies + CDN (CloudFront)
- Define allowed file types and size limits.

## Admin panel

**Current state:** Django admin is enabled, but there is no documentation on what’s manageable or how it’s customized.

**Recommendation:**

- Document admin workflows:
  - verifying gigs / featured flags
  - moderating disputes
  - user verification
- Add admin customizations (list filters, search, readonly fields) for key models.

