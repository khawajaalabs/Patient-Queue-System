import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { Btn, Logo } from "@/components/qc";
import { GoogleButton } from "@/components/google-button";
import { login } from "@/services/auth";
import { friendlyError } from "@/services/errors";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Neuro Spine Care Center" },
      {
        name: "description",
        content:
          "Sign in to Neuro Spine Care Center to manage clinic queues, appointments and patient records.",
      },
      { property: "og:title", content: "Sign in — Neuro Spine Care Center" },
      {
        property: "og:description",
        content:
          "Sign in to Neuro Spine Care Center to manage clinic queues, appointments and patient records.",
      },
    ],
  }),
  component: Login,
});

function LoginField({
  id,
  label,
  icon: Icon,
  trailing,
  ...p
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  trailing?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <span className="relative block">
        <Icon
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          {...p}
          id={id}
          aria-label={label}
          className={cn(
            "h-12 w-full rounded-xl border border-input bg-card pl-10 pr-3.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-4 focus:ring-primary/10",
            p.className,
          )}
        />
        {trailing}
      </span>
    </label>
  );
}

function Login() {
  const nav = useNavigate();
  const [role, setRole] = useState<"patient" | "admin">("patient");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "google"
      ? "Google sign-in could not be completed. Use a verified patient Google account or sign in with email and password."
      : "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const profile = await login(email, password);
      await nav({
        to:
          profile.role === "admin"
            ? "/admin"
            : profile.role === "patient"
              ? "/patient/dashboard"
              : "/staff",
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };
  const highlights = [
    { icon: ShieldCheck, label: "Private by design", detail: "Records stay encrypted." },
    { icon: Activity, label: "Live queue", detail: "Know your turn instantly." },
    { icon: FileText, label: "Digital reports", detail: "Scans and visits together." },
  ];
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-display p-12 lg:flex lg:flex-col">
        <div className="login-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-32 -top-32 size-[420px] rounded-full bg-display-accent/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative z-10 text-display-foreground">
          <Logo />
          <p className="ml-[42px] mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-display-accent">
            Clinic Operations
          </p>
        </div>
        <div className="relative z-10 mt-auto max-w-lg">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-display-accent">
            Neuro Spine Care Center
          </p>
          <h1 className="text-[44px] font-semibold leading-[1.08] tracking-tight text-display-foreground">
            Less waiting. Better patient flow.
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-display-muted">
            Join the clinic queue remotely and arrive closer to your turn.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {highlights.map(({ icon: Icon, label, detail }) => (
              <div
                className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                key={label}
              >
                <Icon className="size-5 text-display-accent" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-display-foreground">{label}</p>
                <p className="mt-1 text-xs leading-relaxed text-display-muted">{detail}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 mt-10 text-xs text-display-muted">
          Neuro Spine Care Center · Patient portal
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[430px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className="surface p-7 sm:p-9">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                Secure sign-in
              </span>
            </div>
            <h2 className="mt-4 text-[28px] font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Sign in to manage your visit.</p>

            <div
              className="mt-7 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm"
              role="group"
              aria-label="Account type"
            >
              {(["patient", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-2 rounded-lg py-2 font-medium capitalize transition",
                    role === r
                      ? "bg-card text-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r === "admin" ? (
                    <Stethoscope className="size-4" aria-hidden="true" />
                  ) : (
                    <UserRound className="size-4" aria-hidden="true" />
                  )}
                  {r === "admin" ? "Clinic staff" : "Patient"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate={false}>
              <LoginField
                id="email"
                label="Email"
                type="email"
                name="email"
                icon={Mail}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                key={role}
                required
              />
              <LoginField
                id="password"
                label="Password"
                type={showPassword ? "text" : "password"}
                name="password"
                icon={LockKeyhole}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-11"
                required
                trailing={
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                }
              />
              <Link
                to="/forgot-password"
                className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
              {error && (
                <div
                  role="alert"
                  className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>{error}</p>
                </div>
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
            {role === "patient" && (
              <>
                <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>
                <GoogleButton />
              </>
            )}
            <p className="mt-6 text-center text-sm text-muted-foreground">
              New patient?{" "}
              <Link to="/register" className="font-medium text-primary hover:underline">
                Create an account
              </Link>
            </p>
          </div>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            Encrypted and private · Role-based access
          </p>
        </div>
      </main>
    </div>
  );
}
