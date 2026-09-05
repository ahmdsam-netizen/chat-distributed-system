import { Server } from "socket.io";

export const eventHandlers = {
  typing: (io: Server, id: string, parsed: any) => {
    return io.to(id).emit("typing", parsed);
  },

  chat: (io: Server, id: string, parsed: any) => {
    if (
      parsed.target_mode === "to" ||
      parsed.target_mode === "not_to" ||
      parsed.target_mode === "not_to_all"
    ) {
      const roomSockets = io.sockets.adapter.rooms.get(id);
      if (roomSockets) {
        for (const socketId of roomSockets) {
          const sock = io.sockets.sockets.get(socketId);
          if (!sock) continue;
          const username = sock.data.username;
          const isSender = username === parsed.from;
          const isTarget =
            Array.isArray(parsed.target_users) && parsed.target_users.includes(username);

          let shouldDeliver = false;
          if (isSender) {
            shouldDeliver = true;
          } else if (parsed.target_mode === "to") {
            shouldDeliver = isTarget;
          } else if (parsed.target_mode === "not_to") {
            shouldDeliver = !isTarget;
          } else if (parsed.target_mode === "not_to_all") {
            shouldDeliver = false;
          }

          if (shouldDeliver) {
            sock.emit("chat", parsed);
          }
        }
        return;
      }
    }

    return io.to(id).emit("chat", parsed);
  },

  join: (io: Server, id: string, parsed: any) => {
    return io.to(id).emit("join", parsed);
  },

  leave: (io: Server, id: string, parsed: any) => {
    return io.to(id).emit("leave", parsed);
  },

  room_deleted: (io: Server, _id: string, parsed: any) => {
    return io.emit("room_deleted", parsed);
  },
};

export function routeRedisMessage(io: Server, message: string, channel: string) {
  try {
    const parsed = JSON.parse(message);
    const { event_type } = parsed;

    const id = channel.split(":").pop();
    if (!id) return;

    type EventKey = keyof typeof eventHandlers;
    const handler = eventHandlers[event_type as EventKey];

    if (!handler) {
      console.log(`No handler for event_type: ${event_type}`);
      return;
    }

    handler(io, id, parsed);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error processing Redis message on channel ${channel}:`, msg);
  }
}
