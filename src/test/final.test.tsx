import { selectOption } from "./select-option";
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
it("patient summary preserves bills and follow-up while omitting documents", async () => {
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
  expect(await screen.findByText("Return for review")).toBeInTheDocument();
  expect(screen.queryByText("Released report")).toBeNull();
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
  await selectOption(screen.getByLabelText("Report period"), "This month");
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
it("appointments default to Today with Upcoming and Past filters", async () => {
  fixture.api.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith("/appointments/available-slots") ? { slots: [] } : []),
  );
  render(<AppointmentCalendar />);
  expect(await screen.findByRole("button", { name: "Today" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
  expect(await screen.findByText("No appointments match these filters.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add appointment" }));
  expect(await screen.findByLabelText("Appointment date")).toBeInTheDocument();
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
it("empty patient summary keeps appointment booking and one care-history empty state", async () => {
  fixture.api.mockResolvedValue({
    appointment: null,
    visit: null,
    prescription: null,
    document: null,
    bills: { balance: 0 },
    followups: [],
    notifications: [],
  });
  render(<PatientSummary />);
  expect(await screen.findByText("Upcoming appointment")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Book Appointment" })).toHaveAttribute(
    "href",
    "/patient/appointments?book=1",
  );
  expect(
    screen.getAllByText(
      "Your care summary will appear here after your first appointment or clinic visit.",
    ),
  ).toHaveLength(1);
  for (const title of [
    "Latest visit",
    "Latest prescription",
    "Latest released document",
    "Outstanding bills",
    "Follow-up recommendations",
    "Recent notifications",
  ])
    expect(screen.queryByText(title)).toBeNull();
});
it("patient summary hides empty sections while retaining real visit data", async () => {
  fixture.api.mockResolvedValue({
    appointment: null,
    visit: { visit_at: "2026-10-08T09:00:00Z", clinic_name: "Clinic One" },
    prescription: null,
    document: null,
    bills: { balance: 0 },
    followups: [],
    notifications: [],
  });
  render(<PatientSummary />);
  expect(await screen.findByText("Latest visit")).toBeInTheDocument();
  expect(screen.queryByText("Outstanding bills")).toBeNull();
  expect(screen.queryByText("Recent notifications")).toBeNull();
  expect(
    screen.queryByText(
      "Your care summary will appear here after your first appointment or clinic visit.",
    ),
  ).toBeNull();
});
it("upcoming appointment remains visible without an unnecessary booking CTA", async () => {
  fixture.api.mockResolvedValue({
    appointment: { scheduled_at: "2026-10-09T10:00", clinic_name: "Clinic One" },
    visit: null,
    prescription: null,
    document: null,
    bills: { balance: 0 },
    followups: [],
    notifications: [],
  });
  render(<PatientSummary />);
  expect(await screen.findByRole("link", { name: /Upcoming appointment/ })).toHaveAttribute(
    "href",
    "/patient/appointments",
  );
  expect(screen.queryByRole("link", { name: "Book Appointment" })).toBeNull();
});
