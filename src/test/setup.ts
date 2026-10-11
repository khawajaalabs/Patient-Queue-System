import { vi } from "vitest";
import type { ReactNode } from "react";
vi.mock("@/lib/queue-store", async () => {
  const fixture = await import("./fixtures/queue-store");
  return {
    ...fixture,
    actions: { ...fixture.actions, closeQueue: fixture.actions.toggleOpen, callAgain: () => {} },
    useQueue: () => {
      const q = fixture.useQueue();
      return {
        ...q,
        mine: q.mine
          ? {
              ...q.mine,
              date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(
                new Date(),
              ),
            }
          : null,
        queue: q.queue.map((e) => ({
          ...e,
          date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()),
        })),
        patients: [...new Map([...q.history, ...q.queue].map((e) => [e.name, e])).values()],
        notifications: [],
        error: "",
        retry: () => fixture.actions.setLoadState("ready"),
        queueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(
          new Date(),
        ),
        historyDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(
          new Date(),
        ),
        setHistoryDate: () => {},
        setQueueDate: ()=>{},
      };
    },
  };
});
vi.mock("@/providers/auth-provider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    profile: {
      id: "test-patient",
      uid: "test-patient",
      fullName: "Zain",
      email: "test@example.com",
      phone: "123456789",
      role: "patient",
      clinicId: "northstar",
    },
    loading: false,
    error: "",
    retry: () => {},
  }),
}));
import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
