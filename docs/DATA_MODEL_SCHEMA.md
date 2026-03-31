# AssuredGig Backend — Data models / schema

This document is the **source-of-truth schema reference** for the current codebase. It is derived from the Django models in:

- `users/models.py`
- `client/models.py`
- `freelancer/models.py`
- `contracts/models.py`
- `chatApp/models.py`
- `portfolio/models.py`

Notes:

- **Primary keys**: unless otherwise noted, Django uses an auto-increment integer primary key (`id`).
- **UUIDs**: most entities also have a `uuid` field (`UUIDField`, unique) used by the API.
- **User model**: the project uses a custom user model (`AUTH_USER_MODEL = "users.User"`).

## Users

### `users.User`

Represents an account (client or freelancer; roles are enforced by endpoint rules rather than a dedicated “role” field).

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | Django default PK |
| `uuid` | uuid | no | Unique; default `uuid4`; `editable=False` |
| `email` | email | yes | Unique; `USERNAME_FIELD` |
| `user_name` | string(20) | no | Unique; `default=None` in code (but field itself is non-null) |
| `date_joined` | date | yes | `auto_now=True` |
| `is_active` | bool | no | Default `True` |
| `is_staff` | bool | no | Default `False` |
| `is_superuser` | bool | no | Default `False` |
| `phone_number` | string(20) | yes | Unique |
| `mfa_hash` | string(40) | yes | Default random base32 |
| `signup_scheme` | choice | no | `email` / `phone` |
| `invited_by` | FK → `users.User` | yes | `on_delete=SET_NULL` |
| `verified` | bool | no | Default `False` |

Relationships:

- **1:1** `profile` → `users.UserProfile` (reverse relation name: `profile`)
- **1:1** `portfolio_profile` → `portfolio.PortfolioProfile` (reverse relation name: `portfolio_profile`)
- **1:N** `applications` → `freelancer.ApplicationModel` (reverse relation name: `applications`)
- **1:N** `client_contracts` → `contracts.Contract` (reverse relation name: `client_contracts`)
- **1:N** `freelancer_contracts` → `contracts.Contract` (reverse relation name: `freelancer_contracts`)
- **1:N** `sent_messages` → `chatApp.ChatMessage` (reverse relation name: `sent_messages`)
- **1:N** `received_reviews` / `given_reviews` → `portfolio.UserReview`

### `users.UserProfile`

Profile extension for a user.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `user` | 1:1 → `users.User` | no | `related_name="profile"` |
| `profile_picture` | image | yes | Stored under `profile_pictures/` |
| `bio` | text | yes | |
| `skills` | JSON (list) | no | Default `[]` |
| `hourly_rate` | decimal(10,2) | yes | |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |

### `users.PasswordResetOTP`

OTP record for password reset flow.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `user` | FK → `users.User` | no | |
| `otp` | string(6) | no | |
| `created_at` | datetime | no | `auto_now_add=True` |
| `is_authenticated` | bool | no | Default `False` |
| `is_used_at` | datetime | yes | Time OTP was used |

Index:

- (`user`, `otp`)

## Client / gigs

### `client.ClientPost`

Gig / job post created by a client.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `client` | FK → `users.User` | no | “owner” of gig |
| `client_name` | string(77) | no | Denormalized display name |
| `title` | string(200) | no | |
| `description` | text | no | |
| `category` | string(100) | yes | |
| `budget` | decimal(10,2) | no | |
| `project_type` | choice | no | `fixed` / `hourly` |
| `duration` | string(100) | yes | |
| `skills_required` | JSON (list) | no | Default `[]` |
| `location` | string(100) | yes | |
| `difficulty` | choice | yes | `beginner` / `intermediate` / `expert` |
| `verified` | bool | no | Default `False` |
| `featured` | bool | no | Default `False` |
| `deadline` | date | yes | |
| `status` | choice | no | `open` / `closed` (default `open`) |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |

Relationships:

- **1:N** `applications` → `freelancer.ApplicationModel` (reverse relation name: `applications`)
- **1:N** `contracts` → `contracts.Contract` (reverse relation name: `contracts`)

