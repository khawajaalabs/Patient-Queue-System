import { useState, useRef, useEffect, useCallback } from "react";
import { Btn } from "@/components/qc";

export interface ScanDocument {
  id: string;
  title: string;
  url: string;
  filename: string;
  mimeType: string;
  documentType?: string;
  clinicName?: string;
  size?: number;
}

export function MedicalScanViewer({
  scan,
  onClose,
}: {
  scan: ScanDocument | null;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [filterMode, setFilterMode] = useState<"normal" | "invert" | "contrast" | "bone">("normal");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset transforms whenever a new scan is opened
  useEffect(() => {
    if (scan) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setFilterMode("normal");
    }
  }, [scan]);

  // Keyboard controls: ESC to close, + / - to zoom, R to rotate, 0 to reset
  useEffect(() => {
    if (!scan) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s + 0.25, 5));
      else if (e.key === "-" || e.key === "_") setScale((s) => Math.max(s - 0.25, 0.4));
      else if (e.key.toLowerCase() === "r") setRotation((r) => (r + 90) % 360);
      else if (e.key === "0") {
        setScale(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scan, onClose]);

  // Mouse drag handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = () => setIsDragging(false);

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setScale((s) => Math.min(Math.max(s + delta, 0.4), 5));
  };

  if (!scan) return null;

  const isPdf = scan.mimeType.includes("pdf") || scan.filename.toLowerCase().endsWith(".pdf");

  // Radiological filter styles
  const filterStyles: Record<string, string> = {
    normal: "none",
    invert: "invert(100%)",
    contrast: "contrast(180%) brightness(110%)",
    bone: "invert(100%) contrast(200%) grayscale(100%)",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Medical Imaging Viewer: ${scan.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md text-slate-100"
    >
      {/* Top Header Bar */}
      <header className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40">
            🩻
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-white">{scan.title}</h2>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs font-medium text-cyan-300 ring-1 ring-cyan-500/30 uppercase">
                {scan.documentType?.replace("_", " ") || "Diagnostic Scan"}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {scan.filename} {scan.size ? `· ${(scan.size / 1024).toFixed(0)} KB` : ""}{" "}
              {scan.clinicName ? `· ${scan.clinicName}` : ""}
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!isPdf && (
            <>
              {/* Zoom Controls */}
              <div className="flex items-center rounded-lg bg-slate-800 p-1 ring-1 ring-slate-700">
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.max(s - 0.25, 0.4))}
                  className="rounded px-2.5 py-1 text-xs font-semibold hover:bg-slate-700 active:scale-95"
                  title="Zoom Out (-)"
                >
                  −
                </button>
                <span className="w-12 text-center text-xs font-mono tabular-nums text-slate-300">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.min(s + 0.25, 5))}
                  className="rounded px-2.5 py-1 text-xs font-semibold hover:bg-slate-700 active:scale-95"
                  title="Zoom In (+)"
                >
                  +
                </button>
              </div>

              {/* Rotate */}
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700 ring-1 ring-slate-700 active:scale-95"
                title="Rotate 90° Clockwise (R)"
              >
                🔄 Rotate ({rotation}°)
              </button>

              {/* Radiology Filter Selector */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1 ring-1 ring-slate-700 text-xs">
                {(["normal", "contrast", "invert", "bone"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode)}
                    className={`rounded px-2 py-1 capitalize transition-all ${
                      filterMode === mode
                        ? "bg-cyan-500 font-semibold text-slate-950 shadow"
                        : "text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {mode === "bone" ? "Bone (X-Ray)" : mode}
                  </button>
                ))}
              </div>

              {/* Reset view */}
              <button
                type="button"
                onClick={() => {
                  setScale(1);
                  setRotation(0);
                  setPosition({ x: 0, y: 0 });
                  setFilterMode("normal");
                }}
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-white ring-1 ring-slate-700"
                title="Reset View (0)"
              >
                Reset
              </button>
            </>
          )}

          {/* Download Original */}
          <a
            href={scan.url}
            target="_blank"
            rel="noopener noreferrer"
            download={scan.filename}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white ring-1 ring-slate-700"
          >
            Download File ⤓
          </a>

          {/* Close */}
          <Btn
            variant="ghost"
            onClick={onClose}
            className="text-slate-300 hover:bg-rose-500/20 hover:text-rose-400"
            title="Close Viewer (Esc)"
          >
            ✕ Close
          </Btn>
        </div>
      </header>

      {/* Main View Area */}
      <main
        ref={containerRef}
        onWheel={!isPdf ? handleWheel : undefined}
        onMouseDown={!isPdf ? handleMouseDown : undefined}
        onMouseMove={!isPdf ? handleMouseMove : undefined}
        onMouseUp={!isPdf ? handleMouseUp : undefined}
        className={`relative flex flex-1 items-center justify-center overflow-hidden select-none ${
          !isPdf ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
      >
        {isPdf ? (
          <iframe
            src={scan.url}
            title={scan.title}
            className="h-full w-full border-none bg-slate-900"
          />
        ) : (
          <div
            style={{
              transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale})`,
              transition: isDragging ? "none" : "transform 0.15s ease-out",
            }}
            className="flex items-center justify-center will-change-transform"
          >
            <img
              src={scan.url}
              alt={scan.title}
              draggable={false}
              style={{
                filter: filterStyles[filterMode],
                maxHeight: "82vh",
                maxWidth: "88vw",
              }}
              className="rounded-md object-contain shadow-2xl transition-all select-none pointer-events-none"
            />
          </div>
        )}

        {/* Helpful Tip in Bottom Left */}
        {!isPdf && (
          <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-400 backdrop-blur ring-1 ring-slate-800">
            Drag to pan · Scroll wheel to zoom · Press <strong>R</strong> to rotate ·{" "}
            <strong>ESC</strong> to close
          </div>
        )}
      </main>
    </div>
  );
}
