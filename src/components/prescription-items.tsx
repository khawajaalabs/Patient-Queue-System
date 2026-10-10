import { useState } from "react";
import { Btn, Field } from "@/components/qc";
import { useClinicalData } from "@/components/clinical";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { SelectField } from "@/components/form-controls";
import type { Medicine, ClinicalVisit } from "@/types/clinical";
import type { CatalogMedicine } from "@/types/clinical-workflow";
export function PrescriptionItems({
  clinicId,
  items,
  onChange,
  previous = [],
}: {
  clinicId: string;
  items: Medicine[];
  onChange: (items: Medicine[]) => void;
  previous?: ClinicalVisit[];
}) {
  const [libraryOpen, setLibraryOpen] = useState<number | null>(null);
  const catalog = useClinicalData<CatalogMedicine[]>(
      `/admin/medicine-library?clinicId=${encodeURIComponent(clinicId)}`,
    ),
    [copied, setCopied] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  const update = (index: number, next: Partial<Medicine>) =>
    onChange(items.map((m, i) => (i === index ? { ...m, ...next } : m)));
  return (
    <div className="space-y-5">
      <section className="rounded-lg border p-4 space-y-3">
        <h3>Previous prescriptions</h3>
        <p className="text-sm text-muted-foreground">
          Copy only into this unsaved draft, then review and edit. Historical prescriptions stay
          unchanged.
        </p>
        {previous
          .filter((v) => v.status === "completed" && v.prescription.items.length)
          .slice(0, 8)
          .map((v) => (
            <div key={v.id} className="border-b pb-3">
              <p className="text-sm">
                {v.clinicName} · {v.visitAt.slice(0, 10)}
              </p>
              <p className="text-sm text-muted-foreground break-words">
                {v.prescription.items.map((m) => m.medicine).join(", ")}
              </p>
              <Btn
                type="button"
                variant="ghost"
                disabled={copied.includes(v.id) || items.length + v.prescription.items.length > 20}
                onClick={() => {
                  onChange([
                    ...items,
                    ...v.prescription.items.map((m) => ({
                      ...m,
                      catalogId: v.clinicId === clinicId ? (m.catalogId ?? null) : null,
                    })),
                  ]);
                  setCopied((c) => [...c, v.id]);
                  setNotice("Copied into the draft. Review every medicine before saving.");
                }}
              >
                {copied.includes(v.id) ? "Copied to draft" : "Copy to draft"}
              </Btn>
              <a className="ml-3 text-sm underline" href={`/admin/visits/${v.id}`}>
                View prescription
              </a>
            </div>
          ))}
        {!previous.some((v) => v.status === "completed" && v.prescription.items.length) && (
          <p className="text-sm text-muted-foreground">No previous prescriptions.</p>
        )}
        <p role="status" className="text-sm">
          {notice}
        </p>
      </section>
      {catalog.error && (
        <p role="alert" className="text-sm">
          Library unavailable. You can still enter custom medicines.
        </p>
      )}
      {items.map((m, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3>Medicine {i + 1}</h3>
            <Popover
              open={libraryOpen === i}
              onOpenChange={(open) => setLibraryOpen(open ? i : null)}
            >
              <PopoverTrigger asChild>
                <Btn type="button" variant="secondary">
                  Find library medicine {i + 1}
                </Btn>
              </PopoverTrigger>
              <PopoverContent className="w-[min(360px,calc(100vw-32px))] p-0">
                <Command>
                  <CommandInput placeholder="Search clinic library" />
                  <CommandList>
                    <CommandEmpty>No match. Enter a custom medicine below.</CommandEmpty>
                    {catalog.data
                      ?.filter((x) => x.active)
                      .map((x) => (
                        <CommandItem
                          key={x.id}
                          value={`${x.name} ${x.strength} ${x.dosageForm}`}
                          onSelect={() => {
                            update(i, {
                              medicine: x.name,
                              strength: x.strength,
                              dosageForm: x.dosageForm,
                              dose: x.defaultDose,
                              frequency: x.defaultFrequency,
                              duration: x.defaultDuration,
                              instructions: x.defaultInstructions,
                              catalogId: x.id,
                            });
                            setLibraryOpen(null);
                          }}
                        >
                          {x.name} {x.strength} {x.dosageForm}
                        </CommandItem>
                      ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["medicine", "Medicine name", 160],
                ["strength", "Strength", 120],
                ["dosageForm", "Dosage form", 120],
                ["dose", "Dose", 120],
                ["frequency", "Frequency", 120],
                ["duration", "Duration", 120],
                ["instructions", "Instructions", 300],
              ] as const
            ).map(([key, label, max]) => (
              <div key={key}>
                <Field
                  label={`${label} ${i + 1}`}
                  required={key === "medicine"}
                  maxLength={max}
                  value={m[key] ?? ""}
                  onChange={(e) =>
                    update(i, {
                      [key]: e.target.value,
                      ...(key === "medicine" ? { catalogId: null } : {}),
                    })
                  }
                />
                {["frequency", "duration", "instructions"].includes(key) && (
                  <SelectField
                    className="mt-2"
                    aria-label={`${label} helper ${i + 1}`}
                    value=""
                    onChange={(e) => update(i, { [key]: e.target.value })}
                  >
                    <option value="">Choose shortcut (optional)</option>
                    {(key === "frequency"
                      ? [
                          "Once daily",
                          "Twice daily",
                          "Three times daily",
                          "Every 8 hours",
                          "At night",
                        ]
                      : key === "duration"
                        ? ["3 days", "5 days", "7 days", "14 days"]
                        : ["After meal", "Before meal", "With food", "At night", "As directed"]
                    ).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </SelectField>
                )}
              </div>
            ))}
          </div>
          <Btn
            type="button"
            variant="ghost"
            onClick={() => onChange(items.filter((_, index) => index !== i))}
          >
            Remove medicine {i + 1}
          </Btn>
        </div>
      ))}
    </div>
  );
}
