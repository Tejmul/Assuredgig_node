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

module.exports = { serializeUser, serializeRoom, serializeMessage };

