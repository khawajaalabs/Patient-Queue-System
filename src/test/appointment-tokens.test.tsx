import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { AppointmentTokens, TokenActions } from "@/components/appointment-tokens";
import { clinicDayKey } from "@/utils/clinic-date";
const f = vi.hoisted(() => ({ api: vi.fn(), data: [] as unknown[], reload: vi.fn() }));
vi.mock("@/api/client", () => ({ api: f.api }));
vi.mock("@/components/clinical", () => ({
  useClinicalData: () => ({ data: f.data, reload: f.reload, error: "" }),
}));
vi.mock("@/providers/clinic-provider", () => ({
  useClinicContext: () => ({ clinics: [{ id: "clinic", city: "Karachi", area: "Clifton" }] }),
}));
afterEach(() => {
  cleanup();
  f.data = [];
  f.api.mockReset();
  f.reload.mockClear();
});
it("empty appointments offer booking without manual-token controls", () => {
  render(<AppointmentTokens />);
  expect(screen.getByRole("link", { name: /Book appointment/ })).toHaveAttribute(
    "href",
    "/patient/appointments?book=1",
  );
  expect(screen.queryByText(/Get.*token/)).toBeNull();
});
it("future appointment shows linked token, location, activation date and owned PDF URL", () => {
  f.data = [
    {
      id: "appointment",
      clinicId: "clinic",
      clinicName: "Health Point",
      scheduledAt: "2030-01-07T10:00",
      status: "scheduled",
      token: { id: "token", tokenCode: "HP-001", status: "waiting" },
    },
  ];
  render(<AppointmentTokens />);
  expect(screen.getByText("HP-001")).toBeVisible();
  expect(screen.getByText("Clifton · Karachi")).toBeVisible();
  expect(screen.getByText(/becomes active.*7 Jan/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Download token PDF" })).toHaveAttribute(
    "href",
    "/api/patient/tokens/token/pdf",
  );
});
it("today appointment has no future activation message", () => {
  f.data = [
    {
      id: "a",
      clinicId: "clinic",
      clinicName: "Health Point",
      scheduledAt: clinicDayKey() + "T10:00",
      status: "scheduled",
      token: { id: "t", tokenCode: "HP-002", status: "waiting" },
    },
  ];
  render(<AppointmentTokens />);
  expect(screen.queryByText(/becomes active/)).toBeNull();
});
it("give-up requires explicit confirmation and submits the token ID endpoint", async () => {
  f.api.mockResolvedValue({ id: "token" });
  render(
    <TokenActions
      token={{ id: "token", tokenCode: "HP-001", status: "waiting" }}
      onChanged={f.reload}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Give up token" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "Your place in this appointment queue will be released.",
  );
  expect(f.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep token" }));
  expect(f.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Give up token" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Give up token" }).at(-1)!);
  await waitFor(() =>
    expect(f.api).toHaveBeenCalledWith("/patient/tokens/token/give-up", {
      method: "POST",
      body: {},
    }),
  );
  expect(f.reload).toHaveBeenCalled();
});
it.each(["serving", "completed", "cancelled"])("%s tokens do not offer give-up", (status) => {
  render(<TokenActions token={{ id: "t", tokenCode: "HP-001", status }} />);
  expect(screen.queryByRole("button", { name: "Give up token" })).toBeNull();
  expect(screen.getByRole("link", { name: "Download token PDF" })).toBeVisible();
});
