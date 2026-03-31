# AssuredGig Backend — WebSocket message protocol (chat)

This is the **wire protocol** for realtime chat as implemented by `chatApp/consumers.py` (`ChatConsumer`).

## Endpoints

The websocket routes are defined in `chatApp/routing.py` and mounted by `assuredgig_backend/asgi.py`.

- **WS** `ws/chat/<room_slug>/`
- **WS** `api/v1/ws/chat/<room_slug>/`

`room_slug` is the `ChatRoom.chat_room_slug` string (see `docs/DATA_MODEL_SCHEMA.md`).

## Authentication

The consumer authenticates via **JWT access token** passed on the websocket URL:

- Query string: `?token=<access_token>`

Example (local):

- `ws://127.0.0.1:8000/ws/chat/user-1-user-2/?token=<JWT>`

Auth behavior:

- If `token` is missing/invalid → connection is closed.
- If the room slug does not exist → connection is closed.
- If the room is inactive (`ChatRoom.is_active == false`) → connection is closed.
- If the authenticated user is not `room.user1` or `room.user2` → connection is closed.

## Message types and payloads

### Client → server: send message

**Text frame** containing JSON:

```json
{ "message": "hello" }
```

Notes:

- The consumer currently expects exactly a top-level `message` key.
- No `type` field is used for incoming messages.
- Errors during processing are logged server-side; the consumer does not currently emit structured error frames.

### Server → clients: broadcast message

When the server receives a client message, it:

1. Creates a `ChatMessage` row (`chat_room`, `sender`, `message`).
2. Serializes it using `chatApp.serializers.ChatMessageSerializer`.
3. Broadcasts the serialized JSON to **both** room participants via the channel group.

**Text frame** containing the serialized `ChatMessageSerializer` output:

```json
{
  "uuid": "a1b2c3d4-e5f6-4a1b-9c8d-7e6f5a4b3c2d",
  "chat_room": 5,
  "message": "hello",
  "sender": {
    "id": 1,
    "uuid": "…",
    "email": "…",
    "user_name": "alice",
    "phone_number": null,
    "verified": false,
    "date_joined": "2026-03-30",
    "profile": {
      "profile_picture": null,
      "bio": null,
      "skills": [],
      "hourly_rate": null,
      "created_at": "…",
      "updated_at": "…"
    }
  },
  "created_at": "2026-03-30T10:00:00Z"
}
```

Important: there is **no wrapping envelope** for server messages (no `{ type: "chat_message", ... }`). The client should treat every incoming frame as a `ChatMessage` payload.

## Ordering / history

- Realtime messages are broadcast in send order.
- Persisted history can be fetched via REST:
  - `GET /api/v1/chat/messages/?room_slug=<room_slug>` (returns messages ordered by `created_at` ascending)

