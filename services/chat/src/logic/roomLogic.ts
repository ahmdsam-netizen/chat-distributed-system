import prisma from "../lib/prisma";
import { publishEvent } from "../lib/redisPublisher";

export async function createRoom(
  user: { id: string; username: string },
  data: { roomname: string; description?: string }
) {
  const existingRoom = await prisma.room.findFirst({
    where: { roomname: data.roomname },
  });

  if (existingRoom) {
    throw new Error("Room already exists");
  }

  const now = new Date();
  const room = await prisma.room.create({
    data: {
      roomname: data.roomname,
      description: data.description ?? "",
      created_by: user.username,
      created_at: now,
      members: {
        create: {
          user_id: user.id,
          joined_at: now,
        },
      },
    },
  });

  const systemMessage = await prisma.roomMessage.create({
    data: {
      content: `${user.username} created room #${room.roomname}`,
      type: "system",
      sent_at: now,
      room_id: room.id,
      user_id: user.id,
    },
  });

  const payload = {
    id: systemMessage.id,
    event_type: "chat",
    chat_type: "room",
    type: "system",
    from: "system",
    text: systemMessage.content,
    to: room.roomname,
    sent_at: systemMessage.sent_at,
    member_change: "join",
    member: {
      id: user.id,
      username: user.username,
      joined_at: now.toISOString(),
    },
  };

  await publishEvent(`room:${room.id}`, payload);

  return {
    roomname: room.roomname,
    roomId: room.id,
  };
}

export async function joinRoom(
  user: { id: string; username: string },
  data: { roomname: string }
) {
  const existingRoom = await prisma.room.findFirst({
    where: { roomname: data.roomname },
  });

  if (!existingRoom) {
    throw new Error("Room doesn't exist");
  }

  const existingMember = await prisma.roomMember.findUnique({
    where: {
      user_id_room_id: {
        user_id: user.id,
        room_id: existingRoom.id,
      },
    },
  });

  if (existingMember) {
    throw new Error("Already a member");
  }

  const joinTime = new Date();
  await prisma.roomMember.create({
    data: {
      user_id: user.id,
      room_id: existingRoom.id,
      joined_at: joinTime,
    },
  });

  const systemMessage = await prisma.roomMessage.create({
    data: {
      content: `${user.username} joined the room`,
      type: "system",
      sent_at: joinTime,
      room_id: existingRoom.id,
      user_id: user.id,
    },
  });

  const payload = {
    id: systemMessage.id,
    event_type: "chat",
    chat_type: "room",
    type: "system",
    from: "system",
    text: systemMessage.content,
    to: existingRoom.roomname,
    sent_at: systemMessage.sent_at,
    member_change: "join",
    member: {
      id: user.id,
      username: user.username,
      joined_at: joinTime.toISOString(),
    },
  };

  await publishEvent(`room:${existingRoom.id}`, payload);

  return {
    roomname: existingRoom.roomname,
    roomId: existingRoom.id,
  };
}

export async function leaveRoom(
  user: { id: string; username: string },
  data: { roomname: string }
) {
  const existingRoom = await prisma.room.findFirst({
    where: { roomname: data.roomname },
  });

  if (!existingRoom) {
    throw new Error("Room doesn't exist");
  }

  const existingMember = await prisma.roomMember.findUnique({
    where: {
      user_id_room_id: {
        user_id: user.id,
        room_id: existingRoom.id,
      },
    },
  });

  if (!existingMember) {
    throw new Error("Not a member of this group");
  }

  const leaveTime = new Date();
  const systemMessage = await prisma.roomMessage.create({
    data: {
      content: `${user.username} left the room`,
      type: "system",
      sent_at: leaveTime,
      room_id: existingRoom.id,
      user_id: user.id,
    },
  });

  await prisma.roomMember.delete({
    where: {
      user_id_room_id: {
        user_id: user.id,
        room_id: existingRoom.id,
      },
    },
  });

  const payload = {
    id: systemMessage.id,
    event_type: "chat",
    chat_type: "room",
    type: "system",
    from: "system",
    text: systemMessage.content,
    to: existingRoom.roomname,
    sent_at: systemMessage.sent_at,
    member_change: "leave",
    member: {
      id: user.id,
      username: user.username,
    },
  };

  await publishEvent(`room:${existingRoom.id}`, payload);

  const remainingMembersCount = await prisma.roomMember.count({
    where: { room_id: existingRoom.id },
  });

  let deleted = false;
  if (remainingMembersCount === 0) {
    await prisma.roomMessage.deleteMany({
      where: { room_id: existingRoom.id },
    });
    await prisma.room.delete({
      where: { id: existingRoom.id },
    });

    const deletePayload = {
      event_type: "room_deleted",
      roomname: existingRoom.roomname,
      roomId: existingRoom.id,
    };

    await publishEvent("global:rooms", deletePayload);
    deleted = true;
    console.log(`✅ Room '${existingRoom.roomname}' deleted (0 members remaining)`);
  }

  return {
    roomname: existingRoom.roomname,
    roomId: existingRoom.id,
    deleted,
  };
}

export async function listRooms(user: { id: string }, filter: string = "") {
  const rooms = await prisma.room.findMany({
    where: {
      roomname: { contains: filter, mode: "insensitive" },
    },
    include: {
      _count: { select: { members: true } },
      members: {
        where: { user_id: user.id },
        select: { id: true },
      },
    },
  });

  return rooms.map((room) => ({
    roomname: room.roomname,
    description: room.description,
    admin: room.created_by,
    created_at: room.created_at,
    members: room._count.members,
    isMember: room.members.length > 0,
  }));
}

export async function getRoomMembers(
  user: { id: string },
  roomname: string
) {
  const room = await prisma.room.findFirst({
    where: {
      roomname,
      members: {
        some: {
          user_id: user.id,
        },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      },
    },
  });

  if (!room) {
    throw new Error("Room does not exist or not a member");
  }

  return {
    roomname: room.roomname,
    members: room.members.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      joined_at: m.joined_at,
    })),
  };
}

export async function getUserRooms(userId: string) {
  const memberships = await prisma.roomMember.findMany({
    where: { user_id: userId },
    include: { room: true },
  });

  return memberships.map((m) => ({
    id: m.room.id,
    roomname: m.room.roomname,
  }));
}
