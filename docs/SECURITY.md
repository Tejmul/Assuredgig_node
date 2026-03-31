# AssuredGig Backend — Security

This document captures the current security posture and the recommended production hardening plan.

## Rate limiting (critical)

Brute-force targets in this API include:

- `POST /api/v1/users/login/`
- `POST /api/v1/users/forgot-password/`
- `POST /api/v1/users/forgot-password/verify-otp/`
- `POST /api/v1/users/forgot-password/reset-password/`

**Current state:** no server-side rate limiting is implemented in code.

**Recommendation (production):**

- Add rate limiting per **IP** and per **account identifier** (email/phone) for auth endpoints.
- Suggested policies:
  - Login: 5/min per IP + 10/hr per email
  - OTP request: 3/hr per email + 10/hr per IP
  - OTP verify: 5/min per IP + lockout/backoff per email
- Ensure `429 Too Many Requests` with a consistent error envelope.

Implementation options:

- `django-ratelimit` (simple decorator-based)
- DRF throttling classes (`DEFAULT_THROTTLE_CLASSES` / `DEFAULT_THROTTLE_RATES`)

## CORS hardening

**Current state:** `CORS_ALLOW_ALL_ORIGINS = True` in `assuredgig_backend/settings.py` (explicitly dev-only).

**Recommendation (production):**

- Replace with an allowlist:
  - `CORS_ALLOWED_ORIGINS = ["https://www.assuredgig.com", "https://app.assuredgig.com", ...]`
- Set `CORS_ALLOW_CREDENTIALS` only if cookies are needed (JWT bearer tokens typically do not need it).
- Ensure `CSRF_TRUSTED_ORIGINS` is configured if cookies/CSRF are used.

## Input validation / injection

**Current state:** most writes use DRF serializers and Django ORM, which already mitigates classic SQL injection when used correctly.

**Recommendations:**

- Avoid building raw SQL with string concatenation.
- Treat all user-provided strings as untrusted and validate via serializers.
- For rich text fields, define expectations:
  - Plain text only (escape on render) **or**
  - Sanitized HTML (server-side sanitize with a strict allowlist).

## JWT signing key & rotation strategy

**Current state:**

- SimpleJWT is configured, but does not specify `SIGNING_KEY` / `VERIFYING_KEY`, so it defaults to Django’s `SECRET_KEY`.
- Refresh rotation is enabled (`ROTATE_REFRESH_TOKENS=True`), but there is no documented key rotation plan.

**Recommendation (production):**

- Separate JWT signing key(s) from Django `SECRET_KEY`:
  - Set `SIMPLE_JWT["SIGNING_KEY"]` from a dedicated env var.
- Plan key rotation:
  - Introduce `VERIFYING_KEY` support or key-set strategy (e.g., maintain current + previous keys during rollout).
  - Rotate keys with a grace period and revoke/expire old refresh tokens as needed.

## HTTPS enforcement

**Current state:** not documented.

**Recommendation (production):**

- Terminate TLS at the edge (load balancer / reverse proxy) and enforce HTTPS:
  - `SECURE_SSL_REDIRECT = True`
  - `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` (when behind proxy)
  - `SESSION_COOKIE_SECURE = True`
  - `CSRF_COOKIE_SECURE = True`
  - HSTS: `SECURE_HSTS_SECONDS`, `SECURE_HSTS_INCLUDE_SUBDOMAINS`, `SECURE_HSTS_PRELOAD`

