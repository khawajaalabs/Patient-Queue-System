import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { useQueue, formatDate, type Entry } from "@/lib/queue-store";
import { PageHeader, StatusPill } from "@/components/qc";
import { PatientDrawer } from "@/components/patient-drawer";
export const Route = createFileRoute("/admin/patients")({
  head: () => ({ meta: [{ title: "Patients — QueueCare Admin" }] }),
  component: Patients,
});
function Patients() {
  const { patients: registered } = useQueue();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);
  const patients = registered.filter((e) =>
    `${e.name} ${e.phone} ${e.token}`.toLowerCase().includes(term.trim().toLowerCase()),
  );
  return (
    <>
      <PageHeader title="Patients" sub="Contact details and recent queue visits." />
      <label className="relative mb-6 block w-full max-w-sm">
        <span className="sr-only">Search patients</span>
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search name, phone or token"
          className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
        />
      </label>
      <div className="surface overflow-hidden">
        <div className="hidden grid-cols-[1.2fr_1.2fr_1fr_90px_110px] gap-4 border-b border-border px-6 py-3 text-xs text-muted-foreground xl:grid">
          {["Name", "Phone", "Last visit", "Last token", "Status"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {patients.map((entry) => (
          <button
            key={entry.patientId ?? entry.name}
            onClick={() => setSelected(entry)}
            className="grid w-full gap-3 border-b border-border px-5 py-5 text-left transition last:border-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_1fr_90px_110px] xl:items-center xl:px-6"
          >
            <span className="text-sm font-medium">{entry.name}</span>
            <span className="text-sm text-muted-foreground">{entry.phone || "—"}</span>
            <span className="text-sm text-muted-foreground">
              <span className="xl:hidden">Last visit · </span>
              {entry.date ? formatDate(entry.date) : "No visits yet"}
            </span>
            <span className="tabular text-sm font-medium">{entry.token}</span>
            <span>{entry.token === "—" ? "No token" : <StatusPill status={entry.status} />}</span>
          </button>
        ))}
        {!patients.length && (
          <p className="px-6 py-14 text-center text-sm text-muted-foreground">
            {term ? "No patients match your search." : "No patients have registered yet."}
          </p>
        )}
      </div>
      <PatientDrawer entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
