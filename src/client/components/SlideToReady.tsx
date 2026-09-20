import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

interface SlideToReadyProps {
  onCommit: () => void;
  disabled?: boolean;
}

const PAD = 4;
/** How far along the track (0–1) the knob must be released to count. */
const COMMIT_AT = 0.85;

/**
 * "Slide to ready": drag the lime knob to the far end of the track to
 * commit. A tap does nothing, so nobody readies up by accident while
 * they're still shuffling their table. Enter/Space on the focused knob
 * commits too (keyboard users shouldn't have to drag).
 */
export function SlideToReady({ onCommit, disabled = false }: SlideToReadyProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const startRef = useRef({ px: 0, x: 0 });
  const maxRef = useRef(1);
  const xRef = useRef(0);
  const [x, setXState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [committed, setCommitted] = useState(false);

  const setX = (v: number) => {
    xRef.current = v;
    setXState(v);
  };

  const measure = () => {
    const track = trackRef.current;
    const knob = knobRef.current;
    if (!track || !knob) return 1;
    return Math.max(1, track.clientWidth - knob.offsetWidth - PAD * 2);
  };

  const commit = () => {
    if (committed || disabled) return;
    setX(measure());
    setCommitted(true);
    onCommit();
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || committed) return;
    maxRef.current = measure();
    startRef.current = { px: e.clientX, x: xRef.current };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const next = Math.min(maxRef.current, Math.max(0, startRef.current.x + e.clientX - startRef.current.px));
    setX(next);
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (xRef.current >= maxRef.current * COMMIT_AT) commit();
    else setX(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit();
    }
  }

  const progress = committed ? 1 : Math.min(1, x / Math.max(1, maxRef.current));

  return (
    <div
      ref={trackRef}
      data-testid="ready-track"
      data-committed={committed ? "true" : undefined}
      className="relative flex-1 h-full rounded-[18px] overflow-hidden select-none"
      style={{
        background: "rgba(255,247,232,.1)",
        border: "2px solid rgba(255,247,232,.18)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Lime fill trails the knob */}
      <div
        className="absolute inset-y-0 left-0 bg-lime"
        style={{
          width: `calc(${x}px + ${PAD}px + (100% - ${PAD * 2}px) * 0 + var(--knob, 0px))`,
          opacity: 0.25 + progress * 0.75,
          transition: dragging ? "none" : "width .25s cubic-bezier(.2,1.4,.4,1), opacity .25s",
        }}
      />
      {/* Label */}
      <div
        className="absolute inset-0 flex items-center justify-center gap-2 font-display font-extrabold text-cream pointer-events-none whitespace-nowrap"
        style={{
          fontSize: "clamp(15px,4.2cqw,20px)",
          letterSpacing: "-.01em",
          opacity: committed ? 0 : 1 - progress * 1.4,
          paddingLeft: "clamp(40px,11cqw,56px)",
          transition: dragging ? "none" : "opacity .2s",
        }}
      >
        Slide to ready
        <span className="text-lime" aria-hidden>
          ›››
        </span>
      </div>
      {committed && (
        <div
          className="absolute inset-0 flex items-center justify-center font-display font-extrabold text-ink pointer-events-none"
          style={{ fontSize: "clamp(15px,4.2cqw,20px)", paddingRight: "clamp(40px,11cqw,56px)" }}
        >
          Ready!
        </div>
      )}
      {/* Knob */}
      <div
        ref={knobRef}
        data-testid="ready-btn"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Slide to ready"
        aria-disabled={disabled || committed}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="absolute rounded-[14px] bg-lime text-ink flex items-center justify-center font-black outline-none focus-visible:ring-4 focus-visible:ring-cream/40"
        style={{
          top: PAD,
          bottom: PAD,
          left: PAD + x,
          aspectRatio: "1 / 1",
          fontSize: "clamp(20px,5.5cqw,26px)",
          boxShadow: "0 3px 0 #7FA61F, 0 8px 16px rgba(0,0,0,.3)",
          cursor: disabled || committed ? "default" : dragging ? "grabbing" : "grab",
          touchAction: "none",
          transition: dragging ? "none" : "left .25s cubic-bezier(.2,1.4,.4,1)",
        }}
      >
        {committed ? "✓" : "→"}
      </div>
    </div>
  );
}
