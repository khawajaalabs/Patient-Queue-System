import { createFileRoute } from "@tanstack/react-router";
import { AccountSettings } from "@/components/final-operations";
import { useAuth } from "@/providers/auth-provider";
import { ProtectedRoute } from "@/components/protected-route";
export const Route = createFileRoute("/account")({
  component: () => {
    const { profile } = useAuth();
    return (
      <ProtectedRoute role={profile?.role ?? "patient"}>
        <main className="mx-auto max-w-3xl px-5 py-8">
          <a href="/" className="mb-4 block text-primary">
            QueueCare home
          </a>
          <AccountSettings />
        </main>
      </ProtectedRoute>
    );
  },
});
