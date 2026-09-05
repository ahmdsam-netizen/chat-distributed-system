import prisma from "../lib/prisma";
import { publishEvent } from "../lib/redisPublisher";

function validateMessage(text: string, maxLength: number = 5000): { valid: boolean; error?: string } {
  if (!text || typeof text !== "string") {
    return { valid: false, error: "Message must be a string" };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Message cannot be empty" };
  }
  if (trimmed.length > maxLength) {
    return { valid: false, error: `Message exceeds maximum length of ${maxLength} characters` };
  }
  return { valid: true };
}

export async function sendMessage(
  user: { id: string; username: string },
  data: {
    text: string;
    roomname: string;
    target_mode?: "all" | "to" | "not_to" | "not_to_all";
    target_users?: string[];
  }
) {
  const validation = validateMessage(data.text);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const member = await prisma.roomMember.findFirst({
    where: {
      user_id: user.id,
      room: { roomname: data.roomname },
    },
    include: { room: true },
  });

  if (!member) {
    throw new Error("Room does not exist or not a member");
  }

  const targetMode =
    data.target_mode === "to" || data.target_mode === "not_to" || data.target_mode === "not_to_all"
      ? data.target_mode
      : "all";

  const targetUsers = Array.isArray(data.target_users)
    ? data.target_users.filter((u) => typeof u === "string" && u.trim().length > 0)
    : [];

  const message = await prisma.roomMessage.create({
    data: {
      content: data.text,
      type: "chat",
      target_mode: targetMode,
      target_users: targetUsers,
      room_id: member.room.id,
      user_id: user.id,
    },
  });

  const payload = {
    id: message.id,
    event_type: "chat",
    chat_type: "room",
    type: "chat",
    target_mode: targetMode,
    target_users: targetUsers,
    from: user.username,
    text: message.content,
    to: member.room.roomname,
    sent_at: message.sent_at,
  };

  await publishEvent(`room:${member.room.id}`, payload);

  return {
    id: message.id,
    sent_at: message.sent_at,
    roomId: member.room.id,
  };
}

export async function sendTyping(
  user: { id: string; username: string },
  data: { roomname: string }
) {
  const member = await prisma.roomMember.findFirst({
    where: {
      user_id: user.id,
      room: { roomname: data.roomname },
    },
    include: { room: true },
  });

  if (!member) {
    throw new Error("Room does not exist or not a member");
  }

  const payload = {
    event_type: "typing",
    username: user.username,
    roomname: member.room.roomname,
  };

  await publishEvent(`room:${member.room.id}`, payload);
  return { success: true };
}

export async function getMessages(
  user: { id: string; username: string },
  data: { roomname: string; cursor?: string; limit?: number }
) {
  const member = await prisma.roomMember.findFirst({
    where: {
      user_id: user.id,
      room: { roomname: data.roomname },
    },
    include: { room: true },
  });

  if (!member) {
    throw new Error("Room does not exist or not a member");
  }

  const limit = Math.min(Math.max(Number(data.limit) || 30, 1), 100);
  const cursorDate = data.cursor ? new Date(data.cursor) : null;
  const currentUsername = user.username;

  const messages = await prisma.roomMessage.findMany({
    where: {
      room_id: member.room.id,
      sent_at: {
        gte: member.joined_at,
        ...(cursorDate ? { lt: cursorDate } : {}),
      },
      OR: [
        { type: "system" },
        { user_id: user.id },
        { target_mode: "all" },
        {
          target_mode: "to",
          target_users: { has: currentUsername },
        },
        {
          target_mode: "not_to",
          NOT: {
            target_users: { has: currentUsername },
          },
        },
      ],
    },
    include: { user: { select: { username: true } } },
    orderBy: { sent_at: "desc" },
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const chunk = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore && chunk.length > 0 ? chunk[chunk.length - 1].sent_at.toISOString() : null;

  chunk.reverse();

  return {
    roomname: member.room.roomname,
    messages: chunk.map((m) => ({
      id: m.id,
      type: m.type,
      target_mode: m.target_mode,
      target_users: m.target_users,
      content: m.content,
      sent_at: m.sent_at.toISOString(),
      sent_by: m.user?.username ?? (m.type === "system" ? "system" : "Unknown"),
      sent_to: member.room.roomname,
    })),
    hasMore,
    nextCursor,
    isInitial: !cursorDate,
  };
}
