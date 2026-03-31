const express = require('express');
const { z } = require('zod');

const { prisma } = require('../prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serializeUser(user) {
  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    user_name: user.userName,
    profile: user.profile
      ? {
          bio: user.profile.bio || null,
          skills: user.profile.skills || [],
          hourly_rate: user.profile.hourlyRate ? String(user.profile.hourlyRate) : null,
          created_at: user.profile.createdAt.toISOString(),
          updated_at: user.profile.updatedAt.toISOString()
        }
      : null
  };
}

function serializeRoom(room) {
  return {
    uuid: room.uuid,
    chat_room_name: room.chatRoomName,
    user1: room.user1 ? serializeUser(room.user1) : null,
    user2: room.user2 ? serializeUser(room.user2) : null,
    is_active: room.isActive,
    created_at: room.createdAt.toISOString(),
    chat_room_slug: room.chatRoomSlug
  };
}

function serializeMessage(msg) {
  return {
    uuid: msg.uuid,
    chat_room: msg.chatRoomId,
    message: msg.message,
    sender: msg.sender ? serializeUser(msg.sender) : undefined,
    created_at: msg.createdAt.toISOString()
  };
}

router.post('/create-get-room/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ user_id: z.number().int() });
    const { user_id } = schema.parse(req.body);
    if (user_id === req.user.id) return res.status(400).json({ error: 'Cannot create chat room with yourself' });

    const other = await prisma.user.findUnique({ where: { id: user_id }, include: { profile: true } });
    if (!other) return res.status(404).json({ error: 'User not found' });

    const a = Math.min(req.user.id, other.id);
    const b = Math.max(req.user.id, other.id);
    const slug = `user-${a}-user-${b}`;

    const existing = await prisma.chatRoom.findUnique({
      where: { chatRoomSlug: slug },
      include: { user1: { include: { profile: true } }, user2: { include: { profile: true } } }
    });
    if (existing) return res.json(serializeRoom(existing));

    const room = await prisma.chatRoom.create({
      data: {
        chatRoomName: `Chat between ${req.user.userName} and ${other.userName}`,
        user1Id: a,
        user2Id: b,
        chatRoomSlug: slug
      },
      include: { user1: { include: { profile: true } }, user2: { include: { profile: true } } }
    });

    return res.status(201).json(serializeRoom(room));
  } catch (e) {
    return next(e);
  }
});

router.get('/get-room/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ room_slug: z.string().min(1) });
    const { room_slug } = schema.parse(req.query);

    const room = await prisma.chatRoom.findUnique({
      where: { chatRoomSlug: room_slug },
      include: { user1: { include: { profile: true } }, user2: { include: { profile: true } } }
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const member = room.user1Id === req.user.id || room.user2Id === req.user.id;
    if (!member) return res.status(403).json({ error: 'Not authorized to access this chat' });

    return res.json(serializeRoom(room));
  } catch (e) {
    return next(e);
  }
});

router.get('/messages/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ room_slug: z.string().min(1) });
    const { room_slug } = schema.parse(req.query);

    const room = await prisma.chatRoom.findUnique({ where: { chatRoomSlug: room_slug } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const member = room.user1Id === req.user.id || room.user2Id === req.user.id;
    if (!member) return res.status(403).json({ error: 'Not authorized to access this chat' });

    const messages = await prisma.chatMessage.findMany({
      where: { chatRoomId: room.id },
      orderBy: { createdAt: 'asc' },
      include: { sender: { include: { profile: true } } }
    });
    return res.json(messages.map(serializeMessage));
  } catch (e) {
    return next(e);
  }
});

router.post('/send-message/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      chat_room: z.string().min(1),
      message: z.string().min(1)
    });
    const body = schema.parse(req.body);

    const room = await prisma.chatRoom.findUnique({ where: { chatRoomSlug: body.chat_room } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const member = room.user1Id === req.user.id || room.user2Id === req.user.id;
    if (!member) return res.status(403).json({ error: 'Not authorized to send messages in this chat' });

    const msg = await prisma.chatMessage.create({
      data: { chatRoomId: room.id, senderId: req.user.id, message: body.message },
      include: { sender: { include: { profile: true } } }
    });

    return res.status(201).json(serializeMessage(msg));
  } catch (e) {
    return next(e);
  }
});

router.get('/user-chats/', requireAuth, async (req, res, next) => {
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: { OR: [{ user1Id: req.user.id }, { user2Id: req.user.id }] },
      orderBy: { createdAt: 'desc' },
      include: { user1: { include: { profile: true } }, user2: { include: { profile: true } } }
    });
    return res.json(rooms.map(serializeRoom));
  } catch (e) {
    return next(e);
  }
});

module.exports = { router, serializeMessage, serializeUser };

