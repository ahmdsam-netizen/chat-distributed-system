import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export const AUTH_COOKIE = "ripple_token";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return s;
}

export function createToken(user: AuthUser): string {
  return jwt.sign(user, secret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, secret()) as AuthUser;
}

const isProduction = process.env.NODE_ENV === "production";
const cookieSameSite = process.env.COOKIE_SAME_SITE as "none" | "lax" | "strict" | undefined;

export const authCookieOptions = {
  httpOnly: true,
  sameSite: cookieSameSite ?? (isProduction ? "none" : "lax"),
  secure: isProduction || cookieSameSite === "none",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
