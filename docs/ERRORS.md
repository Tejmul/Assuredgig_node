# AssuredGig Backend — Error responses & domain rules

This document describes the **current** error formats and common domain-specific validation rules found in the codebase.

See also `docs/API_REFERENCE.md` for endpoint listings and example payloads.

## Error envelope shapes (current)

The API is not fully standardized yet; depending on the endpoint you may receive:

### A) Field errors (DRF serializer output)

- **Status**: `400`
- **Shape**: object keyed by field name → list of strings

```json
{ "email": ["Enter a valid email address."] }
```

### B) `error` + `details`

- **Status**: `400`, `403`, `404`, `429`, `500`

```json
{ "error": "Invalid contract data", "details": { "title": ["This field is required."] } }
```

### C) `message` + optionally `errors`

- **Status**: `400`, `403`, `404`, `500`

```json
{ "message": "Something went wrong", "errors": { "gig_id": ["gig_id must be a valid UUID."] } }
```

## Common domain errors (by feature)

### Freelancer applications (`/api/v1/freelancer/...`)

From `freelancer/views.py`:

- **Apply to own gig**
  - **Status**: `400`
  - **Body**: `{ "error": "You cannot apply to your own gig." }`
- **Apply twice to same gig**
  - **Status**: `400`
  - **Body**: `{ "error": "You have already applied to this gig." }`
- **Gig not open**
  - **Status**: `400`
  - **Body**: `{ "error": "This gig is not open for applications." }`
- **Gig not found**
  - **Status**: `404`
  - **Body**: `{ "error": "Gig not found." }`
- **Cancel application not found (or not owned)**
  - **Status**: `404`
  - **Body**: `{ "error": "Application not found." }`

### Client gigs (`/api/v1/client/...`)

From `client/views.py`:

- **Update gig not owned by user**
  - **Status**: `403`
  - **Body**: `{ "error": "You are not authorized to update this gig." }`
- **Delete gig not owned by user**
  - **Status**: `403`
  - **Body**: `{ "message": "You are not authorized to delete this gig" }`
- **Close gig not owned / not found**
  - **Status**: `404`
  - **Body**: `{ "error": "Gig not found or you are not authorized to close it" }`
- **Reject application not pending**
  - **Status**: `400`
  - **Body**: `{ "message": "Application must be in PENDING status to be rejected" }`
- **Accept application not pending**
  - **Status**: `400`
  - **Body**: `{ "message": "Application must be in PENDING status to be accepted" }`
- **Finish application not accepted**
  - **Status**: `400`
  - **Body**: `{ "message": "Application must be accepted before it can be finished" }`

### Contracts (`/api/v1/contracts/...`)

From `contracts/serializers.py` + `contracts/views.py`:

- **Create contract from application: not freelancer**
  - **Status**: `400`
  - **Body**: `"Only the freelancer can create contracts for their applications"`
- **Create contract: application missing**
  - **Status**: `400`
  - **Body**: `"Application not found"`
- **Create contract: already exists**
  - **Status**: `400`
  - **Body**: `"Contract already exists for this application"`

- **Contract detail/update/history: not a party**
  - **Status**: `403`
  - **Body**: `{ "error": "You are not authorized to view this contract" }` (or similar per endpoint)

- **Accept contract: wrong status**
  - **Status**: `400`
  - **Body**: `"Contract is not pending client approval"` / `"Contract is not pending freelancer approval"`

- **Complete contract: only freelancer**
  - **Status**: `400`
  - **Body**: `"Only the freelancer can complete the contract"`

- **Progress update request: only client**
  - **Status**: `403`
  - **Body**: `{ "error": "Only the client can request progress updates" }`
- **Progress update request: contract not active**
  - **Status**: `400`
  - **Body**: `{ "error": "Progress updates can only be requested for active contracts" }`
- **Progress update request: rate limited**
  - **Status**: `429`
  - **Body**: `{ "error": "You can only request 3 progress updates per day per contract" }`

### Chat (`/api/v1/chat/...`, websockets)

From `chatApp/views.py`:

- **Create room with self**
  - **Status**: `400`
  - **Body**: `{ "error": "Cannot create chat room with yourself" }`
- **Access room/messages not a member**
  - **Status**: `403`
  - **Body**: `{ "error": "Not authorized to access this chat" }`
- **Send message not a member**
  - **Status**: `403`
  - **Body**: `{ "error": "Not authorized to send messages in this chat" }`

From `chatApp/consumers.py` (websocket):

- Connection is **closed** if token missing/invalid, room missing/inactive, or user is not a room member.
- Message receive errors are currently logged server-side; the consumer does not send structured error frames yet.

