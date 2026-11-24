/**
 * Web Audio API chime and Text-to-Speech (TTS) synthesizer for clinic queue calls.
 * Runs 100% client-side with no external audio assets or network requests.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Synthesizes a soothing, professional 2-tone hospital chime (C5 -> G5)
 */
export function playChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return resolve();

      const now = ctx.currentTime;
      // Tone 1: C5 (523.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.65);

      // Tone 2: G5 (783.99 Hz) starting after 250ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(783.99, now + 0.25);
      gain2.gain.setValueAtTime(0.001, now + 0.25);
      gain2.gain.exponentialRampToValueAtTime(0.3, now + 0.3);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.25);
      osc2.stop(now + 1.0);

      setTimeout(resolve, 900);
    } catch {
      resolve();
    }
  });
}

/**
 * Speaks the token call aloud using SpeechSynthesis
 */
export function speakAnnouncement(token: string, department?: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return resolve();
    }

    try {
      window.speechSynthesis.cancel(); // cancel any active speech

      // Space out letters and digits so "A-04" sounds like "Token A 4"
      const formattedToken = token.replace(/-/g, " ").replace(/([A-Za-z])(\d)/g, "$1 $2");

      const deptText = department?.trim()
        ? `Please proceed to ${department}.`
        : "Please proceed to the consultation room.";

      const text = `Attention please. Token ${formattedToken}. ${deptText}`;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.88; // calm, clear pace for public displays
      utterance.pitch = 1.05;
      utterance.volume = 1.0;

      // Prefer a natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            (v.name.includes("Natural") ||
              v.name.includes("Google") ||
              v.name.includes("Samantha")),
        ) || voices.find((v) => v.lang.startsWith("en"));

      if (preferred) {
        utterance.voice = preferred;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

/**
 * Combines the chime sound followed by the spoken voice announcement
 */
export async function announceTokenCall(token: string, department?: string): Promise<void> {
  await playChime();
  await speakAnnouncement(token, department);
}

const STORAGE_KEY = "queuecare_public_audio_enabled";

export function getAudioPreference(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setAudioPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  if (enabled) {
    getAudioContext();
  }
}
