import { useId, useState } from "react";
import { TemporalInput } from "@/components/form-controls";
import { useSyncExternalStore } from "react";
import { subscribePending, isQueueActionPending } from "@/services/queue";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, FileText, FlaskConical, ScanLine } from "lucide-react";
import type { Status } from "@/lib/queue-store";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <span className="min-w-0 text-[15px] font-semibold leading-tight tracking-tight">
        Neuro Spine Care Center
      </span>
    </div>
  );
}

/**
 * Presentation-only helpers shared across admin screens. They do not fetch,
 * filter or mutate data — they just give every screen the same visual rhythm.
 */
export function Panel({
  title,
  sub,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
}) {
  return (
    <section className={cn("surface overflow-hidden", className)}>
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-semibold leading-tight">{title}</h2>}
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const tones: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-destructive/10 text-destructive",
};
export function TonePill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "primary" | "success" | "warning" | "info" | "danger";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon | undefined;
  title: string;
  description?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon && (
        <span className="grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="surface space-y-3 p-5" role="status" aria-label="Loading">
      <div className="skeleton h-4 w-1/3 rounded" />
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton h-12 w-full rounded-lg" key={i} />
      ))}
    </div>
  );
}

export function DocumentTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string | undefined;
}) {
  const Icon =
    type === "imaging_report" ? ScanLine : type === "lab_report" ? FlaskConical : FileText;
  return <Icon className={cn("size-5", className)} aria-hidden="true" />;
}

const statusMap: Record<Status, { label: string; cls: string }> = {
  reserved: { label: "Reserved", cls: "bg-primary-soft text-primary" },
  waiting: { label: "Waiting", cls: "bg-warning-soft text-warning" },
  serving: { label: "Serving", cls: "bg-info-soft text-info" },
  done: { label: "Completed", cls: "bg-success-soft text-success" },
  skipped: { label: "Skipped", cls: "bg-muted text-muted-foreground" },
  left: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
};

export function StatusPill({ status }: { status: Status }) {
  const s = statusMap[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        s.cls,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={cn("live-dot inline-block size-2 rounded-full bg-current", className)} />;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
};
export function Btn({ variant = "primary", size = "md", className, ...p }: BtnProps) {
  const pending = useSyncExternalStore(subscribePending, isQueueActionPending, () => false);
  return (
    <button
      {...p}
      disabled={p.disabled || pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        size === "md" ? "h-10 px-4 text-sm" : "h-12 px-5 text-[15px]",
        variant === "primary" &&
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover",
        variant === "secondary" && "border border-border bg-card text-foreground hover:bg-muted",
        variant === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
        variant === "danger" && "text-destructive hover:bg-destructive/10",
        className,
      )}
    />
  );
}

export function PageHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight md:text-[32px]">{title}</h1>
        {sub && <p className="mt-1.5 text-[15px] text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </div>
  );
}

export function Field({
  label,
  ...p
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = p.type === "password";

  if (["date", "time", "datetime-local"].includes(p.type ?? "")) {
    const id = p.id ?? generatedId;
    return (
      <div className="block">
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
          {label}
        </label>
        <TemporalInput {...p} id={id} aria-label={p["aria-label"] ?? label} />
      </div>
    );
  }

  const inputType = isPassword ? (showPassword ? "text" : "password") : p.type;

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="relative">
        <input
          {...p}
          type={inputType}
          className={cn(
            "h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-4 focus:ring-primary/10",
            isPassword && "pr-11",
            p.className,
          )}
        />
        {isPassword && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowPassword((prev) => !prev);
            }}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded focus:outline-none"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </label>
  );
}
