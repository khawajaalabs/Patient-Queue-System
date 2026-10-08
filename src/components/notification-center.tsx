import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/api/client";
import { Btn } from "@/components/qc";
import { useAuth } from "@/providers/auth-provider";
import { friendlyError } from "@/services/errors";
import type { AppNotification } from "@/types/operations";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
export function notificationHref(n: AppNotification, role: string) {
  const patient = role === "patient";
  switch (n.entity_type) {
    case "visit":
      return patient
        ? "/patient/visit/" + encodeURIComponent(n.entity_id)
        : "/admin/visits/" + encodeURIComponent(n.entity_id);
    case "prescription":
      return "/patient/prescription/" + encodeURIComponent(n.entity_id);
    case "invoice":
      return (
        (patient ? "/patient/billing" : "/admin/billing") +
        "?invoiceId=" +
        encodeURIComponent(n.entity_id)
      );
    case "document":
      return patient ? "/patient/documents" : "/admin/documents";
    case "appointment":
      return patient
        ? "/patient/appointments"
        : role === "admin"
          ? "/admin/appointments"
          : "/staff";
    default:
      return patient ? "/patient/live-queue" : role === "admin" ? "/admin/live-queue" : "/staff";
  }
}
export function NotificationCenter() {
  const { profile } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]),
    [error, setError] = useState("");
  async function refresh() {
    try {
      setItems(await api<AppNotification[]>("/notifications"));
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  useEffect(() => {
    if (!profile) return;
    void refresh();
    const reload = () => void refresh();
    window.addEventListener("queuecare:refresh", reload);
    window.addEventListener("queuecare:updated", reload);
    const timer = setInterval(reload, 20000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("queuecare:refresh", reload);
      window.removeEventListener("queuecare:updated", reload);
    };
  }, [profile?.id]);
  async function read(id?: string) {
    try {
      await api(id ? "/notifications/" + id + "/read" : "/notifications/read-all", {
        method: "POST",
        body: {},
      });
      await refresh();
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <Bell className="size-[18px]" />
          {items.some((n) => !n.read_at) && (
            <span className="absolute right-0 top-0 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {items.filter((n) => !n.read_at).length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Notifications</h2>
          <Btn variant="ghost" onClick={() => void read()}>
            Mark all read
          </Btn>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {items.map((n) => (
          <article
            key={n.id}
            className={"border-t border-border py-3 " + (!n.read_at ? "bg-primary/5" : "")}
          >
            <a
              href={notificationHref(n, profile?.role ?? "patient")}
              onClick={(e) => {
                e.preventDefault();
                void read(n.id).then(() =>
                  window.location.assign(notificationHref(n, profile?.role ?? "patient")),
                );
              }}
              className="block"
            >
              <p className="text-sm font-medium">{n.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </a>
            {!n.read_at && (
              <button className="mt-2 text-xs text-primary" onClick={() => void read(n.id)}>
                Mark read
              </button>
            )}
          </article>
        ))}
        {!items.length && !error && (
          <p className="py-5 text-sm text-muted-foreground">You’re all caught up.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
