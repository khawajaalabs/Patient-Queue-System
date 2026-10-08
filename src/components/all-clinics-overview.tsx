import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { useClinicContext } from "@/providers/clinic-provider";
import { PageHeader } from "@/components/qc";
import { friendlyError } from "@/services/errors";
import type { AllClinicsState } from "@/types/local";
export function AllClinicsOverview() {
  const { select } = useClinicContext();
  const [data, setData] = useState<AllClinicsState | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      try {
        const result = await api<AllClinicsState>("/admin/clinics/summary");
        if (active && request === sequence) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (active && request === sequence) setError(friendlyError(e));
      }
    };
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener("queuecare:refresh", onRefresh);
    window.addEventListener("queuecare:updated", onRefresh);
    const timer = setInterval(onRefresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("queuecare:refresh", onRefresh);
      window.removeEventListener("queuecare:updated", onRefresh);
    };
  }, []);
  return (
    <>
      <PageHeader title="All clinics" sub="Today's patient flow across your clinics." />
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {data ? (
        <>
          <dl className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
            {[
              ["Total clinics", data.totals.clinics],
              ["Today's patients", data.totals.patients],
              ["Currently waiting", data.totals.waiting],
              ["Appointments today", data.totals.appointments],
              ["Completed today", data.totals.completed],
            ].map(([label, value]) => (
              <div key={label} className="surface p-5">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="tabular mt-2 text-3xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-4 md:grid-cols-2">
            {data.clinics.map((c) => (
              <button
                key={c.clinic.id}
                onClick={() => select(c.clinic.id)}
                className="surface p-6 text-left transition hover:border-primary"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-semibold">{c.clinic.name}</h2>
                  <span className="text-xs text-muted-foreground">
                    {c.clinic.active
                      ? c.status === "unavailable"
                        ? "Not opened"
                        : c.status === "open"
                          ? "Queue open"
                          : "Queue closed"
                      : "Inactive"}
                  </span>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  {[
                    ["Waiting", c.waiting],
                    ["Now serving", c.currentToken ?? "—"],
                    ["Appointments today", c.appointments],
                    ["Completed today", c.completed],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="tabular mt-1 font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </button>
            ))}
          </div>
        </>
      ) : (
        !error && <p className="text-sm text-muted-foreground">Loading clinic overview…</p>
      )}
    </>
  );
}
