interface PlayerHandProps {
  count: number;
  /** Shown when the hand is empty ("Playing from your table"). */
  emptyText: string;
  /** Shorter track on short, wide screens. */
  compact: boolean;
}

/**
 * The hand track: a zone the card layer fans your cards into, plus a
 * sizer that tells it how wide one hand card should be. Big hands
 * compress by overlapping more; nothing scrolls.
 */
export function PlayerHand({ count, emptyText, compact }: PlayerHandProps) {
  return (
    <div
      data-zone="hand"
      data-testid="player-hand"
      data-count={count}
      className="relative flex-shrink-0 flex items-end justify-center"
      style={{
        height: compact ? "min(30cqw,200px)" : "min(40cqw,240px)",
        marginTop: "clamp(6px,1.5cqw,12px)",
      }}
    >
      <div data-zone="handcard" style={{ width: "min(23cqw,132px)", height: "min(32cqw,184px)" }} />
      {count === 0 && emptyText && (
        <div
          className="absolute left-0 right-0 text-center font-extrabold italic text-muted"
          style={{ bottom: "min(10cqw,60px)", fontSize: "clamp(13px,3.4cqw,16px)" }}
        >
          {emptyText}
        </div>
      )}
    </div>
  );
}
