import { Router } from "express";
import type { Database } from "../db/database.ts";
import { randomUUID } from "node:crypto";
import { compare, hash, hashSync } from "bcryptjs";
import { z } from "zod";
import { one, type UserRow } from "../db/database.ts";
import { ApiError, currentUser, startSession, endSession, publicUser } from "../middleware/auth.ts";
const password = z
  .string()
  .min(8, "Use a password with at least 8 characters.")
  .max(72)
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes.");
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password,
});
const registration = credentials
  .extend({
    fullName: z.string().trim().min(1).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^[+0-9 ()-]{6,30}$/, "Enter a valid phone number."),
  })
  .strict();
const unusedHash = hashSync("unassigned-authentication-account", 12);
export function authRoutes(db: Database) {
  const routes = Router();
  const attempts = new Map<string, { count: number; until: number }>();
  routes.post("/register", async (req, res) => {
    const input = registration.parse(req.body);
    if (await one(db, "SELECT id FROM users WHERE email=?", input.email))
      throw new ApiError(
        409,
        "EMAIL_EXISTS",
        "An account already exists for this email. Please sign in.",
      );
    const id = randomUUID(),
      stamp = new Date().toISOString(),
      encoded = await hash(input.password, 12);
    // Recheck after asynchronous hashing; uniqueness also guards simultaneous registrations.
    if (await one(db, "SELECT id FROM users WHERE email=?", input.email))
      throw new ApiError(
        409,
        "EMAIL_EXISTS",
        "An account already exists for this email. Please sign in.",
      );
    try {
      await db
        .prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)")
        .run(id, input.fullName, input.email, input.phone, encoded, "patient", stamp, stamp);
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ApiError(
          409,
          "EMAIL_EXISTS",
          "An account already exists for this email. Please sign in.",
        );
      throw error;
    }
    await startSession(db, req, res, id);
    res.status(201).json({
      success: true,
      data: publicUser((await one<UserRow>(db, "SELECT * FROM users WHERE id=?", id))!),
    });
  });
  routes.post("/login", async (req, res) => {
    const input = credentials.strict().parse(req.body),
      key = req.ip ?? "local",
      prior = attempts.get(key),
      now = Date.now();
    const state = prior && prior.until > now ? prior : { count: 0, until: now + 15 * 60000 };
    if (state.count >= 20)
      throw new ApiError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Too many attempts. Please wait 15 minutes and try again.",
      );
    state.count++;
    attempts.set(key, state);
    const user = await one<UserRow>(db, "SELECT * FROM users WHERE email=?", input.email);
    const matches = await compare(input.password, user?.password_hash ?? unusedHash);
    if (!user || !matches)
      throw new ApiError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
    attempts.delete(key);
    await startSession(db, req, res, user.id);
    res.json({ success: true, data: publicUser(user) });
  });
  routes.get("/me", async (req, res) => {
    const user = await currentUser(db, req);
    res.json({ success: true, data: user ? publicUser(user) : null });
  });
  routes.post("/logout", async (req, res) => {
    await endSession(db, req, res);
    res.json({ success: true, data: null });
  });
  return routes;
}