### `client.FeedbackModel`

Public feedback submission.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `email` | email | no | |
| `message` | text | no | |
| `name` | string(255) | no | |
| `created_at` | datetime | no | `auto_now_add=True` |

Ordering: `-created_at`

## Freelancer / applications

### `freelancer.ApplicationModel`

Represents a freelancer applying to a gig.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | Often exposed as `application_id` |
| `uuid` | uuid | no | Unique |
| `gig_id` | FK → `client.ClientPost` | no | `related_name="applications"` |
| `freelancer` | FK → `users.User` | no | `related_name="applications"` |
| `created_at` | datetime | no | `auto_now_add=True` |
| `status` | choice | no | `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `FINISHED` |
| `description` | text | yes | |

Relationship:

- **0..1:1** `contract` → `contracts.Contract` (reverse relation name: `contract`, via `Contract.application`)

## Contracts

### `contracts.Contract`

Work agreement between a client and a freelancer.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `application` | 1:1 → `freelancer.ApplicationModel` | yes | Links to accepted application; may be null for draft contracts |
| `gig` | FK → `client.ClientPost` | yes | Null for draft contracts |
| `client` | FK → `users.User` | no | `related_name="client_contracts"` |
| `freelancer` | FK → `users.User` | no | `related_name="freelancer_contracts"` |
| `title` | string(200) | no | |
| `description` | text | no | |
| `services_offered` | text | no | |
| `start_date` | date | no | |
| `delivery_date` | date | no | |
| `expiry_date` | date | no | Auto-expire if pending past this date |
| `total_amount` | decimal(10,2) | no | |
| `currency` | string(3) | no | Default `USD` |
| `deliverables` | text | no | |
| `acceptance_criteria` | text | no | |
| `communication_preferences` | text | yes | |
| `intellectual_property_rights` | text | yes | |
| `confidentiality_terms` | text | yes | |
| `dispute_resolution` | text | yes | |
| `termination_clauses` | text | yes | |
| `status` | choice | no | `draft`, `pending_client_approval`, `pending_freelancer_approval`, `active`, `completed`, `disputed`, `cancelled`, `expired` |
| `progress_percentage` | int | no | Default `0`; auto-calculated if milestones exist |
| `escrow_status` | choice | no | `pending`, `deposited`, `released`, `refunded` |
| `escrow_amount` | decimal(10,2) | yes | |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |
| `client_approved_at` | datetime | yes | |
| `freelancer_approved_at` | datetime | yes | |
| `completed_at` | datetime | yes | |

Relationships:

- **1:N** `milestones` → `contracts.ContractMilestone`
- **1:N** `update_history` → `contracts.ContractUpdateHistory`
- **1:N** `disputes` → `contracts.ContractDispute`

### `contracts.ContractMilestone`

Milestones within a contract.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `contract` | FK → `contracts.Contract` | no | `related_name="milestones"` |
| `title` | string(200) | no | |
| `description` | text | no | |
| `amount` | decimal(10,2) | no | |
| `due_date` | date | no | |
| `status` | choice | no | `pending`, `in_progress`, `completed`, `approved`, `rejected` |
| `completed_at` | datetime | yes | |
| `approved_at` | datetime | yes | |
| `approved_by` | FK → `users.User` | yes | `on_delete=SET_NULL` |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |

### `contracts.ContractUpdateHistory`

Audit log for contract events and draft/change requests.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `contract` | FK → `contracts.Contract` | no | |
| `updated_by` | FK → `users.User` | no | |
| `update_type` | choice | no | See `UPDATE_TYPES` in model |
| `is_update_request` | bool | no | Default `False` |
| `requested_changes` | JSON | yes | |
| `approval_status` | choice | yes | `pending` / `approved` / `rejected` |
| `approved_by` | FK → `users.User` | yes | `on_delete=SET_NULL` |
| `approved_at` | datetime | yes | |
| `milestone` | FK → `contracts.ContractMilestone` | yes | `on_delete=SET_NULL` |
| `draft_*` fields | mixed | yes | Draft snapshot fields; see model for full list |
| `draft_milestones` | JSON array | yes | Array of draft milestone objects |
| `created_at` | datetime | no | `auto_now_add=True` |

### `contracts.ContractDispute`

Dispute raised by either contract party.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `contract` | FK → `contracts.Contract` | no | |
| `raised_by` | FK → `users.User` | no | |
| `dispute_type` | choice | no | `quality`, `timeline`, `payment`, `communication`, `scope`, `other` |
| `title` | string(200) | no | |
| `description` | text | no | |
| `evidence` | text | yes | |
| `status` | choice | no | `open`, `under_review`, `closed` |
| `resolution` | text | yes | |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |
| `closed_at` | datetime | yes | |

## Chat

### `chatApp.ChatRoom`

1:1 chat room between two users.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `chat_room_name` | string(100) | no | |
| `user1` | FK → `users.User` | yes | `related_name="user1_chat_rooms"` |
| `user2` | FK → `users.User` | yes | `related_name="user2_chat_rooms"` |
| `is_active` | bool | no | Default `True` |
| `created_at` | datetime | no | `auto_now_add=True` |
| `chat_room_slug` | slug(100) | no | Unique; auto-generated |

### `chatApp.ChatMessage`

Message inside a chat room.

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `chat_room` | FK → `chatApp.ChatRoom` | no | `related_name="messages"` |
| `message` | text | no | |
| `sender` | FK → `users.User` | no | |
| `created_at` | datetime | no | `auto_now_add=True` |

Ordering: `created_at` ascending

## Portfolio

### `portfolio.PortfolioProfile`

Freelancer portfolio profile (distinct from `users.UserProfile`).

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `user` | 1:1 → `users.User` | no | `related_name="portfolio_profile"` |
| `title` | string(200) | yes | |
| `location` | string(100) | yes | |
| `response_time` | string(50) | no | Default `"Within 24 hours"` |
| `is_online` | bool | no | Default `False` |
| `verified` | bool | no | Default `False` |
| `member_since` | date | no | `auto_now_add=True` |
| `completed_projects` | int | no | Default `0` |
| `view_count` | int | no | Default `0` |
| `links` | text | yes | Comma-separated links |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |

### `portfolio.PortfolioSkill`

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `user` | FK → `users.User` | no | `related_name="portfolio_skills"` |
| `name` | string(100) | no | |
| `category` | choice | no | `frontend`, `backend`, `design`, `database`, `cloud`, `mobile`, `other` |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |

Uniqueness: (`user`, `name`)

### `portfolio.PortfolioLanguage`

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `user` | FK → `users.User` | no | `related_name="portfolio_languages"` |
| `name` | string(50) | no | |
| `proficiency` | choice | no | `native`, `conversational`, `basic` |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |

Uniqueness: (`user`, `name`)

### `portfolio.PortfolioProject`

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `user` | FK → `users.User` | no | `related_name="portfolio_projects"` |
| `title` | string(200) | no | |
| `category` | string(100) | no | |
| `description` | text | no | |
| `image` | image | yes | Upload path `portfolio_projects/` |
| `project_url` | url | yes | |
| `view_count` | int | no | Default `0` |
| `completion_date` | date | yes | |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |

### `portfolio.UserReview`

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `freelancer` | FK → `users.User` | no | `related_name="received_reviews"` |
| `client` | FK → `users.User` | no | `related_name="given_reviews"` |
| `rating` | int | no | 1–5 |
| `comment` | text | no | |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |

Uniqueness: (`freelancer`, `client`)

### `portfolio.PortfolioCertification`

| Field | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | int (PK) | no | |
| `uuid` | uuid | no | Unique |
| `user` | FK → `users.User` | no | `related_name="portfolio_certifications"` |
| `name` | string(200) | no | |
| `organization` | string(200) | no | |
| `issue_date` | date | no | |
| `expiry_date` | date | yes | |
| `certificate_url` | url | yes | |
| `created_at` | datetime | no | `auto_now_add=True` |
| `updated_at` | datetime | no | `auto_now=True` |

