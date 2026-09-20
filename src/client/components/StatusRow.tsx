interface StatusRowProps {
  text: string;
  /** Lime "Your turn" treatment. */
  highlight: boolean;
  /** Seconds the current turn has lasted (null hides the clock). */
  seconds: number | null;
  /** Requirement pill text (null hides it). */
  requirement: string | null;
  /** Changes whenever the turn changes so the pill pops again. */
  popKey: string;
}

/** "Your turn" pill with a tabular clock, and the requirement pill. */
export function StatusRow({ text, highlight, seconds, requirement, popKey }: StatusRowProps) {
  const clock =
    seconds == null ? null : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const pillH = "clamp(32px,8cqw,42px)";
  return (
    <div
      className="flex-shrink-0 flex justify-center items-center gap-2 flex-wrap"
      style={{ marginTop: "clamp(10px,2.6cqw,18px)", minHeight: 36 }}
    >
      <div
        key={popKey}
        data-testid="status-bar"
        className={`anim-turn-pop flex items-center gap-2 rounded-full font-display font-extrabold whitespace-nowrap ${
          highlight ? "bg-lime text-ink" : "glass text-cream"
        }`}
        style={{
          height: pillH,
          padding: "0 clamp(12px,3.4cqw,18px)",
          fontSize: "clamp(14px,3.7cqw,19px)",
          letterSpacing: "-.01em",
          boxShadow: highlight ? "0 6px 20px rgba(212,255,79,.35)" : "none",
          transition: "background .3s, color .3s",
        }}
      >
        {text}
        {clock && (
          <span className="font-body font-extrabold tabular-nums" style={{ fontSize: ".78em", opacity: 0.7 }}>
            {clock}
          </span>
        )}
      </div>
      {requirement && (
        <div
          data-testid="requirement-chip"
          className="glass flex items-center rounded-full text-cream font-extrabold whitespace-nowrap"
          style={{ height: pillH, padding: "0 clamp(12px,3.4cqw,16px)", fontSize: "clamp(12px,3.2cqw,15px)" }}
        >
          {requirement}
        </div>
      )}
    </div>
  );
}
