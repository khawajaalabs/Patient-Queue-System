import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Btn, Field } from "@/components/qc";
import { AuthPage } from "@/components/auth-page";
import { resetPassword, verifyPasswordRecovery } from "@/services/auth";
import { friendlyError } from "@/services/errors";
export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Reset password — QueueCare" }, { name: "referrer", content: "no-referrer" }],
  }),
  component: ResetPassword,
});
export function ResetPassword() {
  const [token, setToken] = useState("");
  const [verifying, setVerifying] = useState(true);
  const verification = useRef<Promise<string> | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    if (!verification.current) {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code") ?? "",
        flow = params.get("flow") ?? "";
      window.history.replaceState(null, "", window.location.pathname);
      verification.current =
        code && flow
          ? verifyPasswordRecovery(flow, code)
          : Promise.reject(new Error("This reset link is missing, invalid or expired."));
    }
    verification.current
      .then((value) => {
        if (active) setToken(value);
      })
      .catch((error) => {
        if (active) setError(friendlyError(error));
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <AuthPage
      title="Reset your password"
      description="Choose a new password for your QueueCare account."
    >
      {verifying ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          Verifying your reset link…
        </p>
      ) : done ? (
        <p
          role="status"
          className="mt-6 rounded-lg border border-border bg-primary-soft p-4 text-sm"
        >
          Your password has been updated. Sign in with your new password.
        </p>
      ) : !token ? (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error || "This reset link is missing or invalid."}{" "}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
          .
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget),
              password = String(data.get("password")),
              confirm = String(data.get("confirm"));
            if (password !== confirm) {
              setError("Passwords do not match.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              await resetPassword(token, password, confirm);
              setDone(true);
            } catch (error) {
              setError(friendlyError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="New password"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <Field
            label="Confirm password"
            type="password"
            name="confirm"
            autoComplete="new-password"
            minLength={8}
            required
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}{" "}
              <Link to="/forgot-password" className="underline">
                Request a new link
              </Link>
              .
            </p>
          )}
          <Btn className="w-full" size="lg" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </Btn>
        </form>
      )}
    </AuthPage>
  );
}
