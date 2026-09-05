import { Router, Request, Response } from "express";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  listRooms,
  getRoomMembers,
  getUserRooms,
} from "../logic/roomLogic";

const router = Router();

router.post("/create", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, roomname, description } = req.body ?? {};
    if (!user || !user.id || !user.username) {
      res.status(400).json({ error: "Authenticated user context required" });
      return;
    }
    if (!roomname || typeof roomname !== "string" || roomname.trim().length === 0) {
      res.status(400).json({ error: "Room name is required" });
      return;
    }

    const result = await createRoom(user, {
      roomname: roomname.trim(),
      description: typeof description === "string" ? description.trim() : "",
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to create room" });
  }
});

router.post("/join", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, roomname } = req.body ?? {};
    if (!user || !user.id || !user.username) {
      res.status(400).json({ error: "Authenticated user context required" });
      return;
    }
    if (!roomname) {
      res.status(400).json({ error: "Room name is required" });
      return;
    }

    const result = await joinRoom(user, { roomname: String(roomname).trim() });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to join room" });
  }
});

router.post("/leave", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, roomname } = req.body ?? {};
    if (!user || !user.id || !user.username) {
      res.status(400).json({ error: "Authenticated user context required" });
      return;
    }
    if (!roomname) {
      res.status(400).json({ error: "Room name is required" });
      return;
    }

    const result = await leaveRoom(user, { roomname: String(roomname).trim() });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to leave room" });
  }
});

router.post("/list", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, filter } = req.body ?? {};
    if (!user || !user.id) {
      res.status(400).json({ error: "Authenticated user context required" });
      return;
    }

    const rooms = await listRooms(user, typeof filter === "string" ? filter : "");
    res.json(rooms);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list rooms" });
  }
});

router.post("/members", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, roomname } = req.body ?? {};
    if (!user || !user.id) {
      res.status(400).json({ error: "Authenticated user context required" });
      return;
    }
    if (!roomname) {
      res.status(400).json({ error: "Room name is required" });
      return;
    }

    const members = await getRoomMembers(user, String(roomname).trim());
    res.json(members);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to fetch room members" });
  }
});

router.get("/user-rooms/:userId", async (req: Request, res: Response): Promise<void> => {
  try {
    const rawUserId = req.params.userId;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    if (!userId) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }

    const rooms = await getUserRooms(userId);
    res.json(rooms);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch user rooms" });
  }
});

export default router;
