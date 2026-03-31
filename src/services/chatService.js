function ensureNotSelfChat(requesterId, otherUserId) {
  if (otherUserId === requesterId) {
    const err = new Error('Cannot create chat room with yourself');
    err.status = 400;
    throw err;
  }
}

function computeRoomSlug(userIdA, userIdB) {
  const a = Math.min(userIdA, userIdB);
  const b = Math.max(userIdA, userIdB);
  return { a, b, slug: `user-${a}-user-${b}` };
}

async function findOtherUser(prisma, userId) {
  return prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
}

async function getRoomBySlug(prisma, slug) {
  return prisma.chatRoom.findUnique({
    where: { chatRoomSlug: slug },
    include: { user1: { include: { profile: true } }, user2: { include: { profile: true } } }
  });
}

async function createRoom(prisma, { requester, other }) {
  const { a, b, slug } = computeRoomSlug(requester.id, other.id);
  return prisma.chatRoom.create({
    data: {
      chatRoomName: `Chat between ${requester.userName} and ${other.userName}`,
      user1Id: a,
      user2Id: b,
      chatRoomSlug: slug
    },
    include: { user1: { include: { profile: true } }, user2: { include: { profile: true } } }
  });
}

function ensureRoomMembership(room, userId) {
  const member = room.user1Id === userId || room.user2Id === userId;
  if (!member) {
    const err = new Error('Not authorized to access this chat');
    err.status = 403;
    throw err;
  }
}

async function listRoomsForUser(prisma, userId) {
  return prisma.chatRoom.findMany({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    orderBy: { createdAt: 'desc' },
    include: { user1: { include: { profile: true } }, user2: { include: { profile: true } } }
  });
}

async function listMessagesForRoom(prisma, roomId) {
  return prisma.chatMessage.findMany({
    where: { chatRoomId: roomId },
    orderBy: { createdAt: 'asc' },
    include: { sender: { include: { profile: true } } }
  });
}

async function createMessage(prisma, { roomId, senderId, message }) {
  return prisma.chatMessage.create({
    data: { chatRoomId: roomId, senderId, message },
    include: { sender: { include: { profile: true } } }
  });
}

module.exports = {
  ensureNotSelfChat,
  computeRoomSlug,
  findOtherUser,
  getRoomBySlug,
  createRoom,
  ensureRoomMembership,
  listRoomsForUser,
  listMessagesForRoom,
  createMessage
};

