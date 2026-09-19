import { Timer } from "lucide-react";

interface StatusRowProps {
  text: string;
  highlight: boolean;
  /** Seconds the current turn has lasted (null hides the stopwatch). */
  seconds: number | null;
  /** Requirement chip text (null hides it). */
  requirement: string | null;
  requirementActive: boolean;
}

/** "Your turn" pill + stopwatch, and the requirement chip. */
export function StatusRow({
  text,
  highlight,
  seconds,
  requirement,
  requirementActive,
}: StatusRowProps) {
  const time =
    seconds == null
      ? null
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex-shrink-0 flex flex-wrap justify-center items-center gap-2 px-3 py-1 compact:py-0.5 min-h-[34px]">
      <div
        data-testid="status-bar"
        className={`flex items-center gap-2 px-3.5 py-1 rounded-full text-sm compact:text-xs font-semibold whitespace-nowrap ${
          highlight
            ? "bg-gold/15 text-gold border border-gold/40"
            : "bg-slate-900/40 text-slate-200 border border-white/5"
        }`}
      >
        {text}
        {time && (
          <span className="flex items-center gap-1 text-xs font-normal opacity-70 tabular-nums">
            <Timer className="w-3 h-3" />
            {time}
          </span>
        )}
      </div>
      {requirement && (
        <div
          data-testid="requirement-chip"
          className={`px-3 py-1 rounded-full text-xs compact:text-[11px] font-medium whitespace-nowrap ${
            requirementActive
              ? "bg-white/10 text-white border border-white/15"
              : "bg-slate-900/30 text-slate-300/80 border border-white/5"
          }`}
        >
          {requirement}
        </div>
      )}
    </div>
  );
}
