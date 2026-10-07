/** Small adapter preserves the approved UI's entry and action interfaces. */
import { useLiveQueue } from "@/providers/queue-provider";
import { mutateQueue } from "@/services/queue";
import type { Clinic } from "@/types/local";
export type { Status, Entry, Clinic, LoadState } from "@/types/local";
export function formatDate(date: string) {
  return date
    ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}
export function formatTime(value: string) {
  if (!value) return "—";
  const [hour, minute] = value.split(":");
  return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) >= 12 ? "PM" : "AM"}`;
}
const tokenBody = (token?: string) => (token ? { token } : {});
export const actions = {
  markDone: (token?: string) => mutateQueue("done", tokenBody(token)),
  callNext: () => mutateQueue("callNext"),
  call: (token: string) => mutateQueue("call", { token }),
  callAgain: (token?: string) => mutateQueue("callAgain", tokenBody(token)),
  skip: (token?: string) => mutateQueue("skip", tokenBody(token)),
  requeue: (token: string) => mutateQueue("requeue", { token }),
  closeQueue: () => mutateQueue("close"),
  openQueue: () => mutateQueue("open"),
  leave: () => mutateQueue("leave"),
  remove: (_token: string) => mutateQueue("leave"),
  join: (_name: string, _phone: string, reason: string) =>
    mutateQueue("join", { reason }).then((data) => data.tokenCode ?? ""),
  saveSettings: (clinic: Clinic, avgMin: number) => mutateQueue("settings", { clinic, avgMin }),
};
export const useQueue = useLiveQueue;
