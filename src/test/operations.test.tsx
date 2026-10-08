import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BillingWorkspace } from "@/components/billing-workspace";
import { DocumentsPanel } from "@/components/documents-panel";
import { NotificationCenter, notificationHref } from "@/components/notification-center";
import { decimalMinor, money, type AppNotification, type Invoice } from "@/types/operations";
const fixture = vi.hoisted(() => ({ api: vi.fn(), role: "patient" }));
vi.mock("@/api/client", () => ({ api: fixture.api }));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ profile: { id: "patient-one", role: fixture.role } }),
}));
vi.mock("@/providers/clinic-provider", () => ({
  useClinicContext: () => ({
    selected: "northstar",
    select: vi.fn(),
    clinics: [{ id: "northstar", name: "Clinic One" }],
  }),
}));
const invoice: Invoice = {
  id: "invoice-one",
  invoice_number: "QC-ONE",
  patient_id: "patient-one",
  patient_name: "Patient One",
  clinic_id: "northstar",
  clinic_name: "Clinic One",
  visit_id: null,
  status: "partially_paid",
  subtotal: 10250,
  discount: 50,
  total: 10200,
  amount_paid: 5000,
  balance: 5200,
  issued_at: "2026-10-08T09:00:00Z",
  due_at: null,
  created_at: "2026-10-08T09:00:00Z",
  items: [
    { description: "Consultation", quantity: 1, unit_price: 10000, total: 10000 },
    { description: "Service", quantity: 2, unit_price: 125, total: 250 },
  ],
  payments: [
    {
      id: "payment-one",
      amount: 5000,
      method: "cash",
      reference: "Receipt",
      paid_at: "2026-10-08T10:00:00Z",
    },
  ],
};
beforeEach(() => {
  fixture.role = "patient";
  fixture.api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("converts decimal currency to exact integer minor units", () => {
  expect(decimalMinor("0.29")).toBe(29);
  expect(decimalMinor("102.00")).toBe(10200);
  expect(decimalMinor("100")).toBe(10000);
  expect(money(29)).toContain("0.29");
});
it("rejects negative, sub-cent and oversized prices", () => {
  for (const value of ["-1", "1.001", "NaN", "1000001"])
    expect(() => decimalMinor(value)).toThrow();
});
it("patient billing renders own invoice and receipt with no payment or invoice editing controls", async () => {
  fixture.api.mockImplementation(async (path: string) =>
    path.includes("/invoices/invoice-one") ? invoice : [invoice],
  );
  render(<BillingWorkspace portal />);
  fireEvent.click(await screen.findByRole("button", { name: /QC-ONE/ }));
  expect(await screen.findByText("Payment history")).toBeInTheDocument();
  expect(screen.getByText("Consultation")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Print invoice / receipt" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Create invoice" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Void invoice" })).toBeNull();
});
it("patient documents request an authorized short-lived download and cannot upload or release", async () => {
  fixture.api.mockImplementation(async (path: string) =>
    path.endsWith("/download")
      ? { url: "https://private.test/document?expires=60" }
      : [
          {
            id: "document-one",
            patient_id: "patient-one",
            clinic_id: "northstar",
            visit_id: null,
            document_type: "lab_report",
            title: "Released report",
            description: "",
            original_filename: "report.pdf",
            mime_type: "application/pdf",
            file_size: 1024,
            patient_visible: 1,
            created_at: "2026-10-08T09:00:00Z",
            clinic_name: "Clinic One",
          },
        ],
  );
  const opened = vi.spyOn(window, "open").mockReturnValue(null);
  render(<DocumentsPanel portal />);
  fireEvent.click(await screen.findByRole("button", { name: "View / download" }));
  await waitFor(() =>
    expect(opened).toHaveBeenCalledWith(
      "https://private.test/document?expires=60",
      "_blank",
      "noopener,noreferrer",
    ),
  );
  expect(fixture.api).toHaveBeenCalledWith("/documents/document-one/download");
  expect(screen.queryByLabelText("Document file")).toBeNull();
  expect(screen.queryByRole("button", { name: "Release to patient" })).toBeNull();
});
it("notification bell shows unread count and supports marking all read", async () => {
  let unread = true;
  fixture.api.mockImplementation(async (path: string) => {
    if (path === "/notifications/read-all") {
      unread = false;
      return null;
    }
    return [
      {
        id: "notification-one",
        type: "invoice.issued",
        title: "Invoice available",
        message: "An invoice is available.",
        entity_type: "invoice",
        entity_id: "invoice-one",
        clinic_id: "northstar",
        read_at: unread ? null : "2026-10-08T11:00:00Z",
        created_at: "2026-10-08T09:00:00Z",
      },
    ];
  });
  render(<NotificationCenter />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Notifications" })).toHaveTextContent("1"),
  );
  const bell = screen.getByRole("button", { name: "Notifications" });
  fireEvent.keyDown(bell, { key: "Enter" });
  fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));
  await waitFor(() =>
    expect(fixture.api).toHaveBeenCalledWith("/notifications/read-all", {
      method: "POST",
      body: {},
    }),
  );
  await waitFor(() => expect(bell).not.toHaveTextContent("1"));
});
it("notification links resolve to relevant patient and staff pages", () => {
  const n = { entity_type: "invoice", entity_id: "invoice-one" } as AppNotification;
  expect(notificationHref(n, "patient")).toBe("/patient/billing?invoiceId=invoice-one");
  expect(notificationHref({ ...n, entity_type: "queue" }, "nurse")).toBe("/staff");
  expect(notificationHref({ ...n, entity_type: "document" }, "patient")).toBe("/patient/documents");
});
