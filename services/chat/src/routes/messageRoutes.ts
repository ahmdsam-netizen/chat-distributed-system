import { Router, Request, Response } from "express";
import { sendMessage, sendTyping, getMessages } from "../logic/messageLogic";

const router = Router();

router.post("/send", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, text, roomname, target_mode, target_users } = req.body ?? {};
    if (!user || !user.id || !user.username) {
      res.status(400).json({ error: "Authenticated user context required" });
      return;
    }
    if (!text || !roomname) {
      res.status(400).json({ error: "Text and roomname are required" });
      return;
    }

    const result = await sendMessage(user, {
      text,
      roomname: String(roomname).trim(),
      target_mode,
      target_users,
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to send message" });
  }
});

router.post("/typing", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, roomname } = req.body ?? {};
    if (!user || !user.id || !user.username) {
      res.status(400).json({ error: "Authenticated user context required" });
      return;
    }
    if (!roomname) {
      res.status(400).json({ error: "Roomname is required" });
      return;
    }

    const result = await sendTyping(user, { roomname: String(roomname).trim() });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to emit typing" });
  }
});

router.post("/history", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, roomname, cursor, limit } = req.body ?? {};
    if (!user || !user.id || !user.username) {
      res.status(400).json({ error: "Authenticated user context required" });
      return;
    }
    if (!roomname) {
      res.status(400).json({ error: "Roomname is required" });
      return;
    }

    const result = await getMessages(user, {
      roomname: String(roomname).trim(),
      cursor,
      limit,
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to fetch messages" });
  }
});

export default router;
