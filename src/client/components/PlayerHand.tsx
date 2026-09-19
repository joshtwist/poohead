import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import type { Card as CardType, Rank } from "../../shared/types.ts";
import { cardKey, cardsEqual } from "../../shared/types.ts";
import { Card } from "./Card.tsx";
import { CARD_DIMS, stepFor, type Layout } from "../lib/layout.ts";

interface PlayerHandProps {
  /** Already sorted; cards awaiting server confirmation already removed. */
  cards: CardType[];
  layout: Layout;
  selectedKeys: ReadonlySet<string>;
  /** Ranks that may be played right now; null = don't dim anything. */
  playableRanks: ReadonlySet<Rank> | null;
  wildRanks: ReadonlySet<Rank>;
  interactive: boolean;
  onTap: (card: CardType) => void;
  /** Cards that just arrived (draws, pick-ups) get a gold pulse. */
  newKeys: ReadonlySet<string>;
  /** Cards rendered invisibly while a flight animation stands in for them. */
  hiddenKeys?: ReadonlySet<string>;
  /** Swap phase: a face-up card is selected, so every hand card is a target. */
  targetAll?: boolean;
  /** Shown when the hand is empty (e.g. "Playing from your table cards"). */
  emptyText?: string;
}

const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const;
/** Room around the fan so selection rings and shadows aren't clipped. */
const EDGE = 8;
const NONE_SET: ReadonlySet<string> = new Set();

/* ── HandCard: one card in the fan ──────────────────────────────────── */

interface HandCardProps {
  card: CardType;
  idx: number;
  step: number;
  lift: number;
  size: Layout["handCard"];
  selected: boolean;
  dimmed: boolean;
  wild: boolean;
  isNew: boolean;
  hidden: boolean;
  target: boolean;
  interactive: boolean;
  onTap: (card: CardType) => void;
}

/**
 * Each card owns its own motion values. The parent decides WHICH slot the
 * card is in via `idx`; this component springs x to `idx * step`, and y
 * to -lift when selected. All positioning is transform-based so DOM order
 * never matters (see PlayerHand).
 */
function HandCard({
  card,
  idx,
  step,
  lift,
  size,
  selected,
  dimmed,
  wild,
  isNew,
  hidden,
  target,
  interactive,
  onTap,
}: HandCardProps) {
  const x = useMotionValue(idx * step);
  const y = useMotionValue(0);
  const d = CARD_DIMS[size];

  useEffect(() => {
    const controls = animate(x, idx * step, SPRING);
    return () => controls.stop();
  }, [idx, step, x]);

  useEffect(() => {
    const controls = animate(y, selected ? -lift : 0, SPRING);
    return () => controls.stop();
  }, [selected, lift, y]);

  return (
    <motion.div
      data-testid={`hand-card-${cardKey(card)}`}
      data-selected={selected ? "true" : undefined}
      data-target={target ? "true" : undefined}
      // Opacity is owned by Framer's initial/animate/exit system so React
      // Strict Mode's double effects can't leave a card stuck mid-fade.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.18 } }}
      transition={{ opacity: { duration: 0.18 } }}
      style={{
        x,
        y,
        position: "absolute",
        top: 0,
        left: 0,
        width: d.w,
        height: d.h,
        zIndex: idx,
      }}
      className={interactive ? "cursor-pointer" : ""}
      onClick={() => interactive && onTap(card)}
    >
      {/* Hide instantly (a flying copy takes over), fade back in when it lands. */}
      <div style={{ opacity: hidden ? 0 : 1, transition: hidden ? "none" : "opacity 150ms ease-out" }}>
        <Card card={card} size={size} selected={selected} dimmed={dimmed} wild={wild} />
      </div>
      {isNew && !selected && !hidden && (
        <motion.div
          className="absolute inset-0 ring-2 ring-gold pointer-events-none"
          style={{ borderRadius: d.r }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      )}
      {target && !selected && !hidden && (
        <div className="absolute inset-0 pointer-events-none pulse-gold" style={{ borderRadius: d.r }} />
      )}
    </motion.div>
  );
}

/* ── Component ──────────────────────────────────────────────────────── */

/**
 * The player's hand: a horizontal fan of tap-to-select cards.
 *
 * - Every card is ABSOLUTELY positioned; its slot is `idx * step`.
 * - Cards render in STABLE DOM ORDER (insertion order), not visual order,
 *   so React never moves DOM nodes when the hand re-sorts — all motion is
 *   transform-based.
 * - The fan compresses down to `layout.minStep`, then the row scrolls
 *   horizontally (hands can hold 20+ cards after a pick-up). The scroller
 *   reserves room above for lifted cards and around the fan for rings.
 */
export function PlayerHand({
  cards,
  layout,
  selectedKeys,
  playableRanks,
  wildRanks,
  interactive,
  onTap,
  newKeys,
  hiddenKeys = NONE_SET,
  targetAll = false,
  emptyText,
}: PlayerHandProps) {
  const d = CARD_DIMS[layout.handCard];
  const domOrderRef = useRef<CardType[]>([]);

  // Keep previous DOM entries that are still present; append new cards.
  {
    const prev = domOrderRef.current;
    const kept = prev.filter((c) => cards.some((v) => cardsEqual(v, c)));
    const seen = new Set(kept.map(cardKey));
    const additions = cards.filter((c) => !seen.has(cardKey(c)));
    domOrderRef.current = [...kept, ...additions];
  }
  const domOrder = domOrderRef.current;

  // The fan fills the row exactly, so leave room for the edge padding.
  const step = stepFor(cards.length, d.w, layout.rowWidth - EDGE * 2, layout.minStep);
  const containerWidth = cards.length === 0 ? d.w : d.w + (cards.length - 1) * step;
  const top = layout.lift + 6;
  const bottom = 10;
  const rowHeight = d.h + top + bottom;

  return (
    <div className="w-full flex-shrink-0" data-testid="player-hand" data-count={cards.length}>
      <div
        className="no-scrollbar overflow-x-auto overflow-y-hidden w-full"
        style={{
          height: rowHeight,
          paddingTop: top,
          paddingBottom: bottom,
          touchAction: "pan-x",
          overscrollBehaviorX: "contain",
        }}
      >
        {cards.length === 0 ? (
          <div
            className="mx-auto flex items-center justify-center text-slate-300/60 text-sm italic px-4 text-center"
            style={{ height: d.h, maxWidth: layout.rowWidth }}
          >
            {emptyText ?? ""}
          </div>
        ) : (
          <div
            className="mx-auto"
            style={{
              width: containerWidth + EDGE * 2,
              paddingLeft: EDGE,
              paddingRight: EDGE,
              height: d.h,
            }}
          >
            <div className="relative" style={{ width: containerWidth, height: d.h }}>
              <AnimatePresence>
                {domOrder.map((card) => {
                  const idx = cards.findIndex((c) => cardsEqual(c, card));
                  if (idx === -1) return null;
                  const key = cardKey(card);
                  return (
                    <HandCard
                      key={key}
                      card={card}
                      idx={idx}
                      step={step}
                      lift={layout.lift}
                      size={layout.handCard}
                      selected={selectedKeys.has(key)}
                      dimmed={playableRanks !== null && !playableRanks.has(card.rank)}
                      wild={wildRanks.has(card.rank)}
                      isNew={newKeys.has(key)}
                      hidden={hiddenKeys.has(key)}
                      target={targetAll}
                      interactive={interactive}
                      onTap={onTap}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
