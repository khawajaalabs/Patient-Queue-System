import { useState, useEffect } from "react";
import { SearchableChoice } from "@/components/searchable-choice";
import { useClinicContext } from "@/providers/clinic-provider";
const legacy = "Location not yet specified";
export function ClinicLocationPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { clinics } = useClinicContext();
  const active = clinics.filter((c) => c.active !== false);
  const selected = active.find((c) => c.id === value);
  const [city, setCity] = useState(selected?.city || (selected ? legacy : "")),
    [area, setArea] = useState(selected?.area || (selected ? legacy : ""));
  useEffect(() => {
    const c = active.find((c) => c.id === value);
    if (c) {
      setCity(c.city || legacy);
      setArea(c.area || legacy);
    }
  }, [value, clinics]);
  const cities = [...new Set(active.map((c) => c.city || legacy))],
    areas = [
      ...new Set(active.filter((c) => (c.city || legacy) === city).map((c) => c.area || legacy)),
    ];
  const relevant = active.filter((c) => (c.city || legacy) === city && (c.area || legacy) === area);
  return (
    <div className="space-y-4">
      <SearchableChoice
        label="City"
        options={cities}
        value={city}
        onChange={(v) => {
          setCity(v);
          setArea("");
          onChange("");
        }}
      />
      <SearchableChoice
        label="Area"
        options={areas}
        value={area}
        disabled={!city}
        onChange={(v) => {
          setArea(v);
          const candidates = active.filter(
            (c) => (c.city || legacy) === city && (c.area || legacy) === v,
          );
          onChange(candidates.length === 1 ? candidates[0]!.id : "");
        }}
      />
      <SearchableChoice
        label="Clinic"
        options={relevant.map((c) => c.id)}
        labels={Object.fromEntries(relevant.map((c) => [c.id, c.name]))}
        value={value}
        disabled={!area}
        onChange={onChange}
      />
      {city === legacy && (
        <p className="text-xs text-muted-foreground">
          These existing clinics remain available while location details are updated.
        </p>
      )}
    </div>
  );
}
