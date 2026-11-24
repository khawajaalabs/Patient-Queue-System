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

interface CachedUser {
  user: UserRow | null;
  expires: number;
}
const sessionUserCache = new Map<string, CachedUser>();
const SESSION_CACHE_TTL_MS =
  process.env["NODE_TEST_CONTEXT"] || process.env["VITEST"] || process.env["NODE_ENV"] === "test"
    ? 0
    : 60_000;

export function invalidateSessionCache(token?: string) {
  if (token) {
    sessionUserCache.delete(digest(token));
  } else {
    sessionUserCache.clear();
  }
}

export type StaffRoleRow = { role: "receptionist" | "nurse"; active: number };
/** Resolve the effective role without an extra database round trip. */
export function userWithStaffRole(user: UserRow, staff?: StaffRoleRow | null): UserRow | null {
  if (!staff) return user;
  return Number(staff.active) === 1 ? { ...user, role: staff.role } : null;
}
export async function resolveUser(
  db: Database,
  user: UserRow | undefined | null,
): Promise<UserRow | null> {
  if (!user) return null;
  const staff = await one<StaffRoleRow>(
    db,
    "SELECT role,active FROM staff_profiles WHERE user_id=?",
    user.id,
  );
  return userWithStaffRole(user, staff);
}
type AuthUserRow = UserRow & { staff_role?: string | null; staff_active?: number | null };
export function applyStaffColumns(found: AuthUserRow | undefined): UserRow | null {
  if (!found) return null;
  const staff = found.staff_role
    ? {
        role: found.staff_role as StaffRoleRow["role"],
        active: Number(found.staff_active ?? 0),
      }
    : null;
  return userWithStaffRole(found, staff);
}
export async function currentUser(db: Database, req: Request) {
  const token = sessionCookie(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = digest(token);
  const now = Date.now();
  const cached = sessionUserCache.get(hash);
  if (cached && cached.expires > now) {
    return cached.user;
  }
  if (sessionUserCache.size > 1000) {
    for (const [k, v] of sessionUserCache) {
      if (v.expires <= now) sessionUserCache.delete(k);
    }
  }
  // Join the staff role into the session lookup: one query instead of two.
  const resolved = applyStaffColumns(
    await one<AuthUserRow>(
      db,
      "SELECT u.*,sp.role staff_role,sp.active staff_active FROM users u JOIN sessions s ON u.id=s.user_id LEFT JOIN staff_profiles sp ON sp.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
      hash,
      now,
    ),
  );
  sessionUserCache.set(hash, {
    user: resolved,
    expires: now + SESSION_CACHE_TTL_MS,
  });
  return resolved;
}
export async function startSession(
  db: Database,
  req: Request,
  res: Response,
  userId: string,
  user?: UserRow | null,
) {
  const old = sessionCookie(req);
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  if (old) invalidateSessionCache(old);
  const tokenHash = digest(token);
  // Keep rotation atomic (SQLite has no data-modifying CTE), but skip the
  // global queue lock and serverless no-op notification used by queue writes.
  await atomic(
    db,
    async () => {
      if (old) await db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(old));
      await db
        .prepare("INSERT INTO sessions VALUES (?,?,?)")
        .run(tokenHash, userId, now + sessionMaxAge);
    },
    { serialize: false, notify: false },
  );
  if (user) {
    sessionUserCache.set(tokenHash, {
      user,
      expires: now + SESSION_CACHE_TTL_MS,
    });
  }
  // Expired sessions are ignored by the session lookup, so no background
  // cleanup query is needed. It used to contend with the single pooled
  // connection and slow down the requests that followed a login.
  res.cookie("queuecare_session", token, {
    ...authCookieOptions(req),
    maxAge: sessionMaxAge,
  });
}
export async function endSession(db: Database, req: Request, res: Response) {
  const token = sessionCookie(req);
  if (token) {
    invalidateSessionCache(token);
    await db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
  }
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
