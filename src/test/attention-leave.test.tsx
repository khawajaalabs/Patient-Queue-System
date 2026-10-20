import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
  renderHook,
} from "@testing-library/react";
import { AttentionEditor, AttentionBadges } from "@/components/appointment-attention";
import { DoctorLeave } from "@/components/doctor-leave";
import { selectOption } from "./select-option";
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));
const f = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/api/client", () => ({ api: f.api }));
beforeEach(() => {
  f.api.mockReset();
});
afterEach(cleanup);
it("shows a labelled priority and descriptive badges without colour-only meaning", () => {
  render(<AttentionBadges attention={{ priority: "critical", tags: ["needs_assistance"] }} />);
  expect(screen.getByText("Critical")).toBeVisible();
  expect(screen.getByText("Needs Assistance")).toBeVisible();
});
it("loads appointment-specific saved tags, edits them and shows audit history", async () => {
  f.api.mockImplementation(async (_path: string, opt?: { method?: string }) =>
    opt?.method === "PUT"
      ? { current: { priority: "urgent", tags: ["review_required"] }, history: [] }
      : {
          current: { priority: "critical", tags: ["follow_up"] },
          history: [
            {
              actor: "Doctor",
              at: "2031-01-01T10:00:00Z",
              before: { priority: "routine", tags: [] },
              after: { priority: "critical", tags: ["follow_up"] },
            },
          ],
        },
  );
  render(<AttentionEditor appointmentId="appointment-one" />);
  await screen.findByLabelText("Follow-up");
  expect(screen.getByLabelText("Follow-up")).toBeChecked();
  await selectOption(screen.getByLabelText("Appointment priority"), "Urgent");
  fireEvent.click(screen.getByLabelText("Follow-up"));
  fireEvent.click(screen.getByLabelText("Review Required"));
  fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
  await waitFor(() =>
    expect(f.api).toHaveBeenCalledWith("/admin/appointments/appointment-one/attention", {
      method: "PUT",
      body: { priority: "urgent", tags: ["review_required"] },
    }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Tags saved");
});
it("keeps errors visible and prevents duplicate tag saves while pending", async () => {
  let reject: (e: Error) => void = () => {};
  f.api.mockImplementation(async (_p: string, o?: { method?: string }) =>
    o?.method === "PUT"
      ? new Promise((_resolve, r) => {
          reject = r;
        })
      : { current: { priority: "routine", tags: [] }, history: [] },
  );
  render(<AttentionEditor appointmentId="appointment-two" />);
  await screen.findByLabelText("Follow-up");
  fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  reject(new Error("Save failed"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
});
it("previews leave conflicts and links affected appointments without activating leave", async () => {
  f.api.mockImplementation(async (path: string) =>
    path.includes("/conflicts?")
      ? [
          {
            id: "a1",
            clinicId: "c1",
            patientName: "Patient One",
            clinicName: "Clinic",
            scheduledAt: "2031-10-01T09:00",
          },
        ]
      : [],
  );
  render(<DoctorLeave />);
  fireEvent.change(screen.getByLabelText("Leave starts"), { target: { value: "2031-10-01" } });
  fireEvent.change(screen.getByLabelText("Leave ends"), { target: { value: "2031-10-02" } });
  fireEvent.click(screen.getByRole("button", { name: "Review leave" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("1 existing appointment");
  expect(screen.getByRole("link", { name: /Patient One/ })).toHaveAttribute(
    "href",
    "/admin/appointments?clinicId=c1&appointmentId=a1",
  );
  expect(screen.queryByRole("button", { name: "Confirm leave" })).not.toBeInTheDocument();
  expect(f.api.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false);
});
it("confirms range leave and safely removes it with existing confirmation controls", async () => {
  let leaves: any[] = [];
  f.api.mockImplementation(async (path: string, o?: { method?: string }) => {
    if (o?.method === "POST") {
      leaves = [{ id: "leave1", startDate: "2031-10-01", endDate: "2031-10-02", reason: "Away" }];
      return leaves[0];
    }
    if (o?.method === "DELETE") {
      leaves = [];
      return { id: "leave1" };
    }
    return path.includes("/conflicts?") ? [] : leaves;
  });
  render(<DoctorLeave />);
  fireEvent.change(screen.getByLabelText("Leave starts"), { target: { value: "2031-10-01" } });
  fireEvent.change(screen.getByLabelText("Leave ends"), { target: { value: "2031-10-02" } });
  fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Away" } });
  fireEvent.click(screen.getByRole("button", { name: "Review leave" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm leave" }));
  await screen.findByText("Away");
  fireEvent.click(screen.getByRole("button", { name: "Remove leave" }));
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove leave" }),
  );
  await waitFor(() =>
    expect(f.api).toHaveBeenCalledWith("/admin/doctor-leave/leave1", { method: "DELETE" }),
  );
});

it("live queue exposes six aligned columns and compact serving actions", async () => {
  const { LiveQueue } = await import("@/routes/admin.queue");
  const fixture = await import("@/test/fixtures/queue-store");
  const { result } = renderHook(() => fixture.useQueue());
  result.current.queue.find((e) => e.status === "serving")!.patientId = "fixture-serving-patient";
  render(<LiveQueue />);
  const table = screen.getByRole("table", { name: "Live queue" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Time", "Token", "Patient", "Priority", "Status", "Actions"]);
  const rows = within(table).getAllByRole("row");
  const headerColumns = rows[0]!.className.split(" ").find((c) => c.includes("grid-cols-["));
  expect(headerColumns).toBeTruthy();
  for (const row of rows.slice(1)) expect(row.className).toContain(headerColumns);
  const serving = rows.find((row) => within(row).queryByText("Serving"))!;
  expect(within(serving).getByRole("button", { name: "Start Consultation" })).toBeVisible();
  expect(within(serving).getByRole("button", { name: "Done" })).toBeVisible();
  expect(within(serving).getByText("Routine")).toBeVisible();
});

it("serving tokens with an active consultation show Continue and disable premature Done", async () => {
  const { LiveQueue } = await import("@/routes/admin.queue");
  const fixture = await import("@/test/fixtures/queue-store");
  fixture.actions.resetDemo();
  const { result } = renderHook(() => fixture.useQueue());
  Object.assign(
    result.current.queue.find((e) => e.status === "serving")!,
    { patientId: "p1", visitId: "visit-active", visitStatus: "in_progress" },
  );
  render(<LiveQueue />);
  const row = within(screen.getByRole("table", { name: "Live queue" }))
    .getAllByRole("row")
    .find((row) => within(row).queryByText("Serving"))!;
  expect(within(row).getByRole("link", { name: "Continue consultation" })).toHaveAttribute(
    "href",
    "/admin/visits/visit-active",
  );
  expect(within(row).getByRole("button", { name: "Done" })).toBeDisabled();
  expect(within(row).queryByRole("button", { name: "Start Consultation" })).not.toBeInTheDocument();
});
