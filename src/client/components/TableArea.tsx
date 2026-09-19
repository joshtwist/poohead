import { motion, AnimatePresence } from "framer-motion";
import type { Card as CardType, Rank } from "../../shared/types.ts";
import { cardKey } from "../../shared/types.ts";
import { Card, CardGhost } from "./Card.tsx";
import { CARD_DIMS, type Layout } from "../lib/layout.ts";

export interface TableFlash {
  seq: number;
  kind: "burn" | "pickup" | "flip_fail";
}

interface TableAreaProps {
  stockCount: number;
  /** Bottom → top. */
  pile: CardType[];
  lastPlayCount: number;
  burnedCount: number;
  layout: Layout;
  wildRanks: ReadonlySet<Rank>;
  /** Tapping the pile plays the current selection. */
  canTapPile: boolean;
  onTapPile: () => void;
  /** Momentary effect over the pile (burn / pick-up). */
  flash: TableFlash | null;
}

/**
 * Centre of the table: the face-down stock on the left, the pile on the
 * right. The top play is fanned so several-of-a-kind reads at a glance;
 * a few earlier cards peek out beneath for depth. A burned count sits by
 * the pile.
 */
export function TableArea({
  stockCount,
  pile,
  lastPlayCount,
  burnedCount,
  layout,
  wildRanks,
  canTapPile,
  onTapPile,
  flash,
}: TableAreaProps) {
  const size = layout.tableCard;
  const d = CARD_DIMS[size];
  const topCount = Math.min(lastPlayCount, pile.length);
  const top = pile.slice(pile.length - topCount);
  const under = pile.slice(0, pile.length - topCount).slice(-4);
  const fanStep = Math.round(d.w * 0.16);
  const fanWidth = d.w + (Math.max(top.length, 1) - 1) * fanStep;

  return (
    <div
      className="flex items-center justify-center gap-8 compact:gap-6 tablet:gap-12 w-full"
      data-testid="table-area"
    >
      {/* Stock */}
      <div className="flex flex-col items-center gap-1.5">
        <StockStack count={stockCount} size={size} />
        <div className="text-[11px] tablet:text-xs text-slate-300/80" data-testid="stock-count" data-count={stockCount}>
          {stockCount === 0 ? "Stock empty" : `${stockCount} left`}
        </div>
      </div>

      {/* Pile */}
      <div className="flex flex-col items-center gap-1.5">
        <motion.div
          data-testid="pile"
          data-count={pile.length}
          onClick={() => canTapPile && onTapPile()}
          whileTap={canTapPile ? { scale: 0.97 } : undefined}
          className={`relative ${canTapPile ? "cursor-pointer" : ""}`}
          style={{ width: fanWidth, height: d.h }}
        >
          {canTapPile && (
            <motion.div
              className="absolute -inset-1.5 ring-2 ring-gold pointer-events-none"
              style={{ borderRadius: d.r + 4 }}
              animate={{ opacity: [0.35, 0.9, 0.35] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}

          {pile.length === 0 && (
            <CardGhost size={size} className="absolute left-0 top-0 text-slate-300/50 text-[11px]">
              Pile
            </CardGhost>
          )}

          {/* Earlier cards peeking out beneath the top play */}
          {under.map((card, i) => {
            const depth = under.length - i; // 1 = just under the top
            const rot = ((i * 37) % 13) - 6;
            return (
              <div
                key={`under-${cardKey(card)}`}
                className="absolute left-0 top-0"
                style={{
                  transform: `translate(${(fanWidth - d.w) / 2 + (rot / 2)}px, ${-depth * 1.5}px) rotate(${rot}deg)`,
                  opacity: 0.75,
                  zIndex: i,
                }}
              >
                <Card card={card} size={size} />
              </div>
            );
          })}

          {/* Top play, fanned */}
          <AnimatePresence initial={false}>
            {top.map((card, i) => (
              <motion.div
                key={cardKey(card)}
                className="absolute top-0"
                style={{ left: i * fanStep, zIndex: 10 + i }}
                initial={{ opacity: 0, scale: 1.25, y: -40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.6, y: -30, transition: { duration: 0.25 } }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
              >
                <Card
                  card={card}
                  size={size}
                  wild={wildRanks.has(card.rank)}
                  testId={`pile-top-${cardKey(card)}`}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Count badge */}
          {pile.length > 0 && (
            <div
              className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-slate-900/85 border border-white/10 text-[11px] font-bold text-white flex items-center justify-center tabular-nums"
              style={{ zIndex: 30 }}
              data-testid="pile-count"
            >
              {pile.length}
            </div>
          )}

          {/* Burn / pick-up flash */}
          <AnimatePresence>
            {flash && (
              <motion.div
                key={flash.seq}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ zIndex: 40 }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.4, 1.6, 1.8], y: [0, -10, -30, -60] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, times: [0, 0.2, 0.6, 1] }}
              >
                <span className="text-5xl drop-shadow-lg">
                  {flash.kind === "burn" ? "🔥" : "💩"}
                </span>
              </motion.div>
            )}
            {flash?.kind === "burn" &&
              Array.from({ length: 7 }).map((_, i) => (
                <motion.span
                  key={`${flash.seq}-flame-${i}`}
                  className="absolute bottom-0 pointer-events-none"
                  style={{ left: `${6 + i * 14}%`, zIndex: 39, fontSize: 18 + ((i * 7) % 12) }}
                  initial={{ opacity: 0, y: 8, scale: 0.5 }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    y: [8, -30 - (i % 3) * 18, -70 - (i % 2) * 20, -120],
                    x: [0, (i % 2 ? 1 : -1) * 6, (i % 2 ? -1 : 1) * 8, 0],
                    scale: [0.5, 1.2, 1, 0.7],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, delay: i * 0.06, times: [0, 0.25, 0.7, 1] }}
                >
                  🔥
                </motion.span>
              ))}
          </AnimatePresence>
        </motion.div>

        <div className="text-[11px] tablet:text-xs text-slate-300/80 flex items-center gap-2">
          <span>{pile.length === 0 ? "Empty pile" : `${pile.length} on the pile`}</span>
          {burnedCount > 0 && (
            <span className="text-orange-300/90" data-testid="burned-count" data-count={burnedCount}>
              🔥 {burnedCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Stock: 3D-stacked card backs ───────────────────────────────────── */

function StockStack({ count, size }: { count: number; size: Layout["tableCard"] }) {
  const d = CARD_DIMS[size];
  if (count === 0) {
    return (
      <CardGhost size={size} testId="stock" className="text-slate-300/40 text-[11px]">
        Stock
      </CardGhost>
    );
  }
  const layers = Math.min(count, 3);
  return (
    <div data-testid="stock" data-count={count} className="relative" style={{ width: d.w, height: d.h }}>
      {Array.from({ length: layers }).map((_, i) => {
        const offset = (layers - i - 1) * 2.5;
        const isTop = i === layers - 1;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: offset,
              top: offset,
              zIndex: i,
              filter: isTop ? "none" : `brightness(${0.9 - (layers - i - 1) * 0.05})`,
            }}
          >
            <Card faceDown size={size} />
          </div>
        );
      })}
    </div>
  );
}
