vi.mock("@/components/protected-route", () => ({
  ProtectedRoute: ({ children }: { children: import("react").ReactNode }) => children,
}));
vi.mock("@/services/auth", () => ({
  login: vi.fn(async (email: string) => ({
    role: email.startsWith("reception") ? "admin" : "patient",
  })),
  logout: vi.fn(async () => {}),
  resetPassword: vi.fn(async () => {}),
}));
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { actions } from "@/test/fixtures/queue-store";
import { Route as LoginRoute } from "@/routes/login";
import { Route as PatientRoute } from "@/routes/patient";
import { Route as DashboardRoute } from "@/routes/patient.dashboard";
import { Join } from "@/routes/patient.join-queue";
import { QueuePage } from "@/routes/patient.queue";
import { Route as HistoryRoute } from "@/routes/patient.history";

beforeEach(() => {
  cleanup();
  actions.resetDemo();
});
afterEach(cleanup);
function renderPatientApp() {
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });
  const login = createRoute({
    getParentRoute: () => root,
    path: "login",
    component: LoginRoute.options.component!,
  });
  const patient = createRoute({
    getParentRoute: () => root,
    path: "patient",
    component: PatientRoute.options.component!,
  });
  const dashboard = createRoute({
    getParentRoute: () => patient,
    path: "dashboard",
    component: DashboardRoute.options.component!,
  });
  const join = createRoute({ getParentRoute: () => patient, path: "get-token", component: Join });
  const queue = createRoute({
    getParentRoute: () => patient,
    path: "live-queue",
    component: QueuePage,
  });
  const history = createRoute({
    getParentRoute: () => patient,
    path: "history",
    component: HistoryRoute.options.component!,
  });
  const router = createRouter({
    routeTree: root.addChildren([login, patient.addChildren([dashboard, join, queue, history])]),
    history: createMemoryHistory({ initialEntries: ["/login"] }),
    context: { queryClient: new QueryClient() },
  });
  render(<RouterProvider router={router} />);
  return router;
}
it("demonstrates login, token issuance, anonymous tracking, completion and history", async () => {
  const router = renderPatientApp();
  await screen.findByRole("heading", { name: "Welcome back" });
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
    target: { value: "zain@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "TestPassword123!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Good morning, Zain" });
  expect(screen.getByText("~20 min")).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("main")).getByRole("link", { name: "Get token" }));
  await screen.findByRole("heading", { name: "Join today's queue" });
  fireEvent.click(screen.getByRole("button", { name: "Get my token" }));
  await screen.findByRole("heading", { name: "You're in the queue" });
  fireEvent.click(screen.getByRole("link", { name: "Track my queue" }));
  await screen.findByRole("heading", { name: "Live queue" });
  expect(screen.queryByText("Sara Ali")).not.toBeInTheDocument();
  expect(screen.queryByText("Ahmed Khan")).not.toBeInTheDocument();
  act(() => actions.demo("almost"));
  expect(screen.getByRole("status")).toHaveTextContent("2 patients are ahead");
  act(() => actions.call("A-024"));
  expect(screen.getByRole("status")).toHaveTextContent("Your token is being called");
  act(() => actions.markDone());
  expect(screen.getByRole("status")).toHaveTextContent("Visit completed");
  fireEvent.click(screen.getByRole("link", { name: "Visit history" }));
  await screen.findByRole("heading", { name: "Visit history" });
  expect(screen.getByText("Oct 5, 2026")).toBeInTheDocument();
  expect(screen.getByText("A-024")).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.pathname).toBe("/patient/history"));
}, 15000);
it.each(["no-queue", "completed"] as const)(
  "dashboard preserves the original %s token state",
  async (scenario) => {
    actions.demo(scenario);
    const router = renderPatientApp();
    await act(async () => {
      await router.navigate({ to: "/patient/dashboard" });
    });
    await screen.findByRole("heading", { name: "Good morning, Zain" });
    if (scenario === "no-queue") {
      const heading = screen.getByRole("heading", { name: "You don't have an active token." });
      const card = heading.closest("section")!;
      expect(within(card).getByRole("link", { name: /Get a token/ })).toHaveAttribute(
        "href",
        "/patient/get-token",
      );
      expect(within(card).getByRole("button", { name: /Get a token/ })).toBeDisabled();
    } else {
      expect(screen.getByText("Your token")).toBeInTheDocument();
      expect(screen.getByText("Visit completed.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Get another token" })).toBeInTheDocument();
    }
  },
);
