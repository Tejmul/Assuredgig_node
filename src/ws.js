const url = require('url');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const { prisma } = require('./prisma');
const { serializeMessage } = require('./serializers/chat');

function accessSecret() {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('JWT_ACCESS_SECRET is required');
  return s;
}

async function authenticateFromRequest(req) {
  const parsed = url.parse(req.url, true);
  let token = parsed.query?.token;
  if (!token) {
    const auth = req.headers.authorization || '';
    const [kind, t] = auth.split(/\s+/);
    if (kind === 'Bearer' && t) token = t;
  }

  if (!token) return null;

  try {
    const payload = jwt.verify(String(token), accessSecret());
    const userId = Number(payload.sub);
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}

async function getRoomFromPath(req) {
  // Supported:
  // - /ws/chat/<room_slug>/
  // - /api/v1/ws/chat/<room_slug>/
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname || '';
  const match = path.match(/\/ws\/chat\/([^/]+)\/?$/) || path.match(/\/api\/v1\/ws\/chat\/([^/]+)\/?$/);
  if (!match) return null;
  const roomSlug = match[1];
  const room = await prisma.chatRoom.findUnique({ where: { chatRoomSlug: roomSlug } });
  return room;
}

function attachWebsocketServer(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer });

  const roomClients = new Map(); // roomId => Set(ws)

  function addClient(roomId, ws) {
    if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
    roomClients.get(roomId).add(ws);
  }

  function removeClient(roomId, ws) {
    const set = roomClients.get(roomId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) roomClients.delete(roomId);
  }

  function broadcast(roomId, payload) {
    const set = roomClients.get(roomId);
    if (!set) return;
    const text = JSON.stringify(payload);
    for (const client of set) {
      if (client.readyState === WebSocket.OPEN) client.send(text);
    }
  }

  wss.on('connection', async (ws, req) => {
    const user = await authenticateFromRequest(req);
    if (!user) return ws.close();

    const room = await getRoomFromPath(req);
    if (!room) return ws.close();
    if (!room.isActive) return ws.close();

    const member = room.user1Id === user.id || room.user2Id === user.id;
    if (!member) return ws.close();

    ws.__assuredgig = { userId: user.id, roomId: room.id };
    addClient(room.id, ws);

    ws.on('message', async (data) => {
      try {
        const raw = data.toString('utf8');
        const parsed = JSON.parse(raw);
        const message = parsed?.message;
        if (typeof message !== 'string' || message.trim().length === 0) return;

        const created = await prisma.chatMessage.create({
          data: { chatRoomId: room.id, senderId: user.id, message },
          include: { sender: { include: { profile: true } } }
        });

        // Per docs: no envelope; every frame is serialized ChatMessage
        const payload = serializeMessage(created);
        broadcast(room.id, payload);
      } catch {
        // Per docs: errors are logged server-side; no structured error frames yet.
      }
    });

    ws.on('close', () => {
      removeClient(room.id, ws);
    });
  });
}

module.exports = { attachWebsocketServer };

