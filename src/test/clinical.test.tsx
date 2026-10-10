import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VisitEditor } from "@/components/visit-editor";
import { PatientVisitView } from "@/components/clinical";
import type { ClinicalVisit } from "@/types/clinical";
const fixture = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/api/client", () => ({ api: fixture.api }));
const visit: ClinicalVisit = {
  id: "visit-one",
  patientId: "patient-one",
  patientName: "Known Patient",
  clinicId: "northstar",
  clinicName: "Clinic One",
  clinicAddress: "Clinic address",
  clinicPhone: "123456789",
  doctorId: "doctor-one",
  doctorName: "Main Doctor",
  visitAt: "2026-10-08T09:00:00Z",
  status: "in_progress",
  patientSummary: "Released summary",
  diagnosis: "Recorded diagnosis",
  releaseDiagnosis: false,
  reasonForVisit: "Review",
  chiefComplaint: "Complaint",
  historyNotes: "PRIVATE HISTORY",
  examinationNotes: "PRIVATE EXAM",
  privateNotes: "PRIVATE DOCTOR NOTES",
  treatmentPlan: "Doctor plan",
  followUpInstructions: "Doctor follow-up advice",
  followUpDate: null,
  completedAt: null,
  createdAt: "2026-10-08T09:00:00Z",
  updatedAt: "2026-10-08T09:00:00Z",
  tokenId: null,
  tokenCode: null,
  appointmentId: null,
  appointmentAt: null,
  vitals: {
    systolic: null,
    diastolic: null,
    pulse: null,
    temperature: null,
    respiratoryRate: null,
    oxygenSaturation: null,
    weight: null,
    height: null,
  },
  prescription: { instructions: "Doctor instructions", items: [] },
};
afterEach(() => {
  cleanup();
  fixture.api.mockReset();
});
it("adds/removes free-text medicine rows and saves structured vitals and notes", async () => {
  fixture.api.mockImplementation((path: string) =>
    Promise.resolve(path.includes("medicine-library") ? [] : visit),
  );
  const saved = vi.fn();
  render(<VisitEditor visit={visit} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText("Pulse (bpm)"), { target: { value: "72" } });
  fireEvent.click(screen.getByRole("button", { name: "Add medicine" }));
  fireEvent.change(screen.getByLabelText("Medicine name 1"), { target: { value: "Medicine one" } });
  fireEvent.click(screen.getByRole("button", { name: "Add medicine" }));
  fireEvent.change(screen.getByLabelText("Medicine name 2"), { target: { value: "Medicine two" } });
  fireEvent.click(screen.getByRole("button", { name: "Remove medicine 2" }));
  expect(screen.queryByLabelText("Medicine name 2")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add medicine" }));
  fireEvent.change(screen.getByLabelText("Medicine name 2"), {
    target: { value: "Medicine three" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(fixture.api).toHaveBeenCalledWith(
    "/admin/visits/visit-one",
    expect.objectContaining({
      method: "PUT",
      body: expect.objectContaining({
        vitals: expect.objectContaining({ pulse: 72 }),
        prescription: expect.objectContaining({
          items: [
            expect.objectContaining({ medicine: "Medicine one" }),
            expect.objectContaining({ medicine: "Medicine three" }),
          ],
        }),
      }),
    }),
  );
});
it("completes a visit through the dedicated transactional endpoint", async () => {
  fixture.api.mockImplementation((path: string) =>
    Promise.resolve(path.includes("medicine-library") ? [] : { ...visit, status: "completed" }),
  );
  render(<VisitEditor visit={visit} onSaved={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Complete Visit" }));
  await waitFor(() =>
    expect(fixture.api).toHaveBeenCalledWith(
      "/admin/visits/visit-one/complete",
      expect.objectContaining({ method: "POST" }),
    ),
  );
});
it("patient detail renders released fields and prescription without private doctor working notes", () => {
  fixture.api.mockResolvedValue(null);
  render(
    <PatientVisitView
      visit={{
        ...visit,
        status: "completed",
        diagnosis: null,
        prescription: {
          instructions: "Advice",
          items: [
            {
              medicine: "Free-text medicine",
              dose: "10 mg",
              frequency: "Daily",
              duration: "5 days",
              instructions: "As recorded",
            },
          ],
        },
      }}
    />,
  );
  expect(screen.getByText("Released summary")).toBeInTheDocument();
  expect(screen.getByText("Free-text medicine")).toBeInTheDocument();
  expect(screen.queryByText("PRIVATE DOCTOR NOTES")).toBeNull();
  expect(screen.queryByText("PRIVATE HISTORY")).toBeNull();
  expect(screen.queryByText("Recorded diagnosis")).toBeNull();
});
