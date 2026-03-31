# AssuredGig Backend — API Reference

## Conventions

- **Base URL prefix**: all REST endpoints are mounted under `/api/v1/` (see `assuredgig_backend/urls.py`).
- **Auth header** (JWT):
  - `Authorization: Bearer <access_token>`
- **Default auth**: most endpoints require authentication because DRF is configured with global `IsAuthenticated`.
- **Docs UI**:
  - Swagger: `/api/v1/docs/`
  - Redoc: `/api/v1/docs/redoc/`
- **Health check**:
  - `GET /health/` → `{ "status": "ok" }`

See also:

- `docs/DATA_MODEL_SCHEMA.md` for the **field-level schema** (models + relationships).
- `docs/ERRORS.md` for **error envelopes** and common domain validation rules.
- `docs/WEBSOCKET_PROTOCOL.md` for the **chat websocket message protocol**.
- `docs/CONTRACT_STATE_MACHINE.md` for **contract + milestone state transitions**.
- `docs/PERMISSIONS_MATRIX.md` for a centralized **roles → capabilities** matrix.
- `docs/BACKGROUND_JOBS.md` for **Celery/background jobs** status and wiring notes.

## Request/response shapes (how to read this doc)

When an endpoint uses a Django ModelSerializer with `fields = "__all__"`, the **response** generally includes the full model shape (including `uuid`, timestamps, and nested read-only relations), but the **request** usually expects only the writable fields.

Where possible below, each endpoint includes:

- **Request body**: JSON schema (field names + types)
- **Success response**: example payload (shape)
- **Common errors**: status + error body examples (current behavior)

## Error responses (current behavior)

This codebase currently returns a few different error envelope shapes depending on the app/view. Frontend clients should be prepared to handle any of these:

### 1) DRF serializer validation errors (typical)

Status: `400`

Example:

```json
{
  "title": ["This field is required."],
  "budget": ["A valid number is required."]
}
```

### 2) Custom envelope with `error` + `details` (common in contracts)

Status: `400`, `403`, `404`, `429`, `500`

Example:

```json
{
  "error": "Invalid contract data",
  "details": {
    "total_amount": ["A valid number is required."]
  }
}
```

### 3) Custom envelope with `message` (common in client/freelancer)

Status: `400`, `403`, `404`, `500`

Example:

```json
{
  "message": "You are not authorized to update this gig."
}
```

## REST endpoints

### Users (`/api/v1/users/`)

- **POST** `/api/v1/users/register/`
  - **Auth**: public (`AllowAny`)
  - **Handler**: `users.views.UserRegistrationView.post`
  - **Body**: `email`, `password`, `password2`, optional `user_name`, `phone_number`, optional `profile` object
  - **Returns**: user + `access` + `refresh`

- **POST** `/api/v1/users/login/`
  - **Auth**: public
  - **Handler**: `users.views.UserLoginView.post`
  - **Body**: `email`, `password`
  - **Returns**: user + `access` + `refresh`

- **POST** `/api/v1/users/token/refresh/`
  - **Auth**: public
  - **Handler**: `users.views.TokenRefreshView.post`
  - **Body**: `refresh`
  - **Returns**: new `access`

- **GET** `/api/v1/users/profile/`
  - **Auth**: required
  - **Handler**: `users.views.UserProfileView.get`
  - **Returns**: current user

- **PUT** `/api/v1/users/profile/`
  - **Auth**: required
  - **Handler**: `users.views.UserProfileView.put`
  - **Body**: partial update of user fields and nested `profile`
  - **Returns**: updated user

- **POST** `/api/v1/users/forgot-password/`
  - **Auth**: public
  - **Handler**: `users.views.ForgotPasswordView.post`
  - **Body**: `email`
  - **Returns**: `{ "message": "OTP sent to email." }`

- **POST** `/api/v1/users/forgot-password/verify-otp/`
  - **Auth**: public
  - **Handler**: `users.views.VerifyOTPForgotPasswordView.post`
  - **Body**: `email`, `otp`
  - **Returns**: `{ "message": "OTP verified successfully." }`

- **POST** `/api/v1/users/forgot-password/reset-password/`
  - **Auth**: public
  - **Handler**: `users.views.ResetPasswordView.post`
  - **Body**: `email`, `new_password`
  - **Returns**: `{ "message": "Password reset successfully." }`

