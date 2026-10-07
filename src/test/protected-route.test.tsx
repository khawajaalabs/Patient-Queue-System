import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { UserProfile } from "@/types/local";
const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  retry: vi.fn(),
  profile: null as UserProfile | null,
  loading: false,
  error: "",
}));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => fixture }));
vi.mock("@/services/auth", () => ({ logout: vi.fn() }));
vi.mock("@/components/qc", () => ({
  Btn: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
import { ProtectedRoute } from "@/components/protected-route";
beforeEach(() => {
  fixture.navigate.mockReset();
  fixture.retry.mockReset();
  fixture.profile = null;
  fixture.loading = false;
  fixture.error = "";
});
afterEach(cleanup);
const profile = (role: UserProfile["role"]): UserProfile => ({
  id: "guard-user",
  uid: "guard-user",
  fullName: "Guard User",
  email: "guard@example.com",
  phone: "123",
  role,
  clinicId: "northstar",
});
it("redirects logged-out users without rendering protected content", async () => {
  render(<ProtectedRoute role="patient">Protected content</ProtectedRoute>);
  await waitFor(() =>
    expect(fixture.navigate).toHaveBeenCalledWith({ to: "/login", replace: true }),
  );
  expect(screen.queryByText("Protected content")).toBeNull();
});
it("keeps patients out of staff screens", async () => {
  fixture.profile = profile("patient");
  render(<ProtectedRoute role="admin">Protected content</ProtectedRoute>);
  await waitFor(() =>
    expect(fixture.navigate).toHaveBeenCalledWith({ to: "/patient/dashboard", replace: true }),
  );
  expect(screen.queryByText("Protected content")).toBeNull();
});
it("redirects staff from patient screens to their workspace", async () => {
  fixture.profile = profile("admin");
  render(<ProtectedRoute role="patient">Protected content</ProtectedRoute>);
  await waitFor(() =>
    expect(fixture.navigate).toHaveBeenCalledWith({ to: "/admin", replace: true }),
  );
  expect(screen.queryByText("Protected content")).toBeNull();
});
it.each(["patient", "admin"] as const)("renders the correct %s workspace", (role) => {
  fixture.profile = profile(role);
  render(<ProtectedRoute role={role}>Protected content</ProtectedRoute>);
  expect(screen.getByText("Protected content")).toBeInTheDocument();
  expect(fixture.navigate).not.toHaveBeenCalled();
});
it("waits for authentication before deciding navigation", () => {
  fixture.loading = true;
  render(<ProtectedRoute role="patient">Protected content</ProtectedRoute>);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.queryByText("Protected content")).toBeNull();
  expect(fixture.navigate).not.toHaveBeenCalled();
});
it("shows profile errors with a working retry instead of exposing content", () => {
  fixture.error = "Profile is unavailable.";
  render(<ProtectedRoute role="patient">Protected content</ProtectedRoute>);
  expect(screen.getByRole("alert")).toHaveTextContent(fixture.error);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(fixture.retry).toHaveBeenCalledOnce();
  expect(screen.queryByText("Protected content")).toBeNull();
  expect(fixture.navigate).not.toHaveBeenCalled();
});
