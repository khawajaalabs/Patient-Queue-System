import { useClinicContext } from "@/providers/clinic-provider";
import { PrintBranding } from "@/components/final-operations";
import { QueueSkeleton, QueueError } from "@/components/queue-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueue } from "@/lib/queue-store";
import { LiveDot } from "@/components/qc";

export const Route = createFileRoute("/public-display")({
  head: () => ({
    meta: [
      { title: "Now serving — QueueCare" },
      { name: "description", content: "Live token display for the clinic reception screen." },
      { property: "og:title", content: "Now serving — QueueCare" },
      {
        property: "og:description",
        content: "Live token display for the clinic reception screen.",
      },
    ],
  }),
  component: Display,
});

function Display() {
  const { selected } = useClinicContext();
  const { serving, waiting, clinic, open, loadState } = useQueue();
  const [time, setTime] = useState("");
  useEffect(() => {
    const t = () =>
      setTime(
        new Date().toLocaleTimeString("en-US", {
          timeZone: "Asia/Karachi",
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    t();
    const i = setInterval(t, 10000);
    return () => clearInterval(i);
  }, []);
  if (loadState !== "ready")
    return (
      <div className="min-h-screen bg-display p-8 text-display-foreground">
        {loadState === "error" ? <QueueError /> : <QueueSkeleton />}
      </div>
    );
  return (
    <div className="flex min-h-screen flex-col bg-display px-8 py-8 text-display-foreground md:px-16 md:py-12">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="text-2xl font-semibold tracking-tight md:text-3xl">
            {clinic.publicName}
          </div>
          <div className="mt-1 text-lg text-display-muted">{clinic.department}</div>
          <PrintBranding clinicId={selected} />
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-2 text-sm font-semibold tracking-[0.2em] text-display-accent">
            {open ? (
              <>
                <LiveDot /> LIVE
              </>
            ) : (
              "QUEUE CLOSED"
            )}
          </div>
          <div className="tabular mt-2 text-2xl text-display-muted">{time}</div>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="text-lg font-semibold tracking-[0.3em] text-display-accent md:text-2xl">
          NOW SERVING
        </div>
        <div
          key={serving?.token}
          className="token-in tabular mt-4 text-[28vw] font-bold leading-none tracking-[-0.05em] md:text-[18vw]"
        >
          {serving?.token ?? "—"}
        </div>
        {!serving && (
          <div className="mt-4 text-xl text-display-muted md:text-3xl">
            No token is currently being served.
          </div>
        )}
        {clinic.showNext && waiting.length > 0 && (
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-12">
            <span className="text-lg text-display-muted md:text-2xl">UP NEXT</span>
            {waiting.slice(0, 3).map((e) => (
              <span
                key={e.token}
                className="tabular text-3xl font-semibold tracking-tight md:text-6xl"
              >
                {e.token}
              </span>
            ))}
          </div>
        )}
      </main>
      <footer className="border-t border-display-muted/20 pt-6 text-center text-lg text-display-muted md:text-xl">
        Please proceed to the consultation area when your token is called.
      </footer>
    </div>
  );
}