### Client / gigs (`/api/v1/client/`)

- **POST** `/api/v1/client/create-gig/`
  - **Auth**: required
  - **Handler**: `client.views.GigCreateHandler.post`
  - **Request body (writable fields)**:
    - `client_name` (string)
    - `title` (string)
    - `description` (string)
    - `category` (string, optional)
    - `budget` (number)
    - `project_type` (`"fixed"` \| `"hourly"`)
    - `duration` (string, optional)
    - `skills_required` (array of strings; optional, defaults to `[]`)
    - `location` (string, optional)
    - `difficulty` (`"beginner"` \| `"intermediate"` \| `"expert"`, optional)
    - `verified` (bool, optional; usually managed by platform)
    - `featured` (bool, optional; usually managed by platform)
    - `deadline` (date `YYYY-MM-DD`, optional)
    - `status` (`"open"` \| `"closed"`, optional; default `"open"`)
  - **Success response (201)**:

```json
{
  "message": "Gig created successfully",
  "gig": {
    "id": 123,
    "uuid": "3e1b1c8a-2a2d-4f7d-a6b7-9a7e8c9d0e1f",
    "client": { "id": 1, "uuid": "...", "email": "...", "user_name": "...", "phone_number": "...", "verified": false, "date_joined": "2026-03-30", "profile": { "profile_picture": null, "bio": null, "skills": [], "hourly_rate": null, "created_at": "...", "updated_at": "..." } },
    "client_name": "Acme Inc",
    "title": "Build a landing page",
    "description": "Need a responsive landing page…",
    "category": "web",
    "budget": "500.00",
    "project_type": "fixed",
    "duration": "1 week",
    "skills_required": ["react", "css"],
    "location": "Remote",
    "difficulty": "beginner",
    "verified": false,
    "featured": false,
    "deadline": "2026-04-15",
    "status": "open",
    "created_at": "2026-03-30T10:00:00Z",
    "updated_at": "2026-03-30T10:00:00Z"
  }
}
```

- **POST** `/api/v1/client/update-gig/`
  - **Auth**: required (must be gig owner)
  - **Handler**: `client.views.GigUpdateHandler.post`
  - **Notes**: if the gig has applications, pending applications are rejected and notification emails may be sent.
  - **Request body**:
    - `gig_id` (uuid, required)
    - plus any updatable `ClientPost` fields (same names as create)
  - **Success response (200)**: returns the updated gig object (serializer output)

- **DELETE** `/api/v1/client/delete-gig/`
  - **Auth**: required (must be gig owner)
  - **Handler**: `client.views.GigDeleteHandler.delete`
  - **Input**: `gig_id` comes from query params (not JSON body).
  - **Success response (200)**:

```json
{ "message": "Gig Deleted Successfully" }
```

- **GET** `/api/v1/client/get-all-gigs/`
  - **Auth**: public
  - **Handler**: `client.views.GetAllGigs.get`

- **GET** `/api/v1/client/get-a-gig/`
  - **Auth**: public
  - **Handler**: `client.views.GetAGig.get`
  - **Query param**: `gig_id`

- **GET** `/api/v1/client/get-user-gigs/`
  - **Auth**: required
  - **Handler**: `client.views.GetUserGig.get`

- **GET** `/api/v1/client/view-gig-appl/`
  - **Auth**: required (must be gig owner)
  - **Handler**: `client.views.ViewGigApplication.get`
  - **Query param**: `gig_id`

- **POST** `/api/v1/client/reject-appl/`
  - **Auth**: required (must be gig owner)
  - **Handler**: `client.views.RejectApplication.post`
  - **Request body**: `{ "application_id": <int> }`
  - **Success response (200)**: `{ "message": "Application successfully rejected" }`

- **POST** `/api/v1/client/accept-appl/`
  - **Auth**: required (must be gig owner)
  - **Handler**: `client.views.AcceptGigApplication.post`
  - **Notes**: accepts one application, rejects others, closes gig.
  - **Request body**: `{ "application_id": <int> }`
  - **Success response (200)**:

```json
{
  "message": "Application Accepted",
  "your_freelancer": {
    "application_id": 77,
    "gig": { "uuid": "...", "title": "...", "status": "closed" },
    "freelancer": { "id": 2, "uuid": "...", "email": "...", "user_name": "...", "profile": { "bio": null, "skills": [], "hourly_rate": null, "created_at": "...", "updated_at": "..." } },
    "description": "I can do this…",
    "status": "ACCEPTED",
    "created_at": "2026-03-30T10:00:00Z",
    "contract": null
  }
}
```

