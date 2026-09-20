interface TableAreaProps {
  stockCount: number;
  pileCount: number;
  burnedCount: number;
  /** Tapping the pile plays the current selection. */
  canTapPile: boolean;
  onTapPile: () => void;
}

/**
 * Centre of the table: the stock zone and the pile zone with their
 * captions. The cards themselves are drawn by the card layer.
 */
export function TableArea({ stockCount, pileCount, burnedCount, canTapPile, onTapPile }: TableAreaProps) {
  const zoneStyle = { width: "min(19cqw,110px)", height: "min(26.5cqw,153px)" } as const;
  const caption = "text-muted font-extrabold";
  const captionSize = { fontSize: "clamp(11px,3cqw,14px)" } as const;
  return (
    <div className="flex items-center justify-center" style={{ gap: "clamp(28px,9cqw,70px)" }} data-testid="table-area">
      {/* Stock */}
      <div className="flex flex-col items-center gap-1.5">
        <div
          data-zone="stock"
          data-testid="stock"
          data-count={stockCount}
          className="rounded-lg border-2 border-dashed border-cream/16 flex items-center justify-center text-cream/40 font-extrabold text-xs"
          style={zoneStyle}
        >
          Stock
        </div>
        <div className={caption} style={captionSize} data-testid="stock-count" data-count={stockCount}>
          {stockCount ? `${stockCount} left` : "Stock's gone"}
        </div>
      </div>

      {/* Pile */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative">
          <div
            data-zone="pile"
            data-testid="pile"
            data-count={pileCount}
            onClick={() => canTapPile && onTapPile()}
            className={`rounded-lg border-2 border-dashed border-cream/16 flex items-center justify-center text-cream/40 font-extrabold text-xs ${
              canTapPile ? "pulse-lime cursor-pointer" : ""
            }`}
            style={{
              ...zoneStyle,
              boxShadow: canTapPile ? "0 0 0 3px rgba(212,255,79,.8)" : "none",
              transition: "box-shadow .3s",
            }}
          >
            Pile
          </div>
          {pileCount > 0 && (
            <div
              data-testid="pile-count"
              className="absolute -top-2.5 -right-3 min-w-6 h-6 px-[7px] rounded-full bg-cream text-ink font-black text-xs flex items-center justify-center tabular-nums"
              style={{ zIndex: 8, boxShadow: "0 3px 8px rgba(0,0,0,.3)" }}
            >
              {pileCount}
            </div>
          )}
        </div>
        <div className={`${caption} flex gap-2 whitespace-nowrap`} style={captionSize}>
          <span>{pileCount ? `${pileCount} on the pile` : "Empty pile"}</span>
          {burnedCount > 0 && (
            <span className="text-tangerine" data-testid="burned-count" data-count={burnedCount}>
              🔥 {burnedCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
