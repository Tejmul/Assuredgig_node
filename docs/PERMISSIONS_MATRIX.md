# AssuredGig Backend — Permissions matrix

This document centralizes “who can do what”, based on permission classes + in-view checks in the codebase.

Legend:

- **Public**: no auth required (`AllowAny`)
- **Auth**: authenticated user required (`IsAuthenticated`)
- **Client(owner)**: authenticated AND owns the referenced gig (`ClientPost.client == request.user`)
- **Freelancer(owner)**: authenticated AND owns the referenced application (`ApplicationModel.freelancer == request.user`)
- **Contract party**: authenticated AND is the contract’s client or freelancer

## Users

| Endpoint | Method | Who | Notes |
| --- | --- | --- | --- |
| `/api/v1/users/register/` | POST | Public | |
| `/api/v1/users/login/` | POST | Public | |
| `/api/v1/users/token/refresh/` | POST | Public | |
| `/api/v1/users/profile/` | GET | Auth | |
| `/api/v1/users/profile/` | PUT | Auth | Updates user + nested `profile` |
| `/api/v1/users/forgot-password/` | POST | Public | |
| `/api/v1/users/forgot-password/verify-otp/` | POST | Public | |
| `/api/v1/users/forgot-password/reset-password/` | POST | Public | |

## Client / gigs

| Endpoint | Method | Who | Notes |
| --- | --- | --- | --- |
| `/api/v1/client/get-all-gigs/` | GET | Public | |
| `/api/v1/client/get-a-gig/` | GET | Public | Query param `gig_id` |
| `/api/v1/client/feedback/` | POST | Public | |
| `/api/v1/client/create-gig/` | POST | Auth | Creates gig owned by requester |
| `/api/v1/client/get-user-gigs/` | GET | Auth | Lists requester’s gigs |
| `/api/v1/client/update-gig/` | POST | Client(owner) | Body includes `gig_id` |
| `/api/v1/client/delete-gig/` | DELETE | Client(owner) | Query param `gig_id` |
| `/api/v1/client/close-gig/` | PATCH | Client(owner) | Body includes `gig_id` |
| `/api/v1/client/view-gig-appl/` | GET | Client(owner) | Query param `gig_id` |
| `/api/v1/client/reject-appl/` | POST | Client(owner) | Application must be `PENDING` |
| `/api/v1/client/accept-appl/` | POST | Client(owner) | Accept one, reject others; closes gig |
| `/api/v1/client/finish-gig-appl/` | PATCH | Client(owner) | Application must be `ACCEPTED` |

## Freelancer / applications

| Endpoint | Method | Who | Notes |
| --- | --- | --- | --- |
| `/api/v1/freelancer/apply-gig/` | POST | Auth | Must not be gig owner; gig must be open; no duplicate applications |
| `/api/v1/freelancer/cancel-appl/` | POST | Freelancer(owner) | Sets status to `CANCELLED` |
| `/api/v1/freelancer/applied-gigs/` | GET | Auth | Lists requester’s applications |

## Chat (REST)

| Endpoint | Method | Who | Notes |
| --- | --- | --- | --- |
| `/api/v1/chat/create-get-room/` | POST | Auth | Cannot create room with yourself |
| `/api/v1/chat/get-room/` | GET | Room member | Query param `room_slug` |
| `/api/v1/chat/messages/` | GET | Room member | Query param `room_slug` |
| `/api/v1/chat/send-message/` | POST | Room member | Body: `chat_room` (slug), `message` |
| `/api/v1/chat/user-chats/` | GET | Auth | Lists rooms where user1/user2 is requester |

## Chat (WebSocket)

| Endpoint | Method | Who | Notes |
| --- | --- | --- | --- |
| `ws/chat/<room_slug>/?token=<JWT>` | WS | Room member | Connection closed if token invalid or user not member |

See `docs/WEBSOCKET_PROTOCOL.md` for payload details.

## Contracts

| Endpoint | Method | Who | Notes |
| --- | --- | --- | --- |
| `/api/v1/contracts/` | GET | Auth | Returns contracts where user is client or freelancer |
| `/api/v1/contracts/stats/` | GET | Auth | |
| `/api/v1/contracts/available-applications/` | GET | Auth | Returns accepted applications for requester (freelancer) with no contract |
| `/api/v1/contracts/create/` | POST | Auth | If `application_id` present: only that application’s freelancer can create |
| `/api/v1/contracts/<uuid>/` | GET | Contract party | |
| `/api/v1/contracts/<uuid>/history/` | GET | Contract party | |
| `/api/v1/contracts/<uuid>/accept/` | POST | Contract party | Must match pending state (client vs freelancer) |
| `/api/v1/contracts/<uuid>/reject/` | POST | Contract party | Intended only from pending states |
| `/api/v1/contracts/<uuid>/complete/` | POST | Contract party | Enforced by serializer: only freelancer when active |
| `/api/v1/contracts/<uuid>/draft/` | GET | Contract party | Gets latest pending draft |
| `/api/v1/contracts/<uuid>/create-draft/` | POST | Contract party | Only one pending draft at a time |
| `/api/v1/contracts/<uuid>/approve-draft/` | POST | Contract party | Cannot approve your own draft |
| `/api/v1/contracts/<uuid>/reject-draft/` | POST | Contract party | Cannot reject your own draft |
| `/api/v1/contracts/<uuid>/cancel-draft/` | POST | Contract party | Intended: draft creator only (implementation has known type mismatch risk) |
| `/api/v1/contracts/<uuid>/milestones/` | GET | Contract party | |
| `/api/v1/contracts/<uuid>/milestones/create/` | POST | Contract party | |
| `/api/v1/contracts/<uuid>/milestones/<milestone_uuid>/` | GET | Contract party | |
| `/api/v1/contracts/<uuid>/milestones/<milestone_uuid>/complete/` | POST | Freelancer (contract party) | Contract must be active |
| `/api/v1/contracts/<uuid>/milestones/<milestone_uuid>/approve/` | POST | Client (contract party) | Contract must be active |
| `/api/v1/contracts/<uuid>/milestones/<milestone_uuid>/reject/` | POST | Client (contract party) | Contract must be active |
| `/api/v1/contracts/<uuid>/disputes/` | GET | Contract party | |
| `/api/v1/contracts/<uuid>/disputes/create/` | POST | Contract party | Contract must be active |
| `/api/v1/contracts/<uuid>/disputes/<dispute_uuid>/` | GET | Contract party | |
| `/api/v1/contracts/<uuid>/disputes/<dispute_uuid>/close/` | POST | Contract party | View comment suggests “platform admin”, but code enforces party-only |
| `/api/v1/contracts/<uuid>/request-progress-update/` | POST | Client (contract party) | Contract must be active; rate-limited |

