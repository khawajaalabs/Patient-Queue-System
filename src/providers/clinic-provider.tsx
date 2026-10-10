import { SelectField } from "@/components/form-controls";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/api/client";
import { useAuth } from "./auth-provider";
import type { ManagedClinic } from "@/types/local";
export type ClinicOption = Pick<ManagedClinic, "id" | "name" | "city" | "area"> & {
  active?: boolean;
};
let commandClinic = "northstar";
export function currentCommandClinic() {
  return commandClinic;
}
type ContextValue = {
  selected: string;
  clinics: ClinicOption[];
  select: (id: string) => void;
  error: string;
};
const Context = createContext<ContextValue>({
  selected: "northstar",
  clinics: [],
  select: () => {},
  error: "",
});
export const useClinicContext = () => useContext(Context);
export function ClinicProvider({
  children,
  publicOnly = false,
}: {
  children: ReactNode;
  publicOnly?: boolean;
}) {
  const { profile, loading } = useAuth();
  const key = `queuecare:clinic:${profile?.id ?? "guest"}`;
  const [selected, setSelected] = useState("northstar");
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (loading && !publicOnly) return;
    let active = true;
    const readSaved = () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const urlClinic = new URLSearchParams(window.location.search).get("clinicId");
    const saved = urlClinic ?? (publicOnly ? "northstar" : (readSaved() ?? "northstar"));
    setSelected(saved);
    commandClinic = saved;
    const refresh = async () => {
      try {
        const list = await api<ClinicOption[]>(
          !publicOnly && profile?.role === "admin"
            ? "/admin/clinics"
            : !publicOnly && (profile?.role === "nurse" || profile?.role === "receptionist")
              ? "/staff/clinics"
              : "/clinics",
        );
        if (!active) return;
        setClinics(list);
        setError("");
        setSelected((previous) => {
          // A display URL is explicit: invalid IDs must show an error, never another clinic's tokens.
          if (publicOnly) return previous;
          const next =
            (previous === "all" && profile?.role === "admin") || list.some((c) => c.id === previous)
              ? previous
              : (list[0]?.id ?? "northstar");
          commandClinic = next;
          return next;
        });
      } catch {
        if (active) setError("Unable to load clinics. Please refresh to try again.");
      }
    };
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener("queuecare:refresh", onRefresh);
    return () => {
      active = false;
      window.removeEventListener("queuecare:refresh", onRefresh);
    };
  }, [key, profile?.role, loading, publicOnly]);
  const select = (id: string) => {
    if (!(id === "all" && profile?.role === "admin") && !clinics.some((c) => c.id === id)) return;
    setSelected(id);
    commandClinic = id;
    try {
      localStorage.setItem(key, id);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  };
  return (
    <Context.Provider value={{ selected, clinics, select, error }}>{children}</Context.Provider>
  );
}
export function ClinicSwitcher({ all = false }: { all?: boolean }) {
  const c = useClinicContext();
  return (
    <label className="block min-w-0 text-xs text-muted-foreground">
      <span className="sr-only">Current clinic</span>
      <SelectField
        aria-label="Current clinic"
        className="max-w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary"
        value={c.selected}
        onChange={(e) => c.select(e.target.value)}
      >
        {all && <option value="all">All Clinics</option>}
        {!c.clinics.length && <option value="northstar">Loading clinics…</option>}
        {c.clinics.map((clinic) => (
          <option key={clinic.id} value={clinic.id}>
            {clinic.name}
            {clinic.active === false ? " (inactive)" : ""}
          </option>
        ))}
      </SelectField>
      {c.error && (
        <span role="alert" className="mt-1 block text-destructive">
          {c.error}
        </span>
      )}
    </label>
  );
}
