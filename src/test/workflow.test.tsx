import { NextPatient } from "@/components/next-patient";
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Today } from "@/routes/admin.index";
import { Appointments } from "@/routes/patient.appointments";
import { Clinics } from "@/routes/admin.clinics";
import { AppointmentNextAction, todayKey } from "@/components/appointment-rows";
import { Patients } from "@/routes/admin.patients";
import type { FlowAppointment, TodayState } from "@/types/workflow";
const f = vi.hoisted(() => ({
  api: vi.fn(),
  selected: "clinic",
  clinics: [
    { id: "clinic", name: "Health Point", city: "Karachi", area: "Clifton", active: true },
    { id: "inactive", name: "Inactive", city: "Karachi", area: "Clifton", active: false },
  ],
}));
vi.mock("@/api/client", () => ({ api: f.api }));
vi.mock("@/providers/clinic-provider", () => ({
  useClinicContext: () => ({ selected: f.selected, clinics: f.clinics, select: vi.fn() }),
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ profile: { role: "admin", fullName: "Doctor" } }),
}));
vi.mock("@/components/appointment-slot-picker", () => ({
  AppointmentSlotPicker: () => (
    <input name="scheduledAt" aria-label="Available slot" defaultValue="2026-10-12T10:00" />
  ),
}));
const base: TodayState = {
  date: todayKey(),
  clinics: [],
  setup: "clinic",
  unscheduled: [],
  appointments: [],
  queue: [],
  inProgress: [],
};
const appointment: FlowAppointment = {
  id: "appointment",
  clinicId: "clinic",
  clinicName: "Clinic",
  patientId: "patient",
  patientName: "Ali",
  reason: "Visit",
  status: "scheduled",
  scheduledAt: todayKey() + "T10:00",
};
afterEach(() => {
  cleanup();
  f.api.mockReset();
});
it("Home guides clinic setup without analytics clutter", async () => {
  f.api.mockResolvedValue(base);
  render(<Today />);
  expect(await screen.findByText("Add your first clinic")).toBeVisible();
  expect(screen.getByRole("button", { name: "Add clinic" }).closest("a")).toHaveAttribute(
    "href",
    "/admin/clinics",
  );
  expect(screen.queryByText("Revenue received")).toBeNull();
});
it("Home guides schedule setup before patient booking", async () => {
  f.api.mockResolvedValue({
    ...base,
    setup: "schedule",
    clinics: f.clinics,
    unscheduled: f.clinics,
  });
  render(<Today />);
  expect(await screen.findByRole("button", { name: "Set doctor schedule" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Set doctor schedule" }).closest("a")).toHaveAttribute(
    "href",
    "/admin/doctor-schedule?clinicId=clinic",
  );
});
it("configured Home shows Next up and obvious check-in action", async () => {
  f.api.mockResolvedValue({ ...base, setup: "ready", appointments: [appointment] });
  render(<Today />);
  expect(await screen.findByText("Next up")).toBeVisible();
  expect(screen.getByRole("button", { name: "Check in" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Start Consultation" })).toBeNull();
});
it("appointment in consultation exposes continue instead of irrelevant mutations", () => {
  render(
    <AppointmentNextAction
      a={{ ...appointment, visitId: "visit", visitStatus: "in_progress" }}
      onChanged={() => {}}
    />,
  );
  expect(screen.getByRole("link", { name: /Continue consultation/ })).toHaveAttribute(
    "href",
    "/admin/visits/visit",
  );
  expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
});
it("patient booking has City Area Clinic and no upload controls; submits only booking fields", async () => {
  f.api.mockImplementation((path: string) =>
    Promise.resolve(path === "/patient/appointments" ? [] : {}),
  );
  render(<Appointments />);
  fireEvent.click(screen.getByRole("button", { name: "Book appointment" }));
  expect(screen.getByRole("button", { name: "City" })).toHaveTextContent("Karachi");
  expect(screen.getByRole("button", { name: "Area" })).toHaveTextContent("Clifton");
  expect(screen.getByRole("button", { name: "Clinic" })).toHaveTextContent("Health Point");
  expect(screen.queryByLabelText("Add supporting files")).toBeNull();
  expect(document.querySelector("input[type=file]")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Review booking" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
  await waitFor(() =>
    expect(f.api).toHaveBeenCalledWith(
      "/patient/appointments",
      expect.objectContaining({
        method: "POST",
        body: { clinicId: "clinic", scheduledAt: "2026-10-12T10:00", reason: "", patientNotes: "" },
      }),
    ),
  );
});
it("clinic setup requires structured location and omits prefix and queue-average controls", async () => {
  f.api.mockResolvedValue([]);
  render(<Clinics />);
  fireEvent.click(screen.getByRole("button", { name: "Add clinic" }));
  expect(screen.getByRole("button", { name: "City" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Area" })).toBeDisabled();
  expect(screen.getByLabelText("Clinic name")).toBeVisible();
  expect(screen.queryByLabelText("Token prefix")).toBeNull();
  expect(screen.queryByLabelText("Average consultation minutes")).toBeNull();
});
it("condition groups and free-text matches remain clearly distinguished", async () => {
  f.api.mockImplementation((path: string) =>
    Promise.resolve(
      path.startsWith("/admin/conditions") ? [{ id: "diabetes", name: "Diabetes", count: 2 }] : [],
    ),
  );
  render(<Patients />);
  expect(await screen.findByRole("button", { name: "Diabetes · 2" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Diabetes · 2" }));
  await waitFor(() =>
    expect(f.api.mock.calls.some(([path]) => path.includes("conditionId=diabetes"))).toBe(true),
  );
  expect(screen.getByText(/Group counts use explicit tags only/)).toBeVisible();
});

it("completed visit opens the next waiting patient with clinic/token context", async () => {
  f.api.mockResolvedValue({
    ...base,
    setup: "ready",
    queue: [{ id: "next-token", patient_id: "next-patient", status: "waiting" }],
  });
  render(<NextPatient clinicId="clinic" patientId="previous-patient" />);
  await waitFor(() =>
    expect(screen.getByRole("link", { name: /Open next patient/ })).toHaveAttribute(
      "href",
      "/admin/patient-record/next-patient?clinicId=clinic&tokenId=next-token",
    ),
  );
});
