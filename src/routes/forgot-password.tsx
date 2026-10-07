import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Btn, Field } from "@/components/qc";
import { AuthPage } from "@/components/auth-page";
import { requestPasswordReset } from "@/services/auth";
import { friendlyError } from "@/services/errors";
export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — QueueCare" }] }),
  component: ForgotPassword,
});
export function ForgotPassword() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  return (
    <AuthPage
      title="Forgot your password?"
      description="Enter your email and we'll send you a secure reset link."
    >
      {sent ? (
        <p
          role="status"
          className="mt-6 rounded-lg border border-border bg-primary-soft p-4 text-sm"
        >
          If an account exists for that email, a password reset link will be sent. Check your inbox
          and spam folder. The link expires in 30 minutes.
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              await requestPasswordReset(String(data.get("email")));
              setSent(true);
            } catch (error) {
              setError(friendlyError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Btn className="w-full" size="lg" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Btn>
        </form>
      )}
    </AuthPage>
  );
}
