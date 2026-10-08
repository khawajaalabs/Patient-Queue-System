import { currentCommandClinic } from "@/providers/clinic-provider";
import { api } from "@/api/client";
import { toast } from "sonner";
import { friendlyError } from "./errors";
type Command =
  | "join"
  | "leave"
  | "open"
  | "close"
  | "callNext"
  | "call"
  | "done"
  | "skip"
  | "requeue"
  | "callAgain"
  | "settings";
const endpoints: Record<Command, string> = {
  join: "/patient/token",
  leave: "/patient/token/cancel",
  open: "/admin/queue/open",
  close: "/admin/queue/close",
  callNext: "/admin/queue/call-next",
  call: "/admin/queue/call",
  done: "/admin/queue/complete",
  skip: "/admin/queue/skip",
  requeue: "/admin/queue/requeue",
  callAgain: "/admin/queue/call-again",
  settings: "/admin/settings",
};
let pending = false;
const listeners = new Set<() => void>();
export function isQueueActionPending() {
  return pending;
}
export function subscribePending(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function mutateQueue(command: Command, payload: Record<string, unknown> = {}) {
  if (pending) throw new Error("A queue action is already in progress.");
  pending = true;
  listeners.forEach((l) => l());
  try {
    const result = await api<{ tokenCode?: string }>(
      `${endpoints[command]}?clinicId=${encodeURIComponent(currentCommandClinic())}`,
      {
        method: command === "settings" ? "PUT" : "POST",
        body: payload,
      },
    );
    window.dispatchEvent(new Event("queuecare:refresh"));
    return result;
  } finally {
    pending = false;
    listeners.forEach((l) => l());
  }
}
export async function runAction(action: () => unknown, message: string) {
  try {
    await action();
    toast.success(message);
  } catch (error) {
    toast.error(friendlyError(error));
  }
}
