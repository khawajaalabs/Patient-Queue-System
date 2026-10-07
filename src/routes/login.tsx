import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Btn, Field, Logo } from "@/components/qc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { login } from "@/services/auth";
import { friendlyError } from "@/services/errors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — QueueCare" },
      {
        name: "description",
        content: "Sign in to QueueCare to get a token and track your clinic queue.",
      },
      { property: "og:title", content: "Sign in — QueueCare" },
      {
        property: "og:description",
        content: "Sign in to QueueCare to get a token and track your clinic queue.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [role, setRole] = useState<"patient" | "admin">("patient");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const profile = await login(email, password);
      await nav({ to: profile.role === "admin" ? "/admin" : "/patient/dashboard" });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-primary-soft p-12 lg:flex lg:flex-col">
        <Logo />
        <div className="relative z-10 mt-auto max-w-md">
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight">
            Less waiting. Better patient flow.
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
            Join the clinic queue remotely and arrive closer to your turn.
          </p>
        </div>
        {/* decorative queue motif */}
        <div className="absolute right-[-60px] top-1/2 -translate-y-1/2 space-y-3 opacity-90">
          {["Join queue", "Track turn", "Visit clinic", "Feel better"].map((t, i) => (
            <div
              key={t}
              className={cn(
                "surface flex w-64 items-center justify-between px-5 py-4",
                i === 0 && "shadow-lift",
              )}
              style={{ marginLeft: i * 28, opacity: 1 - i * 0.2 }}
            >
              <span className="tabular text-xl font-semibold tracking-tight">{t}</span>
              <span
                className={cn(
                  "text-xs font-medium",
                  i === 0 ? "text-primary" : "text-muted-foreground",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>
        <p className="relative z-10 mt-10 text-xs text-muted-foreground">
          QueueCare · Patient portal
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <Logo className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Sign in to manage your visit.</p>

          <div className="mt-7 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
            {(["patient", "admin"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-md py-2 font-medium capitalize transition",
                  role === r ? "bg-card shadow-soft" : "text-muted-foreground",
                )}
              >
                {r === "admin" ? "Clinic staff" : "Patient"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              key={role}
              required
            />
            <div>
              <Field
                label="Password"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="mt-2 min-h-11 text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Local password recovery</DialogTitle>
                    <DialogDescription>
                      This local application does not send reset emails. Contact the clinic
                      administrator if you cannot sign in.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogClose asChild>
                    <Btn type="button" variant="secondary">
                      Got it
                    </Btn>
                  </DialogClose>
                </DialogContent>
              </Dialog>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Btn size="lg" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Sign in <ArrowRight className="size-4" />
                </>
              )}
            </Btn>
          </form>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            New patient?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
