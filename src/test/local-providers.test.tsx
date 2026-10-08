import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PublicQueue, QueueResponse, QueueToken, UserProfile } from "@/types/local";
vi.unmock("@/providers/auth-provider");
vi.unmock("@/lib/queue-store");
const fixture = vi.hoisted(() => ({
  api: vi.fn(),
  events: new Map<string, () => void>(),
  disconnect: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api: fixture.api }));
vi.mock("socket.io-client", () => ({
  io: () => ({
    on: (event: string, handler: () => void) => {
      fixture.events.set(event, handler);
    },
    disconnect: fixture.disconnect,
  }),
}));
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { QueueProvider, useLiveQueue } from "@/providers/queue-provider";
import { login, logout, register, restoreSession } from "@/services/auth";
import { clinicDayKey } from "@/utils/clinic-date";
const profile: UserProfile = {
  id: "local-patient",
  uid: "local-patient",
  fullName: "Real Registered Patient",
  email: "local@example.com",
  phone: "123456789",
  role: "patient",
  clinicId: "northstar",
};
const publicState: PublicQueue = {
  name: "Local Clinic",
  displayName: "Local Reception",
  department: "Local OPD",
  tokenPrefix: "A",
  averageConsultationMinutes: 7,
  publicDisplayShowNext: true,
  queueDate: clinicDayKey(),
  status: "open",
  currentToken: null,
  nextTokens: [],
  waitingTokens: [],
  updatedAt: new Date().toISOString(),
};
const token: QueueToken = {
  id: "real-token",
  patientId: profile.id,
  patientName: profile.fullName,
  phone: profile.phone,
  tokenCode: "A-001",
  tokenNumber: 1,
  queueOrder: 1,
  department: "Local OPD",
  reasonForVisit: "Private reason",
  status: "waiting",
  queueDate: clinicDayKey(),
  joinedAt: new Date().toISOString(),
  calledAt: null,
  lastCalledAt: null,
  callCount: 0,
  completedAt: null,
  skippedAt: null,
  cancelledAt: null,
};
const response: QueueResponse = {
  public: publicState,
  clinic: {
    name: "Local Clinic",
    publicDisplayName: "Local Reception",
    department: "Local OPD",
    tokenPrefix: "A",
    averageConsultationMinutes: 7,
    publicDisplayShowNext: true,
    address: "Local address",
    phone: "123456789",
    doctorName: "Local Doctor",
    openingTime: "09:00",
    closingTime: "17:00",
  },
  mine: null,
  queue: [],
  history: [],
  patients: [],
};
function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <QueueProvider>{children}</QueueProvider>
    </AuthProvider>
  );
}
beforeEach(async () => {
  fixture.api.mockReset();
  fixture.events.clear();
  fixture.disconnect.mockReset();
  fixture.api.mockResolvedValue(null);
  await restoreSession();
});
afterEach(cleanup);
it("restores the server session and publishes login/register before route navigation", async () => {
  fixture.api.mockImplementation(async (path: string) => (path === "/auth/me" ? null : profile));
  const { result } = renderHook(() => useAuth(), {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    const user = await login(profile.email, "PatientPass123!");
    expect(user.id).toBe(profile.id);
  });
  expect(result.current.profile?.id).toBe(profile.id);
  expect(fixture.api).toHaveBeenCalledWith("/auth/login", {
    method: "POST",
    body: { email: profile.email, password: "PatientPass123!" },
  });
  await act(async () => {
    await logout();
  });
  expect(result.current.profile).toBeNull();
  await act(async () => {
    await register(profile.fullName, profile.email, profile.phone, "PatientPass123!");
  });
  expect(result.current.profile?.role).toBe("patient");
});
it("shows empty API state and realtime refetch changes the patient's real token", async () => {
  let state = response;
  fixture.api.mockImplementation(async (path: string) => (path === "/auth/me" ? profile : state));
  const { result, unmount } = renderHook(() => useLiveQueue(), { wrapper });
  await waitFor(() => expect(result.current.loadState).toBe("ready"));
  expect(result.current.mine).toBeNull();
  expect(result.current.queue).toEqual([]);
  expect(result.current.history).toEqual([]);
  expect(fixture.api).toHaveBeenCalledWith(
    "/patient/state?clinicId=northstar",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  state = {
    ...response,
    mine: token,
    history: [token],
    public: { ...publicState, waitingTokens: [{ tokenCode: token.tokenCode, queueOrder: 1 }] },
  };
  act(() => fixture.events.get("queue:updated")!());
  await waitFor(() => expect(result.current.mine?.token).toBe("A-001"));
  expect(result.current.ahead).toBe(0);
  expect(result.current.mine?.name).toBe(profile.fullName);
  const called = { ...token, status: "serving" as const, calledAt: new Date().toISOString() };
  state = { ...state, mine: called, public: { ...publicState, currentToken: token.tokenCode } };
  act(() => fixture.events.get("queue:updated")!());
  await waitFor(() => expect(result.current.mine?.status).toBe("serving"));
  expect(result.current.serving?.token).toBe(token.tokenCode);
  unmount();
  expect(fixture.disconnect).toHaveBeenCalled();
});
it("public display uses the sanitized endpoint even with an admin session", async () => {
  fixture.api.mockImplementation(async (path: string) =>
    path === "/auth/me" ? { ...profile, role: "admin" } : { ...publicState, currentToken: "A-001" },
  );
  const { result } = renderHook(() => useLiveQueue(), {
    wrapper: ({ children }) => (
      <AuthProvider>
        <QueueProvider publicOnly>{children}</QueueProvider>
      </AuthProvider>
    ),
  });
  await waitFor(() => expect(result.current.loadState).toBe("ready"));
  expect(result.current.serving?.name).toBe("");
  expect(result.current.serving?.phone).toBe("");
  expect(result.current.history).toEqual([]);
  expect(
    fixture.api.mock.calls.every(
      ([path]) => path === "/auth/me" || path === "/public/queue?clinicId=northstar",
    ),
  ).toBe(true);
});
it("failed queue requests show an error without inventing activity and retry recovers", async () => {
  fixture.api.mockImplementation(async (path: string) => {
    if (path === "/auth/me") return profile;
    throw new Error("Local API unavailable");
  });
  const { result } = renderHook(() => useLiveQueue(), { wrapper });
  await waitFor(() => expect(result.current.loadState).toBe("error"));
  expect(result.current.queue).toEqual([]);
  expect(result.current.error).toBe("Local API unavailable");
  fixture.api.mockImplementation(async (path: string) =>
    path === "/auth/me" ? profile : response,
  );
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.loadState).toBe("ready"));
  expect(result.current.mine).toBeNull();
});
