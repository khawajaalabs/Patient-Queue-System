import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { appointmentTimeLabel } from "@/lib/appointment-time";
import { Btn, Field, PageHeader } from "@/components/qc";
import { SelectField } from "@/components/form-controls";
import { ClinicalLoading, useClinicalData } from "@/components/clinical";
import { useClinicContext } from "@/providers/clinic-provider";
import { friendlyError } from "@/services/errors";
export const Route = createFileRoute("/admin/doctor-schedule")({ component: DoctorSchedule });
type Window = { weekday: number; startTime: string; endTime: string };
type Schedule = {
  windows: Window[];
  slotMinutes: number;
  openingTime: string;
  closingTime: string;
};
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function DoctorSchedule() {
  const { selected, clinics } = useClinicContext();
  const remote = useClinicalData<Schedule>(
    selected === "all"
      ? null
      : "/admin/doctor-availability?clinicId=" + encodeURIComponent(selected),
  );
  const [windows, setWindows] = useState<Window[]>([]),
    [duration, setDuration] = useState(15),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    if (remote.data) {
      setWindows(remote.data.windows);
      setDuration(remote.data.slotMinutes);
    }
    setSaved(false);
    setError("");
  }, [remote.data, selected]);
  const update = (index: number, field: "startTime" | "endTime", value: string) => {
    setWindows((all) => all.map((w, i) => (i === index ? { ...w, [field]: value } : w)));
    setSaved(false);
  };
  return (
    <>
      <PageHeader
        title="Doctor Schedule"
        sub="Weekly availability and appointment duration for each clinic."
      />
      {selected === "all" ? (
        <div className="surface p-6 text-sm text-muted-foreground">
          Select a clinic to configure doctor hours.
        </div>
      ) : !remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <form
          className="surface p-5 sm:p-6 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setSaved(false);
            void api("/admin/doctor-availability?clinicId=" + encodeURIComponent(selected), {
              method: "PUT",
              body: { windows, slotMinutes: duration },
            })
              .then(() => {
                setSaved(true);
                window.dispatchEvent(new Event("queuecare:refresh"));
              })
              .catch((e) => setError(friendlyError(e)))
              .finally(() => setBusy(false));
          }}
        >
          <div>
            <h2 className="font-semibold">{clinics.find((c) => c.id === selected)?.name}</h2>
            <p className="text-sm text-muted-foreground">
              Doctor hours must fit within clinic opening hours. Schedules across clinics cannot
              overlap.
            </p>
          </div>
          <label className="block max-w-xs space-y-1.5 text-sm font-medium">
            Appointment duration
            <SelectField
              className="w-full"
              aria-label="Appointment duration"
              value={String(duration)}
              onChange={(e) => {
                setDuration(Number(e.target.value));
                setSaved(false);
              }}
            >
              {[...new Set([5, 10, 15, 20, 30, 45, 60, 90, 120, duration])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
            </SelectField>
          </label>
          <fieldset disabled={busy} className="divide-y divide-border">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <div key={day} className="py-4 first:pt-0 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="w-28 font-medium">{days[day]}</h3>
                  {!windows.some((w) => w.weekday === day) && (
                    <span className="text-sm text-muted-foreground">Not working</span>
                  )}
                  <Btn
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setWindows((all) => [
                        ...all,
                        {
                          weekday: day,
                          startTime: remote.data!.openingTime,
                          endTime: remote.data!.closingTime,
                        },
                      ]);
                      setSaved(false);
                    }}
                  >
                    {windows.some((w) => w.weekday === day) ? "+ Add another time" : "+ Add hours"}
                  </Btn>
                  {windows.some((w) => w.weekday === day) && (
                    <Btn
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setWindows((all) => all.filter((w) => w.weekday !== day));
                        setSaved(false);
                      }}
                    >
                      Mark day off
                    </Btn>
                  )}
                </div>
                {windows.map(
                  (w, i) =>
                    w.weekday === day && (
                      <div
                        key={i}
                        className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end max-w-xl"
                      >
                        <p className="col-span-2 sm:col-span-3 text-xs text-muted-foreground">
                          {appointmentTimeLabel(w.startTime)} to {appointmentTimeLabel(w.endTime)}
                        </p>
                        <Field
                          required
                          label={`${days[day]} start ${i + 1}`}
                          type="time"
                          value={w.startTime}
                          onChange={(e) => update(i, "startTime", e.target.value)}
                        />
                        <Field
                          required
                          label={`${days[day]} end ${i + 1}`}
                          type="time"
                          value={w.endTime}
                          onChange={(e) => update(i, "endTime", e.target.value)}
                        />
                        <Btn
                          type="button"
                          variant="secondary"
                          aria-label={`Remove ${days[day]} period ${i + 1}`}
                          onClick={() => {
                            setWindows((all) => all.filter((_, j) => j !== i));
                            setSaved(false);
                          }}
                        >
                          Remove
                        </Btn>
                      </div>
                    ),
                )}
              </div>
            ))}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm text-primary">
              Patients can now book available appointment times.
            </p>
          )}
          {saved && (
            <div className="flex flex-wrap gap-4 text-sm text-primary">
              <a href={"/admin/appointments?clinicId=" + selected}>View appointments</a>
              <a href="/admin">Back to dashboard</a>
            </div>
          )}
          <Btn disabled={busy}>{busy ? "Saving…" : "Save schedule"}</Btn>
        </form>
      )}
    </>
  );
}
