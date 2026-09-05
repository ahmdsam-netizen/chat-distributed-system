import jwt from "jsonwebtoken";

export const AUTH_COOKIE = "ripple_token";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
};

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return s;
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, secret()) as AuthUser;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}
