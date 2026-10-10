import { useId } from "react";
import { TemporalInput } from "@/components/form-controls";
import { useSyncExternalStore } from "react";
import { subscribePending, isQueueActionPending } from "@/services/queue";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/queue-store";
import type { ButtonHTMLAttributes, ReactNode } from "react";

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
      <span className="text-[15px] font-semibold tracking-tight">QueueCare</span>
    </div>
  );
}

const statusMap: Record<Status, { label: string; cls: string }> = {
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
        "status-pill inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium",
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
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-250 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5 disabled:translate-y-0 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        size === "md" ? "min-h-11 px-5 text-xs" : "h-12 px-5 text-[15px]",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary-hover",
        variant === "secondary" &&
          "border border-foreground bg-transparent text-foreground hover:bg-primary hover:text-primary-foreground",
        variant === "ghost" &&
          "border border-foreground bg-transparent text-foreground hover:bg-primary hover:text-primary-foreground",
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
        <h1 className="text-[32px] font-extrabold tracking-tight md:text-[40px]">
          {title.includes(" ") ? (
            <>
              {title.slice(0, title.lastIndexOf(" ") + 1)}
              <span className="signature-emphasis">{title.slice(title.lastIndexOf(" ") + 1)}</span>
            </>
          ) : (
            title
          )}
        </h1>
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
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        {...p}
        className="h-11 w-full rounded-lg border border-input bg-card px-4 text-base outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-0"
      />
    </label>
  );
}
