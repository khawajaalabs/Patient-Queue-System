import { Router, type Request, type Response } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { atomic, one, type Database, type UserRow } from "../db/database.ts";
import { ApiError, publicUser, startSession, authCookieOptions } from "../middleware/auth.ts";
import type { AuthOptions, GoogleIdentity } from "../services/identity.ts";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const phone = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{6,30}$/, "Enter a valid phone number.");
const profile = z.object({ fullName: z.string().trim().min(1).max(120), phone }).strict();
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Use at most 72 UTF-8 bytes.");
const resetInput = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/, "This reset link is invalid or expired."),
    password,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((value) => value.password === value.confirmPassword, "Passwords do not match.");
type Ticket = {
  token_hash: string;
  kind: string;
  user_id: string | null;
  payload: string | null;
  expires_at: number;
};
const invalid = () =>
  new ApiError(
    400,
    "INVALID_AUTH_LINK",
    "This link is invalid, expired or already used. Please start again.",
  );
function cookieValue(req: Request, name: string) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(name + "="))
      ?.slice(name.length + 1) ?? ""
  );
}
function setCookie(req: Request, res: Response, name: string, token: string) {
  res.cookie(name, token, {
    ...authCookieOptions(req, "/api/auth/google"),
    maxAge: 10 * 60000,
  });
}
function clearCookie(req: Request, res: Response, name: string) {
  res.clearCookie(name, authCookieOptions(req, "/api/auth/google"));
}
export function extendedAuthRoutes(db: Database, options: AuthOptions) {
  const routes = Router();
  const origin = new URL(options.appUrl).origin;
  async function limited(scope: string, key: string, limit: number) {
    return atomic(db, async () => {
      const now = Date.now(),
        bucket = scope + ":" + digest(key);
      await db.prepare("DELETE FROM auth_rate_limits WHERE expires_at<=?").run(now);
      await db
        .prepare(
          "INSERT INTO auth_rate_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=auth_rate_limits.attempts+1",
        )
        .run(bucket, now + 15 * 60000);
      const row = await one<{ attempts: number }>(
        db,
        "SELECT attempts FROM auth_rate_limits WHERE bucket=?",
        bucket,
      );
      return row!.attempts > limit;
    });
  }
  async function saveTicket(
    kind: string,
    userId: string | null,
    payload: string | null,
    minutes = 10,
  ) {
    const token = randomBytes(32).toString("hex");
    await atomic(db, async () => {
      await db.prepare("DELETE FROM auth_requests WHERE expires_at<=?").run(Date.now());
      if (kind === "password_reset")
        await db.prepare("DELETE FROM auth_requests WHERE kind=? AND user_id=?").run(kind, userId);
      await db
        .prepare("INSERT INTO auth_requests VALUES (?,?,?,?,?,?)")
        .run(digest(token), kind, userId, payload, Date.now() + minutes * 60000, Date.now());
    });
    return token;
  }
  async function ticket(token: string, kind: string, consume = false) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw invalid();
    return atomic(db, async () => {
      const row = await one<Ticket>(
        db,
        "SELECT * FROM auth_requests WHERE token_hash=? AND kind=? AND expires_at>?",
        digest(token),
        kind,
        Date.now(),
      );
      if (!row) throw invalid();
      if (consume)
        await db.prepare("DELETE FROM auth_requests WHERE token_hash=?").run(digest(token));
      return row;
    });
  }
  async function linkPatient(identity: GoogleIdentity, details?: z.infer<typeof profile>) {
    const verifiedEmail = email.parse(identity.email);
    if (!identity.subject || identity.subject.length > 255) throw invalid();
    // A random, unshared bcrypt secret keeps Google-only accounts out of password login until reset.
    const newHash = await hash(randomBytes(32).toString("hex"), 12);
    return atomic(db, async () => {
      const sameEmail = await one<UserRow>(db, "SELECT * FROM users WHERE email=?", verifiedEmail);
      if (
        sameEmail &&
        (sameEmail.role === "admin" ||
          (await one(db, "SELECT user_id FROM staff_profiles WHERE user_id=?", sameEmail.id)))
      )
        throw new ApiError(403, "PATIENT_ONLY", "Use clinic staff email/password login.");
      const linked = await one<UserRow>(
        db,
        "SELECT u.* FROM users u JOIN google_identities g ON g.user_id=u.id WHERE g.provider_subject=?",
        identity.subject,
      );
      if (linked && (linked.role !== "patient" || (sameEmail && sameEmail.id !== linked.id)))
        throw invalid();
      if (linked) return linked;
      let user = sameEmail;
      if (!user) {
        if (!details) return null;
        const stamp = new Date().toISOString(),
          id = randomUUID();
        await db
          .prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)")
          .run(
            id,
            details.fullName,
            verifiedEmail,
            details.phone,
            newHash,
            "patient",
            stamp,
            stamp,
          );
        user = (await one<UserRow>(db, "SELECT * FROM users WHERE id=?", id))!;
      }
      await db
        .prepare("INSERT INTO google_identities VALUES (?,?,?)")
        .run(identity.subject, user.id, new Date().toISOString());
      return user;
    });
  }
  routes.post("/google/start", async (req, res) => {
    if (!options.google)
      throw new ApiError(503, "GOOGLE_UNAVAILABLE", "Google sign-in is not configured yet.");
    if (await limited("google", req.ip ?? "local", 20))
      throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Please wait before trying again.");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const token = await saveTicket("oauth", null, JSON.stringify({ verifier }));
    setCookie(req, res, "queuecare_oauth", token);
    res.json({
      success: true,
      data: {
        url: options.google.authorizationUrl(challenge, origin + "/api/auth/google/callback"),
      },
    });
  });
  routes.get("/google/callback", async (req, res) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    clearCookie(req, res, "queuecare_oauth");
    try {
      const state = await ticket(cookieValue(req, "queuecare_oauth"), "oauth", true);
      const code = z.string().min(1).max(4096).parse(req.query["code"]);
      if (!options.google) throw invalid();
      const identity = await options.google.verifyCode(code, JSON.parse(state.payload!).verifier);
      const parsed = profile.safeParse({ fullName: identity.fullName, phone: identity.phone });
      const user = await linkPatient(identity, parsed.success ? parsed.data : undefined);
      if (user) {
        await startSession(db, req, res, user.id);
        res.redirect(303, origin + "/patient/dashboard");
        return;
      }
      const token = await saveTicket("google_profile", null, JSON.stringify(identity));
      setCookie(req, res, "queuecare_google_profile", token);
      res.redirect(303, origin + "/complete-profile");
    } catch {
      res.redirect(303, origin + "/login?error=google");
    }
  });
  routes.get("/google/profile", async (req, res) => {
    const pending = await ticket(cookieValue(req, "queuecare_google_profile"), "google_profile");
    const identity: GoogleIdentity = JSON.parse(pending.payload!);
    res.json({ success: true, data: { fullName: identity.fullName, email: identity.email } });
  });
  routes.post("/google/complete", async (req, res) => {
    const details = profile.parse(req.body);
    const pending = await ticket(
      cookieValue(req, "queuecare_google_profile"),
      "google_profile",
      true,
    );
    const user = await linkPatient(JSON.parse(pending.payload!), details);
    if (!user) throw invalid();
    await startSession(db, req, res, user.id);
    clearCookie(req, res, "queuecare_google_profile");
    res.json({ success: true, data: publicUser(user) });
  });
  routes.post("/forgot-password", async (req, res) => {
    const input = z.object({ email }).strict().parse(req.body);
    if (!options.sendReset)
      throw new ApiError(
        503,
        "EMAIL_UNAVAILABLE",
        "Password recovery email is temporarily unavailable. Please contact the clinic.",
      );
    const generic = {
      success: true,
      data: { message: "If an account exists for that email, a password reset link will be sent." },
    };
    const tooManyIp = await limited("reset_ip", req.ip ?? "local", 20);
    const tooManyEmail = await limited("reset_email", input.email, 3);
    if (tooManyIp || tooManyEmail) {
      res.json(generic);
      return;
    }
    const user = await one<UserRow>(db, "SELECT * FROM users WHERE email=?", input.email);
    if (user) {
      try {
        const verifier = randomBytes(48).toString("base64url");
        const flow = await saveTicket("recovery", user.id, JSON.stringify({ verifier }), 30);
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        await options.sendReset(user.email, origin + "/reset-password?flow=" + flow, challenge);
      } catch {
        console.error("QueueCare Supabase recovery email delivery failed.");
      }
    }
    res.json(generic);
  });
  routes.post("/verify-reset", async (req, res) => {
    const input = z
      .object({ flow: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().min(1).max(4096) })
      .strict()
      .parse(req.body);
    if (!options.verifyRecovery)
      throw new ApiError(503, "EMAIL_UNAVAILABLE", "Password recovery is not configured yet.");
    if (await limited("verify_reset", req.ip ?? "local", 20))
      throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Please wait before trying again.");
    const pending = await ticket(input.flow, "recovery", true);
    let verifiedEmail: string;
    try {
      verifiedEmail = await options.verifyRecovery(
        input.code,
        JSON.parse(pending.payload!).verifier,
      );
    } catch {
      throw invalid();
    }
    const user = await one<UserRow>(
      db,
      "SELECT * FROM users WHERE email=?",
      email.parse(verifiedEmail),
    );
    if (!user || user.id !== pending.user_id) throw invalid();
    const token = await saveTicket("password_reset", user.id, null, 30);
    res.json({ success: true, data: { token } });
  });
  routes.post("/reset-password", async (req, res) => {
    const input = resetInput.parse(req.body);
    if (await limited("reset_submit", req.ip ?? "local", 30))
      throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Please wait before trying again.");
    const encoded = await hash(input.password, 12);
    await atomic(db, async () => {
      const pending = await one<Ticket>(
        db,
        "SELECT * FROM auth_requests WHERE token_hash=? AND kind='password_reset' AND expires_at>?",
        digest(input.token),
        Date.now(),
      );
      if (!pending?.user_id) throw invalid();
      await db
        .prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?")
        .run(encoded, new Date().toISOString(), pending.user_id);
      await db.prepare("DELETE FROM sessions WHERE user_id=?").run(pending.user_id);
      await db
        .prepare("DELETE FROM auth_requests WHERE kind='password_reset' AND user_id=?")
        .run(pending.user_id);
    });
    res.json({
      success: true,
      data: { message: "Your password has been updated. Please sign in." },
    });
  });
  return routes;
}
