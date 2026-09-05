import { Server, Socket } from "socket.io";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  listRooms,
  getRoomMembers,
} from "../logic/roomLogic";
import {
  sendMessage,
  sendTyping,
  getMessages,
} from "../logic/messageLogic";
import { subscribeToChannel, unsubscribeFromChannel } from "../lib/redisSubscriber";

export function registerSocketHandlers(_io: Server, socket: Socket) {
  const user = {
    id: socket.data.userId as string,
    username: socket.data.username as string,
  };

  // --- ROOM HANDLERS ---

  socket.on("create_room", async (data: { roomname: string; description?: string }) => {
    try {
      const result = await createRoom(user, {
        roomname: data.roomname,
        description: data.description ?? "",
      });

      socket.join(result.roomId);
      if (!socket.data.joinedRooms) socket.data.joinedRooms = new Set<string>();
      socket.data.joinedRooms.add(result.roomId);

      await subscribeToChannel(`room:${result.roomId}`);
      socket.emit("room_created", { roomname: result.roomname });
    } catch (error: any) {
      console.error("create_room error:", error);
      socket.emit("error", { message: error?.message ?? "Failed to create room" });
    }
  });

  socket.on("join_room", async (data: { roomname: string }) => {
    try {
      const result = await joinRoom(user, data);

      socket.join(result.roomId);
      if (!socket.data.joinedRooms) socket.data.joinedRooms = new Set<string>();
      socket.data.joinedRooms.add(result.roomId);

      await subscribeToChannel(`room:${result.roomId}`);
      socket.emit("joined_room", { roomname: result.roomname });
    } catch (error: any) {
      console.error("join_room error:", error);
      socket.emit("error", { message: error?.message ?? "Failed to join room" });
    }
  });

  socket.on("leave_room", async (data: { roomname: string }) => {
    try {
      const result = await leaveRoom(user, data);

      socket.leave(result.roomId);
      if (socket.data.joinedRooms) {
        socket.data.joinedRooms.delete(result.roomId);
      }

      await unsubscribeFromChannel(`room:${result.roomId}`);
      socket.emit("left_room", { roomname: result.roomname });
    } catch (error: any) {
      console.error("leave_room error:", error);
      socket.emit("error", { message: error?.message ?? "Failed to leave room" });
    }
  });

  socket.on("list_room", async (data: { filter?: string }) => {
    try {
      const rooms = await listRooms(user, data?.filter ?? "");
      socket.emit("filter_rooms", rooms);
    } catch (error: any) {
      console.error("list_room error:", error);
      socket.emit("error", { message: error?.message ?? "Failed to list rooms" });
    }
  });

  socket.on("get_room_members", async (data: { roomname: string }) => {
    try {
      const result = await getRoomMembers(user, data.roomname);
      socket.emit("room_members", result);
    } catch (error: any) {
      console.error("get_room_members error:", error);
      socket.emit("error", { message: error?.message ?? "Failed to fetch room members" });
    }
  });

  // --- MESSAGE HANDLERS ---

  socket.on(
    "message_in_room",
    async (data: {
      text: string;
      roomname: string;
      target_mode?: "all" | "to" | "not_to" | "not_to_all";
      target_users?: string[];
    }) => {
      try {
        const result = await sendMessage(user, data);
        if (result?.roomId && !socket.rooms.has(result.roomId)) {
          socket.join(result.roomId);
          if (!socket.data.joinedRooms) socket.data.joinedRooms = new Set<string>();
          socket.data.joinedRooms.add(result.roomId);
          await subscribeToChannel(`room:${result.roomId}`);
        }
      } catch (error: any) {
        console.error("message_in_room error:", error);
        socket.emit("error", { message: error?.message ?? "Failed to send message" });
      }
    }
  );

  socket.on("typing_in_room", async (data: { roomname: string }) => {
    try {
      await sendTyping(user, data);
    } catch (error: any) {
      console.error("typing_in_room error:", error);
      socket.emit("error", { message: "Failed to emit typing" });
    }
  });

  socket.on(
    "get_message_of_room",
    async (data: { roomname: string; cursor?: string; limit?: number }) => {
      try {
        const result = await getMessages(user, data);
        socket.emit("group_chat", result);
      } catch (error: any) {
        console.error("get_message_of_room error:", error);
        socket.emit("error", { message: error?.message ?? "Failed to fetch messages" });
      }
    }
  );
}
