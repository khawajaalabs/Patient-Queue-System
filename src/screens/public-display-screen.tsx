import { useClinicContext } from "@/providers/clinic-provider";
import { PrintBranding } from "@/components/final-operations";
import { QueueSkeleton, QueueError } from "@/components/queue-feedback";
import { useEffect, useRef, useState } from "react";
import { useQueue } from "@/lib/queue-store";
import { LiveDot } from "@/components/qc";
import {
  announceTokenCall,
  getAudioPreference,
  setAudioPreference,
  playChime,
} from "@/lib/queue-audio";

export function Display() {
  const { selected } = useClinicContext();
  const { serving, waiting, clinic, open, loadState } = useQueue();
  const [time, setTime] = useState("");
  const [audioEnabled, setAudioState] = useState(false);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const lastAnnouncedTokenRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);

  // Load saved audio preference on mount
  useEffect(() => {
    setAudioState(getAudioPreference());
  }, []);

  // Update clock
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

  // Trigger announcement whenever serving token changes
  useEffect(() => {
    const currentToken = serving?.token;
    if (!currentToken) {
      lastAnnouncedTokenRef.current = null;
      return;
    }

    // Skip playing on initial page load so user isn't startled
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastAnnouncedTokenRef.current = currentToken;
      return;
    }

    if (currentToken !== lastAnnouncedTokenRef.current) {
      lastAnnouncedTokenRef.current = currentToken;
      if (audioEnabled) {
        setIsAnnouncing(true);
        void announceTokenCall(currentToken, clinic?.department).finally(() => {
          setIsAnnouncing(false);
        });
      }
    }
  }, [serving?.token, audioEnabled, clinic?.department]);

  const toggleAudio = () => {
    const next = !audioEnabled;
    setAudioState(next);
    setAudioPreference(next);
    if (next) {
      // Play instant confirmation chime to unlock AudioContext in browser
      void playChime();
    }
  };

  const handleTestAudio = () => {
    setIsAnnouncing(true);
    void announceTokenCall(serving?.token ?? "A-01", clinic?.department).finally(() => {
      setIsAnnouncing(false);
    });
  };

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

        <div className="flex flex-col items-end gap-3 text-right">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAudio}
              type="button"
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                audioEnabled
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30"
                  : "bg-display-muted/20 text-display-muted ring-1 ring-display-muted/30 hover:bg-display-muted/30"
              }`}
              title="Toggle voice announcements for called tokens"
            >
              <span>{audioEnabled ? "🔊 Sound: ON" : "🔇 Sound: OFF"}</span>
            </button>

            {audioEnabled && (
              <button
                onClick={handleTestAudio}
                type="button"
                className="rounded-full bg-display-muted/10 px-2.5 py-1 text-xs text-display-muted ring-1 ring-display-muted/20 hover:bg-display-muted/20"
              >
                Test Voice
              </button>
            )}

            <div className="inline-flex items-center gap-2 text-sm font-semibold tracking-[0.2em] text-display-accent">
              {open ? (
                <>
                  <LiveDot /> LIVE
                </>
              ) : (
                "QUEUE CLOSED"
              )}
            </div>
          </div>

          <div className="tabular text-2xl text-display-muted">{time}</div>
        </div>
      </header>

      {/* Floating Announcement Pulse Banner */}
      {isAnnouncing && (
        <div className="animate-pulse mx-auto my-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-6 py-2 text-base font-semibold text-emerald-300 ring-1 ring-emerald-400/50">
          <span className="inline-block h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400" />
          <span>Announcing Token {serving?.token ?? "Calling"}...</span>
        </div>
      )}

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

      <footer className="flex flex-col items-center justify-between gap-3 border-t border-display-muted/20 pt-6 text-center text-display-muted sm:flex-row md:text-lg">
        <div>Please proceed to the consultation area when your token is called.</div>
        {!audioEnabled && (
          <div className="text-xs text-display-muted/80">
            Tip: Click <strong>"Sound: OFF"</strong> above to enable audio chimes & voice
            announcements.
          </div>
        )}
      </footer>
    </div>
  );
}