- **PATCH** `/api/v1/client/close-gig/`
  - **Auth**: required (must be gig owner)
  - **Handler**: `client.views.CloseAGig.patch`
  - **Body**: `gig_id`

- **PATCH** `/api/v1/client/finish-gig-appl/`
  - **Auth**: required (must be gig owner)
  - **Handler**: `client.views.FinishApplication.patch`
  - **Body**: `application_id`

- **POST** `/api/v1/client/feedback/`
  - **Auth**: public
  - **Handler**: `client.views.Feedback.post`

### Freelancer / applications (`/api/v1/freelancer/`)

- **POST** `/api/v1/freelancer/apply-gig/`
  - **Auth**: required
  - **Handler**: `freelancer.views.ApplyGig.post`
  - **Body**: `gig_id`, `description`
  - **Rules**:
    - cannot apply to your own gig
    - cannot apply twice to same gig
    - gig must be `status == "open"`
  - **Success response (200)**:

```json
{
  "message": "Application submitted successfully.",
  "application": {
    "application_id": 77,
    "gig_id": "3e1b1c8a-2a2d-4f7d-a6b7-9a7e8c9d0e1f",
    "freelancer": { "id": 2, "uuid": "...", "email": "...", "user_name": "...", "profile": { "bio": null, "skills": [], "hourly_rate": null, "created_at": "...", "updated_at": "..." } },
    "description": "I can do this…",
    "status": "PENDING",
    "created_at": "2026-03-30T10:00:00Z",
    "gig": { "uuid": "...", "title": "...", "status": "open" },
    "contract": null
  }
}
```

- **POST** `/api/v1/freelancer/cancel-appl/`
  - **Auth**: required
  - **Handler**: `freelancer.views.CancelApplication.post`
  - **Body**: `application_id`
  - **Notes**: sets status to `CANCELLED` (does not delete).
  - **Success response (200)**: `{ "message": "Application cancelled successfully." }`

- **GET** `/api/v1/freelancer/applied-gigs/`
  - **Auth**: required
  - **Handler**: `freelancer.views.ViewAllAppliedApplication.get`

### Chat (`/api/v1/chat/`)

- **POST** `/api/v1/chat/create-get-room/`
  - **Auth**: required
  - **Handler**: `chatApp.views.CreateorGetChatRoomView.post`
  - **Body**: `user_id` (numeric DB id of the other user)
  - **Returns**: existing room or creates a new one.
  - **Success response (200/201)**: `ChatRoomSerializer`:

```json
{
  "uuid": "8b2a3b7d-8b1e-4c3a-9c3e-8d1a2b3c4d5e",
  "chat_room_name": "Chat between alice and bob",
  "user1": { "id": 1, "uuid": "...", "email": "...", "user_name": "alice", "profile": { "bio": null, "skills": [], "hourly_rate": null, "created_at": "...", "updated_at": "..." } },
  "user2": { "id": 2, "uuid": "...", "email": "...", "user_name": "bob", "profile": { "bio": null, "skills": [], "hourly_rate": null, "created_at": "...", "updated_at": "..." } },
  "is_active": true,
  "created_at": "2026-03-30T10:00:00Z",
  "chat_room_slug": "user-1-user-2"
}
```

- **GET** `/api/v1/chat/get-room/`
  - **Auth**: required
  - **Handler**: `chatApp.views.GetChatRoomView.get`
  - **Query param**: `room_slug`
  - **Notes**: requester must be one of the two room members.

- **GET** `/api/v1/chat/messages/`
  - **Auth**: required
  - **Handler**: `chatApp.views.ChatMessageListView.get`
  - **Query param**: `room_slug`

- **POST** `/api/v1/chat/send-message/`
  - **Auth**: required
  - **Handler**: `chatApp.views.SendMessageView.post`
  - **Body**: `chat_room` (slug), `message`
  - **Success response (201)**: `ChatMessageSerializer`:

