import { useEffect, useSyncExternalStore } from "react";

export type Status = "waiting" | "serving" | "done" | "skipped" | "left";
export type Entry = {
  token: string;
  id?: string | undefined;
  patientId?: string | undefined;
  queueOrder?: number | undefined;
  skippedAt?: string | undefined;
  cancelledAt?: string | undefined;
  name: string;
  phone: string;
  reason: string;
  status: Status;
  joinedAt: string;
  joinedAtMillis?: number | undefined;
  servedAt?: string | undefined;
  completedAt?: string | undefined;
  date?: string | undefined;
  waitMin?: number | undefined;
};
export type Clinic = {
  name: string;
  address: string;
  phone: string;
  department: string;
  doctor: string;
  opening: string;
  closing: string;
  prefix: string;
  publicName: string;
  showNext: boolean;
};
export type LoadState = "ready" | "loading" | "error";
type State = {
  open: boolean;
  openedToday: boolean;
  queue: Entry[];
  myToken: string | null;
  avgMin: number;
  history: Entry[];
  clinic: Clinic;
  loadState: LoadState;
};
export const demoDate = "2026-10-05";
export const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export const formatTime = (value: string) => {
  const [h, m] = value.split(":");
  return `${Number(h) % 12 || 12}:${m} ${Number(h) >= 12 ? "PM" : "AM"}`;
};
const defaultClinic: Clinic = {
  name: "Northstar Medical Clinic",
  address: "14 Canal View Road, Lahore",
  phone: "+92 42 3500 1200",
  department: "General OPD",
  doctor: "Dr. Ayesha Raza",
  opening: "09:00",
  closing: "17:00",
  prefix: "A",
  publicName: "Northstar Medical Clinic",
  showNext: true,
};
const seed: Entry[] = (
  [
    ["A-015", "Fatima Noor", "done", "09:12", 10],
    ["A-016", "Imran Qureshi", "done", "09:20", 14],
    ["A-017", "Ayesha Malik", "skipped", "09:31", 9],
    ["A-018", "Omar Farooq", "done", "09:40", 15],
    ["A-019", "Ahmed Khan", "serving", "10:00", 12],
    ["A-020", "Sara Ali", "waiting", "10:02", 18],
    ["A-021", "Usman Ahmed", "waiting", "10:05", 15],
    ["A-022", "Hina Khan", "waiting", "10:08", 12],
    ["A-023", "Bilal Sheikh", "waiting", "10:12", 8],
    ["A-024", "Zain Ahmed", "waiting", "10:26", 18],
  ] as [string, string, Status, string, number][]
).map(([token, name, status, time, waitMin]) => ({
  token,
  name,
  status,
  joinedAt: formatTime(time),
  date: demoDate,
  waitMin,
  phone:
    token === "A-024"
      ? "+92 300 1234567"
      : "+92 300 " + String(1000000 + Number(token.slice(2)) * 13579),
  reason: "General consultation",
  ...(status === "serving" ? { servedAt: "10:42 AM" } : {}),
  ...(status === "done" ? { servedAt: "09:45 AM", completedAt: "09:50 AM" } : {}),
}));
const pastVisits: Entry[] = [
  {
    token: "B-011",
    name: "Zain Ahmed",
    phone: "+92 300 1234567",
    reason: "Follow-up",
    status: "done",
    joinedAt: "09:10 AM",
    completedAt: "09:35 AM",
    date: "2026-09-28",
    waitMin: 18,
  },
  {
    token: "A-032",
    name: "Zain Ahmed",
    phone: "+92 300 1234567",
    reason: "General consultation",
    status: "done",
    joinedAt: "10:00 AM",
    completedAt: "10:28 AM",
    date: "2026-09-14",
    waitMin: 23,
  },
  {
    token: "A-007",
    name: "Zain Ahmed",
    phone: "+92 300 1234567",
    reason: "Lab results",
    status: "left",
    joinedAt: "11:20 AM",
    date: "2026-08-30",
    waitMin: 8,
  },
  {
    token: "C-003",
    name: "Zain Ahmed",
    phone: "+92 300 1234567",
    reason: "Vaccination",
    status: "skipped",
    joinedAt: "09:30 AM",
    date: "2026-08-02",
    waitMin: 12,
  },
];
const initialState = (): State => ({
  open: true,
  openedToday: true,
  queue: seed.map((e) => ({ ...e })),
  myToken: "A-024",
  avgMin: 5,
  history: pastVisits.map((e) => ({ ...e })),
  clinic: { ...defaultClinic },
  loadState: "ready",
});
let state = initialState();
const listeners = new Set<() => void>();
let demoChannel: BroadcastChannel | null = null;
let channelUsers = 0;
function connectDemo() {
  if (typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") return;
  channelUsers++;
  if (!demoChannel) {
    demoChannel = new window.BroadcastChannel("queuecare-local-demo");
    demoChannel.onmessage = (event: MessageEvent<{ type: string; state?: State }>) => {
      if (event.data.type === "request") demoChannel?.postMessage({ type: "state", state });
      if (event.data.type === "state" && event.data.state) {
        state = event.data.state;
        listeners.forEach((listener) => listener());
      }
    };
    demoChannel.postMessage({ type: "request" });
  }
  return () => {
    channelUsers--;
    if (channelUsers === 0) {
      demoChannel?.close();
      demoChannel = null;
    }
  };
}
const set = (fn: (s: State) => State) => {
  state = fn(state);
  listeners.forEach((l) => l());
  demoChannel?.postMessage({ type: "state", state });
};
const nowLabel = () =>
  new Date().toLocaleTimeString("en-US", {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "2-digit",
  });
const archive = (s: State, entry: Entry): Entry[] =>
  entry.token === s.myToken
    ? [entry, ...s.history.filter((h) => !(h.token === entry.token && h.date === entry.date))]
    : s.history;
function updateStatus(token: string | undefined, status: Status) {
  set((s) => {
    const target = s.queue.find((e) => e.token === token || (!token && e.status === "serving"));
    if (!target) return s;
    const updated = {
      ...target,
      status,
      ...(status === "done" ? { completedAt: nowLabel() } : {}),
    };
    return {
      ...s,
      queue: s.queue.map((e) => (e.token === target.token ? updated : e)),
      history: archive(s, updated),
    };
  });
}
function call(token: string) {
  set((s) => {
    const target = s.queue.find((e) => e.token === token && e.status === "waiting");
    if (!target) return s;
    let history = s.history;
    const queue = s.queue.map((e) => {
      if (e.status === "serving") {
        const completed: Entry = { ...e, status: "done", completedAt: nowLabel() };
        history = archive({ ...s, history }, completed);
        return completed;
      }
      return e.token === token ? { ...e, status: "serving" as Status, servedAt: nowLabel() } : e;
    });
    return { ...s, queue, history };
  });
}
export const actions = {
  markDone: (token?: string) => updateStatus(token, "done"),
  callNext: () => {
    const next = state.queue.find((e) => e.status === "waiting");
    if (next) call(next.token);
  },
  call,
  skip: (token?: string) => updateStatus(token, "skipped"),
  requeue: (token: string) =>
    set((s) => {
      const entry = s.queue.find((e) => e.token === token && e.status === "skipped");
      if (!entry) return s;
      const { servedAt: _servedAt, completedAt: _completedAt, ...rest } = entry;
      return {
        ...s,
        queue: [...s.queue.filter((e) => e.token !== token), { ...rest, status: "waiting" }],
        history: s.history.filter((h) => !(h.token === token && h.date === entry.date)),
      };
    }),
  toggleOpen: () => set((s) => ({ ...s, open: !s.open, openedToday: true })),
  openQueue: () => set((s) => ({ ...s, open: true, openedToday: true })),
  remove: (token: string) => {
    updateStatus(token, "left");
    if (state.myToken === token) set((s) => ({ ...s, myToken: null }));
  },
  join: (name: string, phone: string, reason: string) => {
    if (!state.open) throw new Error("The queue is closed right now.");
    const existing = state.queue.find(
      (e) => e.token === state.myToken && (e.status === "waiting" || e.status === "serving"),
    );
    if (existing) return existing.token;
    const last = Math.max(
      23,
      ...state.queue.map((e) => Number(e.token.slice(e.token.lastIndexOf("-") + 1))),
    );
    const token = `${state.clinic.prefix}-${String(last + 1).padStart(3, "0")}`;
    set((s) => ({
      ...s,
      myToken: token,
      queue: [
        ...s.queue,
        {
          token,
          name,
          phone,
          reason: reason || "General consultation",
          status: "waiting",
          joinedAt: nowLabel(),
          date: demoDate,
          waitMin: 0,
        },
      ],
    }));
    return token;
  },
  leave: () => {
    if (state.myToken) actions.remove(state.myToken);
  },
  saveSettings: (clinic: Clinic, avgMin: number) => set((s) => ({ ...s, clinic, avgMin })),
  setLoadState: (loadState: LoadState) => set((s) => ({ ...s, loadState })),
  resetDemo: () => set(() => initialState()),
  demo: (
    scenario: "waiting" | "almost" | "called" | "skipped" | "completed" | "no-queue" | "empty",
  ) => {
    set(() => initialState());
    if (scenario === "no-queue") {
      set((s) => ({ ...s, open: false, openedToday: false, queue: [], myToken: null }));
      return;
    }
    if (scenario === "empty") {
      set((s) => ({ ...s, queue: [], myToken: null }));
      return;
    }
    if (scenario === "almost")
      set((s) => ({
        ...s,
        queue: s.queue.map((e) =>
          ["A-020", "A-021"].includes(e.token) ? { ...e, status: "done" } : e,
        ),
      }));
    if (["called", "skipped", "completed"].includes(scenario)) call("A-024");
    if (scenario === "skipped") actions.skip();
    if (scenario === "completed") actions.markDone();
  },
};
export function useQueue() {
  useEffect(connectDemo, []);
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => state,
  );
  const serving = s.queue.find((e) => e.status === "serving") ?? null;
  const waiting = s.queue.filter((e) => e.status === "waiting");
  const mine = s.queue.find((e) => e.token === s.myToken) ?? null;
  const ahead =
    mine?.status === "waiting"
      ? Math.max(
          0,
          waiting.findIndex((e) => e.token === mine.token),
        )
      : 0;
  return {
    ...s,
    serving,
    waiting,
    mine,
    ahead,
    eta: ahead * s.avgMin,
    completed: s.queue.filter((e) => e.status === "done").length,
    skipped: s.queue.filter((e) => e.status === "skipped").length,
  };
}
