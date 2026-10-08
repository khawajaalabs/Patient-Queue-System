import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { SelectField } from "@/components/form-controls";
import { Field } from "@/components/qc";
import { selectOption } from "./select-option";

afterEach(cleanup);

it("keeps empty values, required validation, change events and FormData", async () => {
  const changed = vi.fn();
  const { container } = render(
    <form>
      <label>
        Patient
        <SelectField name="patientId" required onChange={(e) => changed(e.target.value)}>
          <option value="">Choose a patient</option>
          <option value="p-1">Ahmed</option>
          <option value="p-2" disabled>
            Unavailable
          </option>
        </SelectField>
      </label>
    </form>,
  );
  const form = container.querySelector("form")!;
  expect(form.checkValidity()).toBe(false);
  await selectOption(screen.getByRole("combobox", { name: "Patient" }), "Ahmed");
  expect(changed).toHaveBeenLastCalledWith("p-1");
  expect(new FormData(form).get("patientId")).toBe("p-1");
  expect(form.checkValidity()).toBe(true);
  await selectOption(screen.getByRole("combobox", { name: "Patient" }), "Choose a patient");
  expect(new FormData(form).get("patientId")).toBe("");
  expect(form.checkValidity()).toBe(false);
});

it("supports controlled dropdowns and the implicit first-option default", async () => {
  function Controlled() {
    const [value, setValue] = useState("a");
    return (
      <form>
        <SelectField
          aria-label="Status"
          name="status"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="a">Active</option>
          <option value="b">Booked</option>
        </SelectField>
        <SelectField aria-label="Method" name="method">
          <option value="cash">Cash</option>
          <option value="card">Card</option>
        </SelectField>
      </form>
    );
  }
  const { container } = render(<Controlled />);
  await selectOption(screen.getByRole("combobox", { name: "Status" }), "Booked");
  const data = new FormData(container.querySelector("form")!);
  expect(data.get("status")).toBe("b");
  expect(data.get("method")).toBe("cash");
});

it("uses a themed calendar, preserves date strings and enforces max/required", async () => {
  const changed = vi.fn();
  const { container } = render(
    <form>
      <Field
        label="Date of birth"
        type="date"
        name="dob"
        defaultValue="2026-10-08"
        max="2026-10-09"
        required
        onChange={(e) => changed(e.target.value)}
      />
    </form>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose date" }));
  expect(screen.getByRole("grid")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Choose the Month" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Friday, October 9th, 2026/ }));
  expect(changed).toHaveBeenLastCalledWith("2026-10-09");
  const form = container.querySelector("form")!;
  expect(new FormData(form).get("dob")).toBe("2026-10-09");
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2026-10-10" } });
  expect(form.checkValidity()).toBe(false);
});

it.each(["time", "datetime-local"])(
  "preserves %s payloads and offers custom time selection",
  async (type) => {
    const start = type === "time" ? "09:15" : "2026-10-08T09:15";
    const { container } = render(
      <form>
        <Field label="Appointment" type={type} name="at" defaultValue={start} required />
      </form>,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: type === "time" ? "Choose time" : "Choose date and time",
      }),
    );
    await selectOption(screen.getByRole("combobox", { name: "Hour" }), "14");
    await selectOption(screen.getByRole("combobox", { name: "Minute" }), "35");
    expect(new FormData(container.querySelector("form")!).get("at")).toBe(
      type === "time" ? "14:35" : "2026-10-08T14:35",
    );
    expect(container.querySelector("form")!.checkValidity()).toBe(true);
  },
);

it("supports keyboard opening, disabled fields and native form reset", async () => {
  const { container } = render(
    <form>
      <label>
        Status
        <SelectField name="status" defaultValue="a">
          <option value="a">Active</option>
          <option value="b">Booked</option>
        </SelectField>
      </label>
      <Field label="Date" name="date" type="date" defaultValue="2026-10-08" />
      <SelectField aria-label="Disabled" disabled>
        <option>Unavailable</option>
      </SelectField>
    </form>,
  );
  expect(screen.getByRole("combobox", { name: "Disabled" })).toBeDisabled();
  await selectOption(screen.getByRole("combobox", { name: "Status" }), "Booked");
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-09" } });
  fireEvent.reset(container.querySelector("form")!);
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Active");
  expect(screen.getByLabelText("Date")).toHaveValue("2026-10-08");
  expect(new FormData(container.querySelector("form")!).get("date")).toBe("2026-10-08");
});
