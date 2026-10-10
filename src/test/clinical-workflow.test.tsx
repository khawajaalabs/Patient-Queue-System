import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrescriptionItems } from "@/components/prescription-items";
import { PrescriptionPreview } from "@/components/prescription-preview";
import { AttachmentFields, uploadAppointmentFiles } from "@/components/appointment-files";
import type { ClinicalVisit } from "@/types/clinical";
const f = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/api/client", () => ({ api: f.api }));
const medicine = {
  medicine: "Historical medicine",
  dose: "1 tablet",
  frequency: "Daily",
  duration: "5 days",
  instructions: "With food",
};
const visit = {
  id: "old",
  clinicId: "clinic",
  clinicName: "Clinic",
  clinicAddress: "Address",
  clinicPhone: "12345678",
  patientName: "Patient",
  patientId: "patient",
  doctorName: "Doctor",
  visitAt: "2026-10-09T10:00:00Z",
  status: "completed",
  prescription: { id: "rx-old", instructions: "Advice", items: [medicine] },
  followUpDate: null,
  followUpInstructions: "",
} as ClinicalVisit;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  f.api.mockReset();
});
it("copies historical prescriptions into draft only and prevents repeated copy", async () => {
  f.api.mockResolvedValue([]);
  const change = vi.fn();
  render(<PrescriptionItems clinicId="clinic" items={[]} onChange={change} previous={[visit]} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy to draft" }));
  expect(change).toHaveBeenCalledWith([expect.objectContaining(medicine)]);
  expect(screen.getByRole("button", { name: "Copied to draft" })).toBeDisabled();
  expect(visit.prescription.items).toEqual([medicine]);
  expect(f.api.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});
it("preview and print use the current draft without saving or completing", async () => {
  f.api.mockImplementation((path: string) =>
    Promise.resolve(
      path.includes("signature")
        ? {}
        : { clinic: { display_name: "Clinic", logo_url: "", footer: "", email: "" }, doctor: null },
    ),
  );
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  render(
    <PrescriptionPreview
      visit={{
        ...visit,
        status: "in_progress",
        prescription: {
          instructions: "Current edited advice",
          items: [{ ...medicine, medicine: "Current draft medicine" }],
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview prescription" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Current draft medicine");
  expect(screen.getByRole("dialog")).toHaveTextContent("Current edited advice");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Print prescription" })).not.toBeDisabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Print prescription" }));
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  expect(f.api.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("file selection rejects oversized files before requesting an upload", () => {
  const change = vi.fn();
  render(<AttachmentFields files={[]} onChange={change} />);
  const file = new File(["x"], "large.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: 10485761 });
  fireEvent.change(screen.getByLabelText("Add supporting files"), { target: { files: [file] } });
  expect(screen.getByRole("alert")).toHaveTextContent("10 MB");
  expect(change).not.toHaveBeenCalled();
  expect(f.api).not.toHaveBeenCalled();
});
it("a failed upload does not prevent another file completing and discards its pending record", async () => {
  const good = new File(["%PDF-1.7"], "good.pdf", { type: "application/pdf" });
  const bad = new File(["%PDF-1.7"], "bad.pdf", { type: "application/pdf" });
  f.api.mockImplementation((path: string) =>
    Promise.resolve(
      path.endsWith("/attachments")
        ? { id: f.api.mock.calls.length === 1 ? "bad" : "good", uploadUrl: "https://upload.test" }
        : {},
    ),
  );
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({ ok: false } as Response)
    .mockResolvedValueOnce({ ok: true } as Response);
  const progress = vi.fn();
  const count = await uploadAppointmentFiles(
    "appointment",
    [
      { key: "bad", file: bad, title: "Bad", type: "other", state: "Waiting", error: "" },
      { key: "good", file: good, title: "Good", type: "lab_report", state: "Waiting", error: "" },
    ],
    progress,
  );
  expect(count).toBe(1);
  expect(f.api).toHaveBeenCalledWith("/appointment-attachments/bad", { method: "DELETE" });
  expect(progress).toHaveBeenCalledWith("good", "Uploaded");
});
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
it("controlled dialogs restore keyboard focus to their opener on Escape", async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open clinical dialog</button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Clinical dialog</DialogTitle>
            <DialogDescription>Focus verification</DialogDescription>
            <input aria-label="Dialog field" />
          </DialogContent>
        </Dialog>
      </>
    );
  }
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Open clinical dialog" });
  opener.focus();
  fireEvent.click(opener);
  await screen.findByRole("dialog");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(opener).toHaveFocus();
});
