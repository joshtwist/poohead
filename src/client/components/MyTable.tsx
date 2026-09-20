import { TABLE_SIZE } from "../../shared/types.ts";

interface MyTableProps {
  emoji: string;
  color: string;
  /** Lime ring while it's your turn. */
  active: boolean;
  handCount: number;
  isOut: boolean;
  /** Which face-down slots still hold a card (for the empty-slot markers). */
  faceDownSlots: boolean[];
}

/**
 * Your avatar plus three slot zones. Face-down cards sit in the slots with
 * face-up cards over them; both are drawn by the card layer.
 */
export function MyTable({ emoji, color, active, handCount, isOut, faceDownSlots }: MyTableProps) {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{ gap: "clamp(12px,4cqw,28px)" }}
      data-testid="my-table"
    >
      <div className="flex flex-col items-center gap-[3px]" style={{ width: "clamp(52px,13cqw,72px)" }}>
        <div
          className={`rounded-full flex items-center justify-center ${active ? "pulse-lime" : ""}`}
          style={{
            width: "clamp(34px,8.5cqw,46px)",
            height: "clamp(34px,8.5cqw,46px)",
            background: color,
            fontSize: "clamp(17px,4.2cqw,24px)",
            boxShadow: `inset 0 -3px 0 rgba(0,0,0,.18)${active ? ", 0 0 0 3px #2B1743, 0 0 0 6px #D4FF4F" : ""}`,
            transition: "box-shadow .3s",
          }}
        >
          {emoji}
        </div>
        <div className="font-display font-extrabold" style={{ fontSize: "clamp(12px,3.2cqw,15px)" }}>
          You
        </div>
        <div
          className="text-muted font-extrabold text-center"
          style={{ fontSize: "clamp(10px,2.7cqw,13px)" }}
          data-testid="my-hand-count"
        >
          {isOut ? "out 🎉" : `${handCount} in hand`}
        </div>
      </div>
      <div className="flex pt-2" style={{ gap: "clamp(8px,2.4cqw,14px)" }}>
        {Array.from({ length: TABLE_SIZE }).map((_, i) => (
          <div
            key={i}
            data-zone={`mslot-${i}`}
            data-testid={`table-slot-${i}`}
            className="relative rounded-lg border-2 border-dashed border-cream/16"
            style={{ width: "min(16cqw,93px)", height: "min(22.3cqw,130px)" }}
          >
            {!faceDownSlots[i] && <div data-testid={`empty-slot-${i}`} className="absolute inset-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
