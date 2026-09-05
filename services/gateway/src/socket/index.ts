import { Server, Socket } from "socket.io";
import { parseCookies, verifyToken, AUTH_COOKIE } from "../auth/tokenVerifier";
import { chatClient } from "../lib/chatClient";
import { subscribeToChannel, unsubscribeFromChannel } from "../lib/redisSubscriber";
import { registerSocketHandlers } from "./handlers";

async function syncUserRooms(socket: Socket) {
  if (!socket.data.joinedRooms) {
    socket.data.joinedRooms = new Set<string>();
  }

  try {
    const rooms = await chatClient.getUserRooms(socket.data.userId);
    for (const room of rooms) {
      socket.join(room.id);
      socket.data.joinedRooms.add(room.id);
      await subscribeToChannel(`room:${room.id}`);
    }
  } catch (error) {
    console.error("Error syncing user rooms on Gateway:", error);
  }
}

export function initSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    socket.data.authenticated = false;
    socket.data.joinedRooms = new Set<string>();

    socket.on("authenticate", async () => {
      const cookieHeader = socket.request.headers.cookie;
      const cookies = parseCookies(cookieHeader);
      const rawToken = cookies[AUTH_COOKIE];

      if (!rawToken) {
        socket.emit("auth_error", { message: "Not authenticated" });
        socket.disconnect(true);
        return;
      }

      try {
        const token = verifyToken(rawToken);
        socket.data.userId = token.id;
        socket.data.username = token.username;
        socket.data.authenticated = true;

        socket.join(socket.data.userId);

        await syncUserRooms(socket);

        if (!socket.data.handlersRegistered) {
          registerSocketHandlers(io, socket);
          socket.data.handlersRegistered = true;
        }

        socket.emit("authenticated", { id: socket.data.userId });
      } catch {
        socket.emit("auth_error", { message: "Invalid or expired session" });
        socket.disconnect(true);
      }
    });

    socket.onAny((eventName) => {
      if (eventName === "authenticate") return;
      if (!socket.data.authenticated) {
        socket.emit("auth_error", { message: "Not authenticated" });
        socket.disconnect(true);
      }
    });

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
