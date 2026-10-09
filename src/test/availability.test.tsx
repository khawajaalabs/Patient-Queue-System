import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppointmentSlotPicker } from "@/components/appointment-slot-picker";
import { DoctorSchedule } from "@/routes/admin.doctor-schedule";
import { selectOption } from "./select-option";
const fixture = vi.hoisted(() => ({ api: vi.fn(), selected: "northstar" }));
vi.mock("@/api/client", () => ({ api: fixture.api }));
vi.mock("@/providers/clinic-provider", () => ({
  useClinicContext: () => ({
    selected: fixture.selected,
    clinics: [{ id: "northstar", name: "Northstar" }],
  }),
}));
beforeEach(() => {
  fixture.api.mockReset();
  fixture.selected = "northstar";
});
afterEach(cleanup);
it("slot picker uses only backend times and preserves normalized submission values", async () => {
  fixture.api.mockResolvedValue({
    slots: [
      { value: "2030-01-07T10:30", label: "10:30 AM" },
      { value: "2030-01-07T14:00", label: "2:00 PM" },
    ],
  });
  const { container } = render(
    <form>
      <AppointmentSlotPicker clinicId="northstar" defaultValue="2030-01-07" />
    </form>,
  );
  await waitFor(() => expect(screen.getByLabelText("Available times")).not.toBeDisabled());
  await selectOption(screen.getByLabelText("Available times"), "2:00 PM");
  expect(new FormData(container.querySelector("form")!).get("scheduledAt")).toBe(
    "2030-01-07T14:00",
  );
  expect(fixture.api).toHaveBeenCalledWith(
    "/appointments/available-slots?clinicId=northstar&date=2030-01-07",
    expect.anything(),
  );
  expect(screen.queryByText("1:00 PM")).toBeNull();
});
it("slot picker clears selection when date changes and shows no availability", async () => {
  fixture.api
    .mockResolvedValueOnce({ slots: [{ value: "2030-01-07T10:30", label: "10:30 AM" }] })
    .mockResolvedValue({ slots: [] });
  const { container } = render(
    <form>
      <AppointmentSlotPicker clinicId="northstar" defaultValue="2030-01-07T10:30" />
    </form>,
  );
  await waitFor(() =>
    expect(new FormData(container.querySelector("form")!).get("scheduledAt")).toBe(
      "2030-01-07T10:30",
    ),
  );
  fireEvent.change(screen.getByLabelText("Appointment date"), { target: { value: "2030-01-08" } });
  expect(
    await screen.findByText("No appointments are available on this date."),
  ).toBeInTheDocument();
  expect(new FormData(container.querySelector("form")!).get("scheduledAt")).not.toBe(
    "2030-01-07T10:30",
  );
});
it("doctor schedule supports split shifts, day off and saves existing duration setting", async () => {
  fixture.api.mockResolvedValue({
    windows: [{ weekday: 1, startTime: "10:00", endTime: "12:00" }],
    slotMinutes: 30,
    openingTime: "09:00",
    closingTime: "17:00",
  });
  render(<DoctorSchedule />);
  await screen.findByLabelText("Monday start 1");
  fireEvent.click(screen.getByRole("button", { name: "+ Add another time" }));
  await screen.findByLabelText("Monday start 2");
  fireEvent.change(screen.getByLabelText("Monday start 2"), { target: { value: "14:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() =>
    expect(fixture.api).toHaveBeenCalledWith("/admin/doctor-availability?clinicId=northstar", {
      method: "PUT",
      body: {
        slotMinutes: 30,
        windows: [
          { weekday: 1, startTime: "10:00", endTime: "12:00" },
          { weekday: 1, startTime: "14:00", endTime: "17:00" },
        ],
      },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Mark day off" }));
  expect(screen.queryByLabelText("Monday start 1")).toBeNull();
});
