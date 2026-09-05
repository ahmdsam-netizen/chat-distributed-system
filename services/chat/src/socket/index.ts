import { Server, Socket } from "socket.io";
import { parseCookies, verifyToken, AUTH_COOKIE } from "../auth/tokenVerifier";
import { getUserRooms } from "../logic/roomLogic";
import { subscribeToChannel, unsubscribeFromChannel } from "../lib/redisSubscriber";
import { registerSocketHandlers } from "./handlers";

async function syncUserRooms(socket: Socket) {
  if (!socket.data.joinedRooms) {
    socket.data.joinedRooms = new Set<string>();
  }

  try {
    const rooms = await getUserRooms(socket.data.userId);
    for (const room of rooms) {
      socket.join(room.id);
      socket.data.joinedRooms.add(room.id);
      await subscribeToChannel(`room:${room.id}`);
    }
  } catch (error) {
    console.error("Error syncing user rooms on Chat Service:", error);
  }
}

export function initSocket(io: Server): void {
  // 1. Handshake authentication middleware - reject unauthenticated clients before connection
  io.use((socket, next) => {
    const cookieHeader = socket.request.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const rawToken = cookies[AUTH_COOKIE];

    if (!rawToken) {
      return next(new Error("UNAUTHENTICATED"));
    }

    try {
      const token = verifyToken(rawToken);
      socket.data.userId = token.id;
      socket.data.username = token.username;
      socket.data.authenticated = true;
      next();
    } catch {
      return next(new Error("INVALID_SESSION"));
    }
  });

  // 2. Connection lifecycle
  io.on("connection", async (socket: Socket) => {
    socket.data.joinedRooms = new Set<string>();

    // Join personal user room
    socket.join(socket.data.userId);

    // Sync joined rooms from DB & subscribe to Redis channels
    await syncUserRooms(socket);

    // Register all room and message socket handlers
    registerSocketHandlers(io, socket);

    // Explicit authenticate event support for existing frontend lifecycle
    socket.on("authenticate", async () => {
      socket.emit("authenticated", { id: socket.data.userId });
    });

    socket.emit("authenticated", { id: socket.data.userId });

    socket.on("disconnect", async () => {
      if (socket.data.joinedRooms && socket.data.joinedRooms.size > 0) {
        for (const roomId of socket.data.joinedRooms) {
          await unsubscribeFromChannel(`room:${roomId}`);
        }
        socket.data.joinedRooms.clear();
      }
    });
  });
}
