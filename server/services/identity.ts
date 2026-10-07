import { randomBytes } from "node:crypto";

export type GoogleIdentity = { subject: string; email: string; fullName: string; phone: string };
export type GoogleProvider = {
  authorizationUrl(challenge: string, redirect: string): string;
  verifyCode(code: string, verifier: string): Promise<GoogleIdentity>;
};
export type AuthOptions = {
  appUrl: string;
  google?: GoogleProvider | undefined;
  sendReset?: ((email: string, resetUrl: string, challenge: string) => Promise<void>) | undefined;
  verifyRecovery?: ((code: string, verifier: string) => Promise<string>) | undefined;
};
export function configuredAuth(appUrl: string): AuthOptions {
  const supabase = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  let google: GoogleProvider | undefined;
  if (supabase && key) {
    const base = new URL(supabase);
    if (base.protocol !== "https:") throw new Error("SUPABASE_URL must use HTTPS.");
    async function request(path: string, options: RequestInit = {}) {
      const response = await fetch(new URL("/auth/v1/" + path, base), {
        ...options,
        headers: { apikey: key!, "Content-Type": "application/json", ...options.headers },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Google identity verification failed.");
      return response.json();
    }
    google = {
      authorizationUrl(challenge, redirect) {
        const url = new URL("/auth/v1/authorize", base);
        url.search = new URLSearchParams({
          provider: "google",
          redirect_to: redirect,
          code_challenge: challenge,
          code_challenge_method: "s256",
          scopes: "openid email profile",
        }).toString();
        return url.toString();
      },
      async verifyCode(code, verifier) {
        const session = await request("token?grant_type=pkce", {
          method: "POST",
          body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
        });
        if (typeof session.access_token !== "string") throw new Error("Invalid Google session.");
        const user = await request("user", {
          headers: { Authorization: "Bearer " + session.access_token },
        });
        try {
          const claims = JSON.parse(
            Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8"),
          );
          const identity = user.identities?.find(
            (i: { provider: string }) => i.provider === "google",
          );
          const data = identity?.identity_data;
          // Trust provider identity data, never editable user_metadata or a client-supplied email.
          if (
            !claims.amr?.some((entry: { method: string }) => entry.method === "oauth") ||
            !user.email_confirmed_at ||
            data?.email_verified !== true ||
            typeof data?.sub !== "string" ||
            typeof data?.email !== "string"
          )
            throw new Error("A verified Google email is required.");
          return {
            subject: data.sub,
            email: data.email.trim().toLowerCase(),
            fullName: String(data.full_name ?? data.name ?? "").slice(0, 120),
            phone: typeof user.phone === "string" ? user.phone : "",
          };
        } finally {
          // QueueCare owns the application session; do not keep a parallel Supabase login alive.
          await request("logout?scope=local", {
            method: "POST",
            headers: { Authorization: "Bearer " + session.access_token },
          }).catch(() => {});
        }
      },
    };
  }
  let sendReset: AuthOptions["sendReset"];
  let verifyRecovery: AuthOptions["verifyRecovery"];
  const secret = process.env["SUPABASE_SECRET_KEY"];
  if (supabase && key && secret) {
    async function authRequest(path: string, body: unknown, privileged = false) {
      const response = await fetch(new URL("/auth/v1/" + path, supabase), {
        method: "POST",
        headers: {
          apikey: privileged ? secret! : key!,
          "Content-Type": "application/json",
          ...(privileged ? { Authorization: "Bearer " + secret! } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      return { response, result };
    }
    sendReset = async (email, resetUrl, challenge) => {
      // Only an existing QueueCare account reaches this path. The Supabase password is random
      // and never accepted by QueueCare; Supabase supplies email proof, not application login.
      const created = await authRequest(
        "admin/users",
        { email, email_confirm: true, password: randomBytes(48).toString("base64url") },
        true,
      );
      if (
        !created.response.ok &&
        !["email_exists", "user_already_exists"].includes(
          created.result.error_code ?? created.result.code,
        )
      )
        throw new Error("Unable to prepare email recovery.");
      const recovery = await authRequest("recover?redirect_to=" + encodeURIComponent(resetUrl), {
        email,
        code_challenge: challenge,
        code_challenge_method: "s256",
      });
      if (!recovery.response.ok) throw new Error("Supabase recovery email delivery failed.");
    };
    verifyRecovery = async (code, verifier) => {
      const verified = await authRequest("token?grant_type=pkce", {
        auth_code: code,
        code_verifier: verifier,
      });
      if (!verified.response.ok || typeof verified.result.access_token !== "string")
        throw new Error("Invalid recovery code.");
      const token = verified.result.access_token;
      try {
        const checked = await fetch(new URL("/auth/v1/user", supabase), {
          headers: { apikey: key!, Authorization: "Bearer " + token },
          signal: AbortSignal.timeout(10000),
        });
        const user = await checked.json();
        // The token has been verified by Supabase before inspecting its signed recovery method.
        const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
        if (
          !checked.ok ||
          !user.email_confirmed_at ||
          typeof user.email !== "string" ||
          !claims.amr?.some((entry: { method: string }) => entry.method === "recovery")
        )
          throw new Error("A verified recovery session is required.");
        return user.email.toLowerCase();
      } finally {
        await fetch(new URL("/auth/v1/logout?scope=local", supabase), {
          method: "POST",
          headers: { apikey: key!, Authorization: "Bearer " + token },
          signal: AbortSignal.timeout(10000),
        }).catch(() => {});
      }
    };
  }
  return { appUrl, google, sendReset, verifyRecovery };
}
