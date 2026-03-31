const { z } = require('zod');

const { prisma } = require('../prisma');
const chatService = require('../services/chatService');
const chatSerializer = require('../serializers/chat');

async function createOrGetRoom(req, res, next) {
  try {
    const schema = z.object({ user_id: z.number().int() });
    const { user_id } = schema.parse(req.body);

    chatService.ensureNotSelfChat(req.user.id, user_id);

    const other = await chatService.findOtherUser(prisma, user_id);
    if (!other) return res.status(404).json({ error: 'User not found' });

    const { slug } = chatService.computeRoomSlug(req.user.id, other.id);
    const existing = await chatService.getRoomBySlug(prisma, slug);
    if (existing) return res.json(chatSerializer.serializeRoom(existing));

    const created = await chatService.createRoom(prisma, { requester: req.user, other });
    return res.status(201).json(chatSerializer.serializeRoom(created));
  } catch (e) {
    return next(e);
  }
}

async function getRoom(req, res, next) {
  try {
    const schema = z.object({ room_slug: z.string().min(1) });
    const { room_slug } = schema.parse(req.query);

    const room = await chatService.getRoomBySlug(prisma, room_slug);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    chatService.ensureRoomMembership(room, req.user.id);
    return res.json(chatSerializer.serializeRoom(room));
  } catch (e) {
    return next(e);
  }
}

async function listMessages(req, res, next) {
  try {
    const schema = z.object({ room_slug: z.string().min(1) });
    const { room_slug } = schema.parse(req.query);

    const room = await prisma.chatRoom.findUnique({ where: { chatRoomSlug: room_slug } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    chatService.ensureRoomMembership(room, req.user.id);
    const messages = await chatService.listMessagesForRoom(prisma, room.id);
    return res.json(messages.map(chatSerializer.serializeMessage));
  } catch (e) {
    return next(e);
  }
}

async function sendMessage(req, res, next) {
  try {
    const schema = z.object({
      chat_room: z.string().min(1),
      message: z.string().min(1)
    });
    const body = schema.parse(req.body);

    const room = await prisma.chatRoom.findUnique({ where: { chatRoomSlug: body.chat_room } });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    chatService.ensureRoomMembership(room, req.user.id);
    const msg = await chatService.createMessage(prisma, { roomId: room.id, senderId: req.user.id, message: body.message });
    return res.status(201).json(chatSerializer.serializeMessage(msg));
  } catch (e) {
    return next(e);
  }
}

async function userChats(req, res, next) {
  try {
    const rooms = await chatService.listRoomsForUser(prisma, req.user.id);
    return res.json(rooms.map(chatSerializer.serializeRoom));
  } catch (e) {
    return next(e);
  }
}

module.exports = { createOrGetRoom, getRoom, listMessages, sendMessage, userChats };

