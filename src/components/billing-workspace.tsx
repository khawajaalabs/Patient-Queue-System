import { SelectField } from "@/components/form-controls";
import { PrintBranding } from "@/components/final-operations";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { Btn, Field } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { PatientPicker } from "@/components/patient-picker";
import { useClinicContext } from "@/providers/clinic-provider";
import type { ClinicConfig } from "@/types/local";
import { friendlyError } from "@/services/errors";
import { decimalMinor, money, type Invoice } from "@/types/operations";
export function BillingWorkspace({ portal = false }: { portal?: boolean }) {
  const { selected, select } = useClinicContext();
  const params =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const remote = useClinicalData<Invoice[]>(
    "/billing/invoices?clinicId=" + encodeURIComponent(portal ? "all" : selected),
  );
  const clinic = useClinicalData<ClinicConfig>(
    !portal && selected !== "all" ? "/clinic?clinicId=" + encodeURIComponent(selected) : null,
  );
  const [active, setActive] = useState<string | null>(params.get("invoiceId")),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(!!params.get("patientId")),
    [editing, setEditing] = useState<Invoice | null>(null),
    [rows, setRows] = useState([{ description: "Consultation", quantity: "1", price: "" }]),
    [patient, setPatient] = useState(params.get("patientId") ?? "");
  const detail = useClinicalData<Invoice>(
      active ? "/billing/invoices/" + encodeURIComponent(active) : null,
    ),
    paymentId = useRef(crypto.randomUUID());
  useEffect(() => {
    const requested = params.get("clinicId");
    if (requested) select(requested);
  }, []);
  useEffect(() => {
    if (!editing && clinic.data?.consultationFee != null)
      setRows([
        { description: "Consultation", quantity: "1", price: String(clinic.data.consultationFee) },
      ]);
  }, [clinic.data?.consultationFee, editing]);
  useEffect(() => {
    paymentId.current = crypto.randomUUID();
  }, [active]);
  function refresh() {
    remote.reload();
    detail.reload();
    window.dispatchEvent(new Event("queuecare:refresh"));
  }
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const saved = await api<Invoice>("/billing/invoices" + (editing ? "/" + editing.id : ""), {
        method: editing ? "PUT" : "POST",
        body: {
          patientId: patient,
          clinicId: selected,
          visitId: editing ? editing.visit_id : params.get("visitId"),
          appointmentId: editing ? (editing.appointment_id ?? null) : params.get("appointmentId"),
          discount: decimalMinor(String(f.get("discount") || "0")),
          dueAt: String(f.get("dueAt") || "") || null,
          draft: f.get("draft") === "on",
          items: rows.map((r) => ({
            description: r.description,
            quantity: Number(r.quantity),
            unitPrice: decimalMinor(r.price),
          })),
        },
      });
      setActive(saved.id);
      setCreating(false);
      setEditing(null);
      refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/billing/invoices/" + active + "/payments", {
        method: "POST",
        body: {
          amount: decimalMinor(String(f.get("amount"))),
          method: String(f.get("method")),
          reference: String(f.get("reference")),
          paidAt: new Date().toISOString(),
          requestId: paymentId.current,
        },
      });
      paymentId.current = crypto.randomUUID();
      refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function voidInvoice() {
    setBusy(true);
    setError("");
    try {
      await api("/billing/invoices/" + active + "/void", { method: "POST", body: {} });
      refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const invoices = (remote.data ?? []).filter(
      (i) =>
        (status === "all" || i.status === status) &&
        `${i.invoice_number} ${i.patient_name}`.toLowerCase().includes(search.toLowerCase()),
    ),
    i = detail.data;
  return (
    <div className="space-y-6">
      <div className="print:hidden flex flex-wrap gap-3">
        <Field
          label="Search invoices or patient"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="text-sm font-medium">
          Status
          <SelectField
            className="mt-2 block rounded-lg border bg-card p-3"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["all", "draft", "unpaid", "partially_paid", "paid", "void"]
              .filter((s) => !portal || s !== "draft")
              .map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
          </SelectField>
        </label>
        {!portal && (
          <Btn
            className="self-end"
            disabled={selected === "all"}
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
          >
            Create invoice
          </Btn>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {creating && !portal && selected !== "all" && (
        <form onSubmit={(e) => void create(e)} className="surface space-y-5 p-6 print:hidden">
          <h2 className="text-lg font-semibold">{editing ? "Edit draft" : "New invoice"}</h2>
          <PatientPicker value={patient} onChange={setPatient} />
          <p className="text-xs text-muted-foreground">
            Prices in PKR. Consultation fee can be edited.
          </p>
          {rows.map((r, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[2fr_1fr_1fr_auto]"
            >
              <Field
                label={"Description " + (index + 1)}
                required
                maxLength={200}
                value={r.description}
                onChange={(e) =>
                  setRows((old) =>
                    old.map((x, n) => (n === index ? { ...x, description: e.target.value } : x)),
                  )
                }
              />
              <Field
                label={"Quantity " + (index + 1)}
                type="number"
                min="1"
                max="1000"
                step="1"
                required
                value={r.quantity}
                onChange={(e) =>
                  setRows((old) =>
                    old.map((x, n) => (n === index ? { ...x, quantity: e.target.value } : x)),
                  )
                }
              />
              <Field
                label={"Unit price " + (index + 1)}
                type="number"
                min="0"
                step="0.01"
                required
                value={r.price}
                onChange={(e) =>
                  setRows((old) =>
                    old.map((x, n) => (n === index ? { ...x, price: e.target.value } : x)),
                  )
                }
              />
              <Btn
                type="button"
                variant="ghost"
                disabled={rows.length === 1}
                onClick={() => setRows((old) => old.filter((_, n) => n !== index))}
              >
                Remove item {index + 1}
              </Btn>
            </div>
          ))}
          <Btn
            type="button"
            variant="secondary"
            disabled={rows.length >= 30}
            onClick={() =>
              setRows((old) => [...old, { description: "", quantity: "1", price: "" }])
            }
          >
            Add item
          </Btn>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Discount (PKR)"
              type="number"
              min="0"
              step="0.01"
              name="discount"
              defaultValue={editing ? editing.discount / 100 : 0}
            />
            <Field label="Due date" type="date" name="dueAt" defaultValue={editing?.due_at ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="draft" defaultChecked={!!editing} />
            Save as draft
          </label>
          <div className="flex gap-3">
            <Btn disabled={busy}>{busy ? "Saving…" : "Save invoice"}</Btn>
            <Btn variant="ghost" type="button" onClick={() => setCreating(false)}>
              Cancel
            </Btn>
          </div>
        </form>
      )}
      {!remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <div className="surface divide-y divide-border print:hidden">
          {invoices.map((invoice) => (
            <button
              key={invoice.id}
              onClick={() => {
                setActive(invoice.id);
                setError("");
              }}
              className="flex w-full flex-wrap justify-between gap-3 p-5 text-left hover:bg-muted/40"
            >
              <div>
                <p className="font-medium">
                  {invoice.invoice_number} · {invoice.patient_name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {invoice.clinic_name} · {invoice.status.replaceAll("_", " ")}
                </p>
              </div>
              <div className="text-right text-sm">
                <p>{money(invoice.total)}</p>
                <p className="mt-1 text-muted-foreground">Balance {money(invoice.balance)}</p>
              </div>
            </button>
          ))}
          {!invoices.length && (
            <p className="p-6 text-sm text-muted-foreground">No invoices match this view.</p>
          )}
        </div>
      )}
      {active && !i && <ClinicalLoading error={detail.error} retry={detail.reload} />}{" "}
      {i && (
        <>
          <section className="prescription-sheet surface p-6 md:p-9">
            <PrintBranding clinicId={i.clinic_id} />
            <div className="flex flex-wrap justify-between gap-4 border-b border-border pb-5">
              <div>
                <h2 className="text-xl font-semibold">{i.clinic_name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {i.clinic_address} · {i.clinic_phone}
                </p>
              </div>
              <div>
                <p className="font-semibold">Invoice {i.invoice_number}</p>
                <p className="text-sm">
                  {i.status.replaceAll("_", " ")} ·{" "}
                  {new Date(i.issued_at ?? i.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <p className="my-5 text-sm">
              Patient: <strong>{i.patient_name}</strong>
              {i.due_at && <> · Due {i.due_at}</>}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead>
                  <tr>
                    {["Description", "Quantity", "Unit price", "Total"].map((h) => (
                      <th key={h} className="border-b py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {i.items?.map((r, index) => (
                    <tr key={index}>
                      {[r.description, r.quantity, money(r.unit_price), money(r.total)].map(
                        (v, n) => (
                          <td key={n} className="border-b py-3">
                            {v}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto mt-6 max-w-xs space-y-2 text-sm">
              {[
                ["Subtotal", i.subtotal],
                ["Discount", i.discount],
                ["Total", i.total],
                ["Paid", i.amount_paid],
                ["Balance", i.balance],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-6">
                  <dt>{label}</dt>
                  <dd className="font-medium">{money(Number(value))}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-6 font-semibold">Payment history</h3>
            {i.payments?.map((p) => (
              <p key={p.id} className="mt-2 text-sm">
                {new Date(p.paid_at).toLocaleString()} · {p.method.replaceAll("_", " ")} ·{" "}
                {money(p.amount)} {p.reference && "· " + p.reference}
              </p>
            ))}
            {!i.payments?.length && (
              <p className="mt-2 text-sm text-muted-foreground">No payments recorded.</p>
            )}
          </section>
          <div className="flex flex-wrap gap-3 print:hidden">
            <Btn variant="secondary" onClick={() => window.print()}>
              Print invoice / receipt
            </Btn>
            {!portal && i.status === "draft" && i.clinic_id === selected && (
              <Btn
                onClick={() => {
                  setEditing(i);
                  setPatient(i.patient_id);
                  setRows(
                    i.items?.map((r) => ({
                      description: r.description,
                      quantity: String(r.quantity),
                      price: String(r.unit_price / 100),
                    })) ?? [],
                  );
                  setCreating(true);
                }}
              >
                Edit / issue draft
              </Btn>
            )}
            {!portal && i.amount_paid === 0 && i.status !== "void" && (
              <Btn variant="ghost" disabled={busy} onClick={() => void voidInvoice()}>
                Void invoice
              </Btn>
            )}
          </div>
          {!portal && ["unpaid", "partially_paid"].includes(i.status) && (
            <form
              key={i.id + ":" + i.amount_paid}
              onSubmit={(e) => void pay(e)}
              className="surface grid gap-4 p-6 print:hidden sm:grid-cols-2"
            >
              <h3 className="font-semibold sm:col-span-2">Record payment</h3>
              <Field
                label="Amount (PKR)"
                name="amount"
                type="number"
                min="0.01"
                max={i.balance / 100}
                step="0.01"
                required
              />
              <label className="text-sm font-medium">
                Method
                <SelectField name="method" className="mt-2 block w-full rounded-lg border bg-card p-3">
                  {["cash", "card", "bank_transfer", "other"].map((m) => (
                    <option key={m} value={m}>
                      {m.replaceAll("_", " ")}
                    </option>
                  ))}
                </SelectField>
              </label>
              <Field label="Reference / note" name="reference" maxLength={300} />
              <Btn disabled={busy} className="self-end">
                {busy ? "Recording…" : "Record payment"}
              </Btn>
            </form>
          )}
        </>
      )}
    </div>
  );
}
