import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma";
import { AUTH_COOKIE, authCookieOptions, createToken, requireAuth } from "../lib/auth";

const router = Router();

router.post("/signup", async (req: Request, res: Response): Promise<void> => {
  const { username, email, password } = req.body ?? {};

  if (!username || typeof username !== "string" || username.trim().length === 0) {
    res.status(400).json({ error: "Username is required" });
    return;
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        email: cleanEmail,
        password: hashedPassword,
      },
      select: {
        id: true,
        username: true,
        email: true,
        created_at: true,
      },
    });

    const token = createToken({
      id: user.id,
      username: user.username,
      email: user.email,
    });

    res.cookie(AUTH_COOKIE, token, authCookieOptions);
    res.status(201).json({ user });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      res.status(409).json({ error: "Username or email is already in use" });
      return;
    }
    console.error("Signup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/signin", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username: String(username).trim() },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const token = createToken({
      id: user.id,
      username: user.username,
      email: user.email,
    });

    res.cookie(AUTH_COOKIE, token, authCookieOptions);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error("Signin error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/signout", (_req: Request, res: Response): void => {
  res.clearCookie(AUTH_COOKIE, {
    ...authCookieOptions,
    maxAge: undefined,
  });
  res.status(204).send();
});

router.get("/me", requireAuth, (req: Request, res: Response): void => {
  res.json({ user: req.user });
});

export default router;
