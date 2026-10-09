import { createHash, randomBytes } from "node:crypto";
import type { Database } from "../db/database.ts";
import type { Request, Response, NextFunction, CookieOptions } from "express";
import { atomic, one, type UserRow } from "../db/database.ts";
import type { UserProfile } from "../../src/types/local.ts";
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const publicUser = (u: UserRow): UserProfile => ({
  id: u.id,
  uid: u.id,
  fullName: u.full_name,
  email: u.email,
  phone: u.phone,
  role: u.role,
});
const sessionMaxAge = 7 * 86400000;
export function authCookieOptions(req: Request, path = "/"): CookieOptions {
  return {
    httpOnly: true,
    secure:
      Boolean(process.env["VERCEL"]) || process.env["NODE_ENV"] === "production" || req.secure,
    sameSite: "lax",
    path,
  };
}
export function sessionCookie(req: Request) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("queuecare_session="))
      ?.slice("queuecare_session=".length) ?? ""
  );
}
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export async function resolveUser(
  db: Database,
  user: UserRow | undefined | null,
): Promise<UserRow | null> {
  if (!user) return null;
  const staff = await one<{ role: "receptionist" | "nurse"; active: number }>(
    db,
    "SELECT role,active FROM staff_profiles WHERE user_id=?",
    user.id,
  );
  return staff ? (Number(staff.active) === 1 ? { ...user, role: staff.role } : null) : user;
}
export async function currentUser(db: Database, req: Request) {
  const token = sessionCookie(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return resolveUser(
    db,
    (await one<UserRow>(
      db,
      "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      digest(token),
      Date.now(),
    )) ?? null,
  );
}
export async function startSession(db: Database, req: Request, res: Response, userId: string) {
  const old = sessionCookie(req);
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await atomic(db, async () => {
    if (old) await db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(old));
    await db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now);
    await db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(digest(token), userId, now + sessionMaxAge);
  });
  res.cookie("queuecare_session", token, {
    ...authCookieOptions(req),
    maxAge: sessionMaxAge,
  });
}
export async function endSession(db: Database, req: Request, res: Response) {
  const token = sessionCookie(req);
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
  res.clearCookie("queuecare_session", authCookieOptions(req));
}
export function requireRole(db: Database, role?: UserRow["role"]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await currentUser(db, req);
    if (!user) return next(new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue."));
    if (role && user.role !== role)
      return next(new ApiError(403, "FORBIDDEN", "This action is not available for your account."));
    res.locals["user"] = user;
    next();
  };
}
