import { describe, expect, it } from "vitest";
import { clinicDayKey, patientPosition, publicProjection } from "../domain/queue.js";
it("uses Karachi's day at the UTC boundary", () => {
  expect(clinicDayKey(new Date("2026-10-05T20:30:00Z"))).toBe("2026-10-06");
});
it("counts only waiting tokens ahead, including requeue order", () => {
  const tokens = [
    { tokenCode: "A-001", status: "cancelled", queueOrder: 1 },
    { tokenCode: "A-003", status: "waiting", queueOrder: 3 },
    { tokenCode: "A-002", status: "waiting", queueOrder: 5 },
  ];
  expect(patientPosition(tokens, "A-002", 5)).toEqual({ ahead: 1, eta: 5 });
});
it("publishes only sanitized clinic/queue fields", () => {
  const pub = publicProjection(
    {
      name: "Clinic",
      department: "OPD",
      address: "Address",
      phone: "Clinic phone",
      tokenPrefix: "A",
      averageConsultationMinutes: 5,
    },
    { status: "open", queueDate: "2026-10-06" },
    [
      {
        tokenCode: "A-001",
        queueOrder: 1,
        status: "serving",
        patientId: "private-id",
        patientName: "PRIVATE NAME",
        phone: "PRIVATE PHONE",
        reasonForVisit: "PRIVATE REASON",
      },
    ],
  );
  expect(JSON.stringify(pub)).not.toMatch(/PRIVATE|private-id|patientId|reasonForVisit/);
  expect(pub["currentToken"]).toBe("A-001");
  expect(pub).not.toHaveProperty("phone");
});
