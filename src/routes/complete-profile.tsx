import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Btn, Field } from "@/components/qc";
import { AuthPage } from "@/components/auth-page";
import { api } from "@/api/client";
import { completeGoogleProfile } from "@/services/auth";
import { friendlyError } from "@/services/errors";
export const Route = createFileRoute("/complete-profile")({
  head: () => ({ meta: [{ title: "Complete your profile — QueueCare" }] }),
  component: CompleteProfile,
});
export function CompleteProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ email: string; fullName: string } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ email: string; fullName: string }>("/auth/google/profile")
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((error) => {
        if (active) setError(friendlyError(error));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <AuthPage
      title="Complete your profile"
      description="Add your phone number so the clinic can manage your visit."
    >
      {profile ? (
        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              await completeGoogleProfile(String(data.get("name")), String(data.get("phone")));
              await navigate({ to: "/patient/dashboard" });
            } catch (error) {
              setError(friendlyError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-sm text-muted-foreground">Signed in with Google as {profile.email}</p>
          <Field
            label="Full name"
            name="name"
            autoComplete="name"
            defaultValue={profile.fullName}
            required
            maxLength={120}
          />
          <Field
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            pattern="[+0-9 ()-]{6,30}"
            required
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Btn size="lg" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Continue to dashboard"}
          </Btn>
        </form>
      ) : (
        <p role={error ? "alert" : "status"} className="mt-6 text-sm text-muted-foreground">
          {error || "Loading your profile…"}
        </p>
      )}
    </AuthPage>
  );
}