```json
{
  "uuid": "a1b2c3d4-e5f6-4a1b-9c8d-7e6f5a4b3c2d",
  "chat_room": 5,
  "message": "hello",
  "sender": { "id": 1, "uuid": "...", "email": "...", "user_name": "alice", "profile": { "bio": null, "skills": [], "hourly_rate": null, "created_at": "...", "updated_at": "..." } },
  "created_at": "2026-03-30T10:00:00Z"
}
```

- **GET** `/api/v1/chat/user-chats/`
  - **Auth**: required
  - **Handler**: `chatApp.views.GetUserChatRoomsView.get`

### Portfolio (`/api/v1/portfolio/`)

From `portfolio/urls.py`:

- **GET** `/api/v1/portfolio/`
  - **Auth**: public
  - **Handler**: `portfolio.views.PortfolioListView.get`
  - **Query**: `search`, `location`, `min_rate`, `max_rate`, `skills` (comma-separated)

- **POST** `/api/v1/portfolio/create/`
  - **Auth**: required
  - **Handler**: `portfolio.views.PortfolioCreateView.post`

- **GET** `/api/v1/portfolio/my/`
  - **Auth**: required
  - **Handler**: `portfolio.views.PortfolioMyView.get`

- **PUT** `/api/v1/portfolio/update/`
  - **Auth**: required
  - **Handler**: `portfolio.views.PortfolioUpdateView.put`

- **DELETE** `/api/v1/portfolio/delete/`
  - **Auth**: required
  - **Handler**: `portfolio.views.PortfolioDeleteView.delete`

- **GET** `/api/v1/portfolio/<portfolio_id>/`
  - **Auth**: public
  - **Handler**: `portfolio.views.PortfolioDetailView.get`

- **GET** `/api/v1/portfolio/<user_id>/reviews/`
  - **Auth**: public
  - **Handler**: `portfolio.views.UserReviewView.get`

- **POST** `/api/v1/portfolio/<user_id>/reviews/`
  - **Auth**: required (enforced in view)
  - **Handler**: `portfolio.views.UserReviewView.post`

### Contracts (`/api/v1/contracts/`)

From `contracts/urls.py`:

- **GET** `/api/v1/contracts/`
  - **Auth**: required
  - **Handler**: `contracts.views.ContractListView.get`
  - **Query**: `status` (optional)

- **POST** `/api/v1/contracts/create/`
  - **Auth**: required
  - **Handler**: `contracts.views.ContractCreateView.post`
  - **Notes**: supports creating from accepted `application_id` OR draft contract without application (if `application_id` not present).
  - **Request body option A (from application)**: `ContractCreateSerializer`
    - `application_id` (int, required)
    - `title`, `description`, `services_offered` (strings)
    - `start_date`, `delivery_date`, `expiry_date` (dates `YYYY-MM-DD`)
    - `total_amount` (number), `currency` (string(3), optional)
    - `deliverables`, `acceptance_criteria` (strings)
    - optional: `communication_preferences`, `intellectual_property_rights`, `confidentiality_terms`, `dispute_resolution`, `termination_clauses`
    - optional: `milestones` (array of `{ title, description, amount, due_date }`)
  - **Request body option B (draft without application)**: `ContractCreateWithoutApplicationSerializer`
    - same fields as above **minus** `application_id`
  - **Success response (201)**:

```json
{
  "message": "Contract created successfully",
  "contract": {
    "uuid": "d2d2d2d2-1111-2222-3333-444444444444",
    "status": "pending_client_approval",
    "client": { "id": 1, "uuid": "...", "email": "...", "user_name": "alice", "profile": { "bio": null, "skills": [], "hourly_rate": null, "created_at": "...", "updated_at": "..." } },
    "freelancer": { "id": 2, "uuid": "...", "email": "...", "user_name": "bob", "profile": { "bio": null, "skills": [], "hourly_rate": null, "created_at": "...", "updated_at": "..." } },
    "title": "Landing page contract",
    "total_amount": "500.00",
    "currency": "USD",
    "milestones": [
      { "uuid": "...", "title": "Design", "amount": "200.00", "status": "pending", "due_date": "2026-04-05" }
    ],
    "days_remaining": 10,
    "is_overdue": false,
    "can_accept": true,
    "can_reject": true,
    "can_complete": false
  }
}
```

- **GET** `/api/v1/contracts/stats/`
  - **Auth**: required
  - **Handler**: `contracts.views.ContractStatsView.get`

