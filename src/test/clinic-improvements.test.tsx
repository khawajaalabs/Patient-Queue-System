import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import { PatientDemographics } from "@/components/patient-demographics";
import { useClinicalData } from "@/components/clinical";
import { MedicineLibrary } from "@/components/medicine-library";
import { Clinics } from "@/routes/admin.clinics";
import { ageOnDate, patientToday, validBirthDate } from "@/domain/patient-demographics";
import { groupClinicLocations } from "@/domain/locations";
import { selectOption } from "./select-option";
import type { PatientProfile } from "@/types/clinical";
const f = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/api/client", () => ({ api: f.api }));
vi.mock("@/providers/clinic-provider", () => ({
  useClinicContext: () => ({ selected: "clinic", clinics: [], select: vi.fn() }),
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ profile: { role: "admin", fullName: "Doctor" } }),
}));
const patient: PatientProfile = {
  id: "p",
  fullName: "Returning Patient",
  email: "p@test.invalid",
  phone: "03001234567",
  dateOfBirth: "2000-02-29",
  gender: "female",
  address: "",
  emergencyContactName: "Historical",
  emergencyContactPhone: "123456789",
  bloodGroup: "A+",
  allergies: "",
  chronicConditions: "",
  currentMedications: "",
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  f.api.mockReset();
});
it.each([
  ["2005-06-15", "2026-06-14", 20],
  ["2005-06-15", "2026-06-15", 21],
  ["2000-02-29", "2025-02-28", 24],
  ["2000-02-29", "2025-03-01", 25],
])("age uses completed years for %s at %s", (dob, date, age) =>
  expect(ageOnDate(dob, date)).toBe(age),
);
it("validates leap dates and Karachi calendar year boundaries", () => {
  expect(validBirthDate("2001-02-29")).toBe(false);
  expect(validBirthDate("2000-02-29")).toBe(true);
  expect(validBirthDate("2999-01-01")).toBe(false);
  expect(patientToday(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
});
it("reuses saved demographics, derives age and never offers removed fields", async () => {
  const { container } = render(
    <form>
      <PatientDemographics patient={patient} required />
    </form>,
  );
  expect(screen.getByLabelText("Patient name")).toHaveValue(patient.fullName);
  expect(screen.getByLabelText("Date of birth")).toHaveValue("2000-02-29");
  expect(screen.getByLabelText("Age (years)")).toHaveValue(String(ageOnDate(patient.dateOfBirth)));
  expect(screen.getByLabelText("Age (years)")).toHaveAttribute("readonly");
  expect(screen.queryByText("Blood group")).toBeNull();
  expect(screen.queryByText(/Emergency contact/)).toBeNull();
  await selectOption(screen.getByRole("combobox", { name: "Gender" }), "Prefer not to say");
  expect(new FormData(container.querySelector("form")!).get("gender")).toBe("prefer_not_to_say");
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2999-01-01" } });
  expect(container.querySelector("form")!.checkValidity()).toBe(false);
});
it("DOB maximum advances automatically across the Karachi new year", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-31T18:59:50Z"));
  const { container } = render(<PatientDemographics patient={patient} />);
  expect(container.querySelector("input[type=date]")).toHaveAttribute("max", "2026-12-31");
  act(() => {
    vi.advanceTimersByTime(30000);
  });
  expect(container.querySelector("input[type=date]")).toHaveAttribute("max", "2027-01-01");
});
it("DOB calendar excludes future years and supports the app calendar", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T08:00:00Z"));
  render(<PatientDemographics patient={patient} />);
  fireEvent.click(screen.getByRole("button", { name: "Choose date" }));
  expect(screen.getByRole("grid")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Choose the Year" })).toBeVisible();
  expect(document.querySelector('option[value="2027"]')).toBeNull();
});
it("same-path refresh keeps the editor mounted, preserves typing and updates results", async () => {
  let resolve: ((value: unknown) => void) | undefined;
  f.api.mockResolvedValueOnce({ label: "Initial" }).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  function Editor() {
    const r = useClinicalData<{ label: string }>("/record");
    const [draft, setDraft] = useState("");
    return (
      <>
        <button onClick={r.reload}>Refresh</button>
        {r.data ? (
          <>
            <p>{r.data.label}</p>
            <input
              aria-label="Unsaved clinical input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </>
        ) : (
          <p>Loading</p>
        )}
      </>
    );
  }
  render(<Editor />);
  await screen.findByText("Initial");
  const input = screen.getByLabelText("Unsaved clinical input");
  fireEvent.change(input, { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByText("Refresh"));
  expect(screen.getByLabelText("Unsaved clinical input")).toBe(input);
  expect(input).toHaveValue("Keep this draft");
  await act(async () => {
    resolve!({ label: "Updated" });
  });
  expect(await screen.findByText("Updated")).toBeVisible();
  expect(input).toHaveValue("Keep this draft");
  expect(f.api).toHaveBeenCalledTimes(2);
});
it("normalizes city and area cards without merging clinic identities", () => {
  const rows = [
    { id: "a", city: " Lahore ", area: "Gulberg" },
    { id: "b", city: "LAHORE", area: " Johar Town " },
    { id: "c", city: "lahore", area: "gulberg" },
  ];
  const groups = groupClinicLocations(rows);
  expect(groups).toHaveLength(1);
  expect(groups[0]!.areas).toHaveLength(2);
  expect(groups[0]!.areas[0]!.clinics.map((c) => c.id)).toEqual(["a", "c"]);
  expect(rows[0]!.city).toBe(" Lahore ");
});
it("one city card exposes Add Area with a fixed city", async () => {
  f.api.mockResolvedValue([
    { id: "a", name: "Clinic A", city: " Lahore ", area: "Gulberg", active: true },
    { id: "b", name: "Clinic B", city: "LAHORE", area: "DHA", active: true },
  ]);
  render(<Clinics />);
  expect(await screen.findByRole("heading", { name: "Lahore" })).toBeVisible();
  expect(screen.getAllByRole("button", { name: "+ Add Area" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "+ Add Area" }));
  expect(screen.getByLabelText("City")).toHaveValue("Lahore");
  expect(screen.getByLabelText("City")).toHaveAttribute("readonly");
  expect(screen.getByRole("button", { name: "Area" })).not.toBeDisabled();
});
it("medicine deletion confirms first, refreshes after success and reports an actual failure", async () => {
  const med = {
    id: "m",
    clinicId: "clinic",
    name: "Medicine",
    strength: "",
    dosageForm: "",
    defaultDose: "",
    defaultFrequency: "",
    defaultDuration: "",
    defaultInstructions: "",
    active: true,
  };
  f.api.mockResolvedValue([med]);
  render(<MedicineLibrary />);
  await screen.findByText("Medicine");
  fireEvent.click(screen.getByRole("button", { name: "Delete medicine" }));
  expect(screen.getByRole("alertdialog")).toBeVisible();
  expect(f.api.mock.calls.some(([, o]) => o?.method === "DELETE")).toBe(false);
  f.api.mockRejectedValueOnce(Error("Deletion failed"));
  fireEvent.click(screen.getByRole("button", { name: "Delete or archive" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Deletion failed"));
  expect(screen.getByText("Medicine")).toBeVisible();
});
