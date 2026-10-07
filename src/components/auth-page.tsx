import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/qc";
export function AuthPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
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
        <p className="mt-10 text-xs text-muted-foreground">QueueCare · Patient portal</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <Logo className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          {children}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
