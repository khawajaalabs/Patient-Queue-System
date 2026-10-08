import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/providers/auth-provider";
import { Btn } from "@/components/qc";
import { logout } from "@/services/auth";
import type { Role } from "@/types/local";
export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { profile, loading, error, retry } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading || error) return;
    if (!profile) void navigate({ to: "/login", replace: true });
    else if (profile.role !== role)
      void navigate({
        to:
          profile.role === "admin"
            ? "/admin"
            : profile.role === "patient"
              ? "/patient/dashboard"
              : "/staff",
        replace: true,
      });
  }, [profile, loading, error, role, navigate]);
  if (error)
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-xl font-semibold">Unable to load your account</h1>
        <p role="alert" className="text-sm text-muted-foreground">
          {error}
        </p>
        <Btn onClick={retry}>Try again</Btn>
        <Btn variant="secondary" onClick={() => void logout()}>
          Sign out
        </Btn>
        <Link to="/login" className="text-sm text-primary">
          Back to sign in
        </Link>
      </div>
    );
  if (loading || !profile || profile.role !== role)
    return (
      <div
        role="status"
        className="grid min-h-screen place-items-center text-sm text-muted-foreground"
      >
        Loading your account…
      </div>
    );
  return children;
}
