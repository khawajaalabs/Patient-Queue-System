import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io } from "socket.io-client";
import { api } from "@/api/client";
import { useAuth } from "./auth-provider";
import { friendlyError } from "@/services/errors";
import { clinicDayKey } from "@/utils/clinic-date";
import type {
  Clinic,
  ClinicConfig,
  Entry,
  LoadState,
  PublicQueue,
  QueueResponse,
  QueueToken,
} from "@/types/local";
export type QueueState = {
  open: boolean;
  openedToday: boolean;
  queue: Entry[];
  myToken: string | null;
  avgMin: number;
  history: Entry[];
  patients: Entry[];
  clinic: Clinic;
  loadState: LoadState;
  error: string;
  retry: () => void;
  queueDate: string;
  historyDate: string;
  setHistoryDate: (date: string) => void;
  notifications: string[];
};
const emptyClinic: Clinic = {
  name: "",
  address: "",
  phone: "",
  department: "",
  doctor: "",
  opening: "",
  closing: "",
  prefix: "",
  publicName: "",
  showNext: true,
};
const initial = (): Omit<QueueState, "retry" | "setHistoryDate" | "historyDate" | "queueDate"> => ({
  open: false,
  openedToday: false,
  queue: [],
  myToken: null,
  avgMin: 5,
  history: [],
  patients: [],
  clinic: emptyClinic,
  loadState: "loading",
  error: "",
  notifications: [],
});
const Context = createContext<QueueState | null>(null);
function time(value: string | null) {
  return value
    ? new Date(value).toLocaleTimeString("en-US", {
        timeZone: "Asia/Karachi",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}
export function toEntry(t: QueueToken): Entry {
  const end = t.calledAt ?? t.cancelledAt ?? t.skippedAt;
  return {
    id: t.id,
    patientId: t.patientId,
    token: t.tokenCode,
    name: t.patientName,
    phone: t.phone,
    reason: t.reasonForVisit,
    status: t.status === "completed" ? "done" : t.status === "cancelled" ? "left" : t.status,
    joinedAt: time(t.joinedAt),
    joinedAtMillis: Date.parse(t.joinedAt),
    servedAt: t.calledAt ? time(t.calledAt) : undefined,
    completedAt: t.completedAt ? time(t.completedAt) : undefined,
    skippedAt: t.skippedAt ? time(t.skippedAt) : undefined,
    cancelledAt: t.cancelledAt ? time(t.cancelledAt) : undefined,
    date: t.queueDate,
    queueOrder: t.queueOrder,
    waitMin: end
      ? Math.max(0, Math.round((Date.parse(end) - Date.parse(t.joinedAt)) / 60000))
      : undefined,
  };
}
const fromClinic = (c: ClinicConfig): Clinic => ({
  name: c.name,
  address: c.address,
  phone: c.phone,
  department: c.department,
  doctor: c.doctorName,
  opening: c.openingTime,
  closing: c.closingTime,
  prefix: c.tokenPrefix,
  publicName: c.publicDisplayName,
  showNext: c.publicDisplayShowNext,
});
const anonEntry = (
  token: string,
  status: Entry["status"],
  date: string,
  queueOrder = 0,
): Entry => ({ token, status, date, queueOrder, name: "", phone: "", reason: "", joinedAt: "—" });
export function QueueProvider({
  children,
  publicOnly = false,
}: {
  children: ReactNode;
  publicOnly?: boolean;
}) {
  const { profile, loading: authLoading } = useAuth();
  const role = publicOnly ? undefined : profile?.role;
  const uid = publicOnly ? undefined : profile?.id;
  const [state, setState] = useState(initial);
  const [day, setDay] = useState(clinicDayKey);
  const [historyDate, setHistoryDate] = useState(clinicDayKey);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDay(clinicDayKey()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (authLoading && !publicOnly) return;
    let active = true,
      sequence = 0;
    const controller = new AbortController();
    setState(initial());
    async function refresh() {
      const request = ++sequence;
      try {
        const path =
          role === "admin"
            ? `/admin/state?historyDate=${encodeURIComponent(historyDate)}`
            : role === "patient"
              ? "/patient/state"
              : "/public/queue";
        const data = await api<QueueResponse | PublicQueue>(path, { signal: controller.signal });
        if (!active || request !== sequence) return;
        const privateState = "public" in data ? data : null;
        const pub = privateState ? privateState.public : (data as PublicQueue);
        const mine = privateState?.mine ? toEntry(privateState.mine) : null;
        let queue =
          role === "admin" && privateState
            ? privateState.queue.map(toEntry)
            : [
                ...(pub.currentToken ? [anonEntry(pub.currentToken, "serving", day)] : []),
                ...pub.waitingTokens.map((t) =>
                  anonEntry(t.tokenCode, "waiting", day, t.queueOrder),
                ),
              ];
        if (role === "patient" && mine)
          queue = [...queue.filter((t) => t.token !== mine.token), mine].sort(
            (a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0),
          );
        const patients =
          privateState?.patients.map(({ user, visit }): Entry =>
            visit
              ? toEntry(visit)
              : {
                  id: user.id,
                  patientId: user.id,
                  name: user.fullName,
                  phone: user.phone,
                  token: "—",
                  status: "left",
                  joinedAt: "—",
                  reason: "",
                },
          ) ?? [];
        setState((previous) => ({
          open: pub.status === "open",
          openedToday: pub.status !== "unavailable",
          queue,
          myToken: mine?.token ?? null,
          avgMin: pub.averageConsultationMinutes,
          history: privateState?.history.map(toEntry) ?? [],
          patients,
          clinic: privateState
            ? fromClinic(privateState.clinic)
            : {
                ...emptyClinic,
                name: pub.name,
                publicName: pub.displayName,
                department: pub.department,
                prefix: pub.tokenPrefix,
                showNext: pub.publicDisplayShowNext,
              },
          loadState: "ready",
          error: "",
          notifications:
            role === "admin" &&
            previous.loadState === "ready" &&
            queue.some(
              (t) => t.status === "waiting" && !previous.queue.some((old) => old.id === t.id),
            )
              ? ["New patient joined the queue.", ...previous.notifications].slice(0, 5)
              : previous.notifications,
        }));
      } catch (error) {
        if (active && request === sequence)
          setState((previous) => ({
            ...previous,
            loadState: "error",
            error: friendlyError(error),
          }));
      }
    }
    const refreshNow = () => {
      void refresh();
    };
    refreshNow();
    const socket = io({
      withCredentials: true,
      transports: ["websocket"],
      path: import.meta.env["VITE_SOCKET_PATH"] ?? "/socket.io",
      addTrailingSlash: !import.meta.env["VITE_SOCKET_PATH"],
    });
    socket.on("queue:updated", refreshNow);
    socket.on("connect", refreshNow);
    window.addEventListener("queuecare:refresh", refreshNow);
    const timer = setInterval(refreshNow, 30000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      socket.disconnect();
      window.removeEventListener("queuecare:refresh", refreshNow);
    };
  }, [role, uid, authLoading, publicOnly, day, historyDate, attempt]);
  return (
    <Context.Provider
      value={{
        ...state,
        queueDate: day,
        historyDate,
        setHistoryDate,
        retry: () => setAttempt((n) => n + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useLiveQueue() {
  const state = useContext(Context);
  if (!state) throw new Error("QueueProvider is required.");
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const queue = state.queue.map((entry) =>
    entry.status === "waiting" && entry.joinedAtMillis
      ? { ...entry, waitMin: Math.max(0, Math.floor((clock - entry.joinedAtMillis) / 60000)) }
      : entry,
  );
  const serving = queue.find((t) => t.status === "serving") ?? null;
  const waiting = queue.filter((t) => t.status === "waiting");
  const mine = queue.find((t) => t.token === state.myToken) ?? null;
  const ahead =
    mine?.status === "waiting"
      ? waiting.filter((t) => (t.queueOrder ?? 0) < (mine.queueOrder ?? 0)).length
      : 0;
  return {
    ...state,
    queue,
    serving,
    waiting,
    mine,
    ahead,
    eta: ahead * state.avgMin,
    completed: queue.filter((t) => t.status === "done").length,
    skipped: queue.filter((t) => t.status === "skipped").length,
  };
}
