import { GoogleButton } from "@/components/google-button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { register } from "@/services/auth";
import { friendlyError } from "@/services/errors";
import { Btn, Field, Logo } from "@/components/qc";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Create an account — QueueCare" }] }),
  component: Register,
});
function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (data.get("password") !== data.get("confirm")) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register(
        String(data.get("name")),
        String(data.get("email")),
        String(data.get("phone")),
        String(data.get("password")),
      );
      toast.success("Account created. Welcome to QueueCare.");
      await navigate({ to: "/patient/dashboard" });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-primary-soft p-12 lg:flex lg:flex-col">
        <Logo />
        <div className="mt-auto max-w-md">
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight">
            Less waiting. Better patient flow.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Join the clinic queue remotely and arrive closer to your turn.
          </p>
        </div>
        <div className="absolute right-[-60px] top-1/3 space-y-3 opacity-80">
          {["Join queue", "Track turn", "Visit clinic"].map((token, i) => (
            <div
              key={token}
              className="surface flex w-64 items-center justify-between px-5 py-4"
              style={{ marginLeft: i * 28, opacity: 1 - i * 0.2 }}
            >
              <span className="tabular text-xl font-semibold">{token}</span>
              <span className="text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
        <p className="mt-10 text-xs text-muted-foreground">QueueCare · Patient portal</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your next visit, with less waiting.
          </p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Full name" name="name" autoComplete="name" required />
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field label="Phone" name="phone" type="tel" autoComplete="tel" required />
            <Field
              label="Password"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
            <Field
              label="Confirm password"
              name="confirm"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Btn size="lg" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account <ArrowRight className="size-4" />
                </>
              )}
            </Btn>
          </form>
          <GoogleButton />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already registered?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Your account is used only to manage your clinic queue visits.
          </p>
        </div>
      </main>
    </div>
  );
}