- **GET** `/api/v1/contracts/available-applications/`
  - **Auth**: required
  - **Handler**: `contracts.views.AvailableApplicationsView.get`

- **GET** `/api/v1/contracts/<uuid>/`
  - **Auth**: required (must be client or freelancer for that contract)
  - **Handler**: `contracts.views.ContractDetailView.get`

- **GET** `/api/v1/contracts/<uuid>/history/`
  - **Auth**: required (must be party)
  - **Handler**: `contracts.views.ContractHistoryView.get`

- **POST** `/api/v1/contracts/<uuid>/accept/`
  - **Auth**: required (party-specific status transitions)
  - **Handler**: `contracts.views.ContractAcceptView.post`
  - **Request body**: `{ "comment": "..." }` (optional)
  - **Rules**:
    - client can accept only when `status == "pending_client_approval"`
    - freelancer can accept only when `status == "pending_freelancer_approval"`

- **POST** `/api/v1/contracts/<uuid>/reject/`
  - **Auth**: required
  - **Handler**: `contracts.views.ContractRejectView.post`
  - **Request body**: `{ "reason": "..." }` (required)

- **POST** `/api/v1/contracts/<uuid>/complete/`
  - **Auth**: required
  - **Handler**: `contracts.views.ContractCompleteView.post`
  - **Request body**: `{ "completion_note": "..." }` (optional)

#### Drafts

- **GET** `/api/v1/contracts/<uuid>/draft/` → `ContractDraftView.get`
- **POST** `/api/v1/contracts/<uuid>/create-draft/` → `ContractCreateDraftView.post`
- **POST** `/api/v1/contracts/<uuid>/approve-draft/` → `ContractApproveDraftView.post`
- **POST** `/api/v1/contracts/<uuid>/reject-draft/` → `ContractRejectDraftView.post`
- **POST** `/api/v1/contracts/<uuid>/cancel-draft/` → `ContractCancelDraftView.post`

#### Milestones

- **GET** `/api/v1/contracts/<uuid>/milestones/` → `MilestoneListView.get`
- **POST** `/api/v1/contracts/<uuid>/milestones/create/` → `MilestoneCreateView.post`
- **GET** `/api/v1/contracts/<uuid>/milestones/<milestone_uuid>/` → `MilestoneDetailView.get`
- **POST** `/api/v1/contracts/<uuid>/milestones/<milestone_uuid>/complete/` → `MilestoneCompleteView.post`
- **POST** `/api/v1/contracts/<uuid>/milestones/<milestone_uuid>/approve/` → `MilestoneApproveView.post`
- **POST** `/api/v1/contracts/<uuid>/milestones/<milestone_uuid>/reject/` → `MilestoneRejectView.post`

#### Disputes

- **GET** `/api/v1/contracts/<uuid>/disputes/` → `DisputeListView.get`
- **POST** `/api/v1/contracts/<uuid>/disputes/create/` → `DisputeCreateView.post`
  - **Request body**: `{ "dispute_type": "...", "title": "...", "description": "...", "evidence": "..." }` (`evidence` optional)
- **GET** `/api/v1/contracts/<uuid>/disputes/<dispute_uuid>/` → `DisputeDetailView.get`
- **POST** `/api/v1/contracts/<uuid>/disputes/<dispute_uuid>/close/` → `DisputeCloseView.post`

#### Progress updates

- **POST** `/api/v1/contracts/<uuid>/request-progress-update/`
  - **Auth**: required (client only; contract must be active; rate-limited)
  - **Handler**: `contracts.views.ContractRequestProgressUpdateView.post`
  - **Request body**: `{ "request_message": "..." }`
  - **Errors**:
    - `403` `{ "error": "Only the client can request progress updates" }`
    - `400` `{ "error": "Progress updates can only be requested for active contracts" }`
    - `429` `{ "error": "You can only request 3 progress updates per day per contract" }`

## WebSocket endpoints (Chat)

Websocket routes are defined in `chatApp/routing.py` and mounted by `assuredgig_backend/asgi.py`.

- **WS** `ws/chat/<room_slug>/`
- **WS** `api/v1/ws/chat/<room_slug>/`

Auth:

- Query string token: `?token=<access_token>`
  - Example: `wss://<host>/ws/chat/<room_slug>/?token=<JWT>`
- Or header: `Authorization: Bearer <access_token>`

The consumer is `chatApp.consumers.ChatConsumer`.

