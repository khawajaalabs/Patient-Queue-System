import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  verify: vi.fn(),
  reset: vi.fn(),
  google: vi.fn(),
  complete: vi.fn(),
  api: vi.fn(),
}));
vi.mock("@/services/auth", () => ({
  requestPasswordReset: mocks.request,
  verifyPasswordRecovery: mocks.verify,
  resetPassword: mocks.reset,
  beginGoogleLogin: mocks.google,
  completeGoogleProfile: mocks.complete,
  login: vi.fn(),
  register: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api: mocks.api }));
import { ForgotPassword } from "@/routes/forgot-password";
import { ResetPassword } from "@/routes/reset-password";
import { CompleteProfile } from "@/routes/complete-profile";
import { Route as LoginRoute } from "@/routes/login";
function app(path: string, component: import("@tanstack/react-router").RouteComponent) {
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({ getParentRoute: () => root, path, component });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
afterEach(cleanup);
it("offers Google only on the patient login tab", async () => {
  app("/login", LoginRoute.options.component!);
  await screen.findByRole("button", { name: "Continue with Google" });
  fireEvent.click(screen.getByRole("button", { name: "Clinic staff" }));
  expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});
it("requests recovery with a generic confirmation", async () => {
  mocks.request.mockResolvedValue({});
  app("/forgot-password", ForgotPassword);
  fireEvent.change(await screen.findByLabelText("Email"), {
    target: { value: "patient@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(await screen.findByRole("status")).toHaveTextContent("If an account exists");
  expect(mocks.request).toHaveBeenCalledWith("patient@example.com");
});
it("verifies the email code, removes it from the URL and validates matching passwords", async () => {
  window.history.replaceState(null, "", "/reset-password?flow=flow-proof&code=auth-code");
  mocks.verify.mockResolvedValue("queuecare-one-use-token");
  mocks.reset.mockResolvedValue({});
  app("/reset-password", ResetPassword);
  const password = await screen.findByLabelText("New password");
  expect(mocks.verify).toHaveBeenCalledWith("flow-proof", "auth-code");
  expect(window.location.search).toBe("");
  fireEvent.change(password, { target: { value: "NewPassword123!" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "Different123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match");
  expect(mocks.reset).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "NewPassword123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  expect(await screen.findByRole("status")).toHaveTextContent("password has been updated");
  expect(mocks.reset).toHaveBeenCalledWith(
    "queuecare-one-use-token",
    "NewPassword123!",
    "NewPassword123!",
  );
});
it("invalid recovery links never display a password form", async () => {
  app("/reset-password", ResetPassword);
  expect(await screen.findByRole("alert")).toHaveTextContent("invalid");
  expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
});
it("requires a real phone number for a new Google patient", async () => {
  mocks.api.mockResolvedValue({ email: "google@example.com", fullName: "Google Patient" });
  mocks.complete.mockResolvedValue({});
  app("/complete-profile", CompleteProfile);
  const phone = await screen.findByLabelText("Phone");
  expect(phone).toBeRequired();
  expect(phone).toHaveValue("");
  expect(screen.getByLabelText("Full name")).toHaveValue("Google Patient");
  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/auth/google/profile"));
});
