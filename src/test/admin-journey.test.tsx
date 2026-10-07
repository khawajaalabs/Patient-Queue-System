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
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { actions } from "@/test/fixtures/queue-store";
import { Route as LoginRoute } from "@/routes/login";
import { Route as AdminRoute } from "@/routes/admin";
import { Route as OverviewRoute } from "@/routes/admin.index";
import { LiveQueue } from "@/routes/admin.queue";
import { Route as HistoryRoute } from "@/routes/admin.history";
import { Route as PatientsRoute } from "@/routes/admin.patients";
import { Route as SettingsRoute } from "@/routes/admin.settings";
import { Route as DisplayRoute } from "@/routes/public-display";

beforeEach(() => {
  cleanup();
  actions.resetDemo();
});
afterEach(cleanup);
it("demonstrates staff login, opening, drawer actions, history, patients and display", async () => {
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });
  const login = createRoute({
    getParentRoute: () => root,
    path: "login",
    component: LoginRoute.options.component!,
  });
  const admin = createRoute({
    getParentRoute: () => root,
    path: "admin",
    component: AdminRoute.options.component!,
  });
  const overview = createRoute({
    getParentRoute: () => admin,
    path: "/",
    component: OverviewRoute.options.component!,
  });
  const queue = createRoute({
    getParentRoute: () => admin,
    path: "live-queue",
    component: LiveQueue,
  });
  const history = createRoute({
    getParentRoute: () => admin,
    path: "history",
    component: HistoryRoute.options.component!,
  });
  const patients = createRoute({
    getParentRoute: () => admin,
    path: "patients",
    component: PatientsRoute.options.component!,
  });
  const settings = createRoute({
    getParentRoute: () => admin,
    path: "settings",
    component: SettingsRoute.options.component!,
  });
  const display = createRoute({
    getParentRoute: () => root,
    path: "public-display",
    component: DisplayRoute.options.component!,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      login,
      display,
      admin.addChildren([overview, queue, history, patients, settings]),
    ]),
    history: createMemoryHistory({ initialEntries: ["/login"] }),
    context: { queryClient: new QueryClient() },
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Welcome back" });
  fireEvent.click(screen.getByRole("button", { name: "Clinic staff" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
    target: { value: "reception@northstar.clinic" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "TestPassword123!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Queue overview" });
  act(() => actions.demo("no-queue"));
  fireEvent.click(screen.getByRole("button", { name: "Open today's queue" }));
  expect(screen.getByText("Queue open")).toBeInTheDocument();
  act(() => actions.resetDemo());
  fireEvent.click(screen.getByRole("link", { name: "Manage full queue" }));
  await screen.findByRole("heading", { name: "Live queue" });
  fireEvent.click(screen.getByRole("button", { name: "A-020 Sara Ali" }));
  const drawer = await screen.findByRole("dialog");
  fireEvent.click(within(drawer).getByRole("button", { name: "Call patient" }));
  expect(drawer).toHaveTextContent("Serving");
  fireEvent.click(within(drawer).getByRole("button", { name: "Mark as done" }));
  expect(drawer).toHaveTextContent("Completed");
  fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Call next" }));
  expect(screen.getByText("A-021", { selector: "dd" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Queue History" }));
  await screen.findByRole("heading", { name: "Queue history" });
  expect(screen.getByText("Sara Ali")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
  const navigation = await screen.findByRole("dialog");
  fireEvent.click(within(navigation).getByRole("link", { name: "Patients" }));
  await screen.findByRole("heading", { name: "Patients" });
  fireEvent.change(screen.getByRole("textbox", { name: "Search patients" }), {
    target: { value: "Sara" },
  });
  expect(screen.getByText("Sara Ali")).toBeInTheDocument();
  expect(screen.queryByText("Ahmed Khan")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Settings" }));
  await screen.findByRole("heading", { name: "Settings" });
  fireEvent.change(screen.getByRole("textbox", { name: "Public clinic name" }), {
    target: { value: "Northstar Reception" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await act(async () => {
    await router.navigate({ to: "/public-display" });
  });
  expect(screen.getByText("Northstar Reception")).toBeInTheDocument();
  expect(screen.getByText("A-021")).toBeInTheDocument();
  expect(screen.queryByText("Usman Ahmed")).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  act(() => actions.markDone());
  expect(screen.getByText("No token is currently being served.")).toBeInTheDocument();
  expect(screen.queryByText("No patients waiting")).not.toBeInTheDocument();
}, 30000);
