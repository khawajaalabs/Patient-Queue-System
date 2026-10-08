import { useClinicContext } from "@/providers/clinic-provider";
import { useAuth } from "@/providers/auth-provider";
import { useClinicalData } from "@/components/clinical";
export function PatientPicker({
  value,
  onChange,
  name = "patientId",
  required = true,
}: {
  value?: string;
  onChange?: (id: string) => void;
  name?: string;
  required?: boolean;
}) {
  const { selected } = useClinicContext(),
    { profile } = useAuth();
  const remote = useClinicalData<
    { id: string; name: string }[] | { patients: { id: string; name: string }[] }
  >(
    profile?.role === "admin"
      ? "/admin/patient-options"
      : "/staff/state?clinicId=" + encodeURIComponent(selected),
  );
  const options = Array.isArray(remote.data) ? remote.data : (remote.data?.patients ?? []);
  return (
    <label className="block text-sm font-medium">
      Patient
      <select
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-2 block w-full rounded-lg border border-input bg-card p-3 text-sm"
      >
        <option value="">Choose a patient</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {remote.error && (
        <span role="alert" className="mt-1 text-xs text-destructive">
          {remote.error}
        </span>
      )}
    </label>
  );
}
