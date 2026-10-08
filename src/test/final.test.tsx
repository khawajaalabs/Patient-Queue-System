import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  GlobalSearch,
  PatientSummary,
  OperationalReports,
  FollowUps,
  AccountSettings,
  BrandingSettings,
  DataManagement,
} from "@/components/final-operations";
import { AppointmentCalendar } from "@/components/appointment-calendar";
const fixture = vi.hoisted(() => ({ api: vi.fn(), selected: "northstar", role: "admin" }));
vi.mock("@/api/client", () => ({ api: fixture.api }));
vi.mock("@/providers/clinic-provider", () => ({
  useClinicContext: () => ({ selected: fixture.selected, clinics: [], select: vi.fn() }),
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ profile: { id: "admin", role: fixture.role } }),
}));
beforeEach(() => {
  fixture.api.mockReset();
  fixture.selected = "northstar";
  fixture.role = "admin";
});
afterEach(cleanup);
it("patient summary shows released care, outstanding balance and doctor follow-up", async () => {
  fixture.api.mockResolvedValue({
    appointment: { scheduled_at: "2026-10-09T10:00", clinic_name: "Clinic One" },
    visit: null,
    prescription: null,
    document: { title: "Released report" },
    bills: { balance: 5000 },
    followups: [
      {
        id: "visit",
        follow_up_date: "2026-10-10",
        clinic_name: "Clinic One",
        instructions: "Return for review",
        status: "pending",
      },
    ],
    notifications: [],
  });
  render(<PatientSummary />);
  expect(await screen.findByText("Released report")).toBeInTheDocument();
  expect(screen.getByText("Return for review")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Outstanding bills/ })).toHaveAttribute(
    "href",
    "/patient/billing",
  );
  expect(screen.queryByText(/private notes/i)).toBeNull();
});
it("command search opens with keyboard and resolves authorized result links", async () => {
  fixture.api.mockResolvedValue([
    { id: "p", label: "Ahmed", detail: "0300", type: "patient", href: "/admin/patient-record/p" },
  ]);
  render(<GlobalSearch />);
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  fireEvent.change(await screen.findByLabelText("Search"), { target: { value: "Ahmed" } });
  expect(await screen.findByRole("link", { name: /Ahmed/ })).toHaveAttribute(
    "href",
    "/admin/patient-record/p",
  );
  expect(fixture.api).toHaveBeenCalledWith("/admin/search?q=Ahmed", expect.anything());
});
it("operational dashboard uses server totals and provides date controls", async () => {
  fixture.api.mockResolvedValue({
    totals: {
      patients: 3,
      appointments: 4,
      waiting: 1,
      completed: 2,
      cancelled: 0,
      revenue: 12345,
      outstanding: 100,
      documents: 0,
      followups: 0,
      averageWait: 7,
    },
    clinics: [],
    trend: [],
    statuses: [],
  });
  render(<OperationalReports />);
  expect(await screen.findByText("Completed consultations")).toBeInTheDocument();
  expect(screen.getByLabelText("From")).toBeInTheDocument();
  expect(screen.getByText("No appointments in this period.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Report period"), { target: { value: "month" } });
  await waitFor(() => expect(fixture.api.mock.calls.length).toBeGreaterThan(1));
});
it("follow-ups expose explicit actions and send audited mutations", async () => {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  fixture.api.mockResolvedValue([
    {
      id: "visit-one",
      patient_id: "patient",
      patient_name: "Patient One",
      clinic_name: "Clinic One",
      visit_at: "2026-10-01T09:00Z",
      follow_up_date: day,
      instructions: "Return as advised",
      status: "pending",
    },
  ]);
  render(<FollowUps />);
  fireEvent.click(await screen.findByRole("button", { name: "Mark contacted" }));
  await waitFor(() =>
    expect(fixture.api).toHaveBeenCalledWith("/admin/follow-ups/visit-one", {
      method: "PUT",
      body: { action: "contacted" },
    }),
  );
});
it("calendar supports all four views and empty scheduling states", async () => {
  fixture.api.mockResolvedValue([]);
  render(<AppointmentCalendar />);
  expect(await screen.findByRole("button", { name: "month" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "list" }));
  expect(await screen.findByText("No appointments match these filters.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add appointment" }));
  expect(await screen.findByLabelText("Date and time")).toBeInTheDocument();
});
it("account settings never show session tokens and reject mismatched confirmation", async () => {
  fixture.api.mockResolvedValue({
    profile: { fullName: "Doctor", email: "doctor@test.example", role: "admin" },
    googleLinked: false,
    sessions: [{ current: true, expiresAt: Date.now() + 10000 }],
  });
  render(<AccountSettings />);
  await screen.findByText(/Google account/);
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "OldPassword123!" },
  });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "NewPassword123!" } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "DifferentPassword123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("New passwords must match");
  expect(fixture.api).not.toHaveBeenCalledWith("/account/password", expect.anything());
  expect(screen.queryByText(/token_hash/)).toBeNull();
});
it("branding requires a specific clinic and exposes slot duration without redesign", async () => {
  fixture.api.mockResolvedValue({ doctor: { full_name: "Doctor" }, clinic: { slot_minutes: 20 } });
  render(<BrandingSettings />);
  expect(await screen.findByLabelText("Appointment slot duration (minutes)")).toHaveValue(20);
  expect(screen.getByLabelText("full name")).toHaveValue("Doctor");
});
it("unconfigured application email never offers fake delivery", async () => {
  fixture.api.mockResolvedValue({
    provider: "not_configured",
    pending: { count: 2 },
    statuses: [],
  });
  render(<DataManagement />);
  expect(await screen.findByRole("button", { name: "Deliver pending notices" })).toBeDisabled();
  expect(screen.getByText(/No delivery is claimed when unconfigured/)).toBeInTheDocument();
});
