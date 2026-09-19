import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { Card as CardType, Rank } from "../../shared/types.ts";
import { TABLE_SIZE, cardKey } from "../../shared/types.ts";
import { Card, CardGhost } from "./Card.tsx";
import { CARD_DIMS, type Layout } from "../lib/layout.ts";

export type MyTableMode = "swap" | "faceUp" | "blind" | "idle";

interface MyTableProps {
  faceUp: CardType[];
  faceDownSlots: boolean[];
  layout: Layout;
  mode: MyTableMode;
  selectedKeys: ReadonlySet<string>;
  selectedSlot: number | null;
  playableRanks: ReadonlySet<Rank> | null;
  wildRanks: ReadonlySet<Rank>;
  onTapFaceUp: (card: CardType) => void;
  onTapBlind: (slot: number) => void;
  you: { Icon: LucideIcon; colorClass: string; handCount: number; isOut: boolean };
}

/** The back peeks out below the face-up card by this much. */
const PEEK = 10;

/**
 * Your three table slots: a face-down card in each stable slot (until
 * flipped) with your face-up cards laid over them left to right.
 *
 * - swap:   face-up cards are swap targets
 * - faceUp: face-up cards are the play source (same-rank multi-select)
 * - blind:  remaining backs pulse and can be selected for a flip
 */
export function MyTable({
  faceUp,
  faceDownSlots,
  layout,
  mode,
  selectedKeys,
  selectedSlot,
  playableRanks,
  wildRanks,
  onTapFaceUp,
  onTapBlind,
  you,
}: MyTableProps) {
  const size = layout.myTableCard;
  const d = CARD_DIMS[size];
  const slotGap = layout.tier === "compact" ? 8 : 12;

  return (
    <div
      data-testid="my-table"
      className="flex-shrink-0 flex items-center justify-center gap-4 tablet:gap-6 px-3"
      style={{ minHeight: d.h + PEEK + 8 }}
    >
      {/* You */}
      <div className="flex flex-col items-center gap-1 w-14 flex-shrink-0">
        <div
          className={`rounded-full flex items-center justify-center ${you.colorClass}`}
          style={{ width: layout.avatar, height: layout.avatar }}
        >
          <you.Icon className="text-white" style={{ width: layout.avatar * 0.5, height: layout.avatar * 0.5 }} />
        </div>
        <div className="text-[11px] font-semibold text-white leading-tight">You</div>
        <div className="text-[10px] text-slate-300/80 leading-tight" data-testid="my-hand-count">
          {you.isOut ? "out" : `${you.handCount} in hand`}
        </div>
      </div>

      {/* Slots */}
      <div className="flex items-end" style={{ gap: slotGap }}>
        {Array.from({ length: TABLE_SIZE }).map((_, i) => {
          const hasBack = faceDownSlots[i] ?? false;
          const card = faceUp[i];
          const blindSelectable = mode === "blind" && hasBack;
          const blindSelected = mode === "blind" && selectedSlot === i;
          return (
            <div
              key={i}
              data-testid={`table-slot-${i}`}
              className="relative"
              style={{ width: d.w, height: d.h + PEEK }}
            >
              {/* Face-down card (or ghost) at the bottom of the slot */}
              <div className="absolute left-0" style={{ top: PEEK }}>
                {hasBack ? (
                  <div className={blindSelectable ? "pulse-gold rounded-[inherit]" : ""} style={{ borderRadius: d.r }}>
                    <Card
                      faceDown
                      size={size}
                      interactive={blindSelectable}
                      selected={blindSelected}
                      onClick={() => onTapBlind(i)}
                      testId={`blind-slot-${i}`}
                    />
                  </div>
                ) : (
                  <CardGhost size={size} testId={`empty-slot-${i}`} />
                )}
              </div>

              {/* Face-up card on top */}
              {card && (
                <motion.div
                  className="absolute left-0 top-0"
                  animate={{ y: selectedKeys.has(cardKey(card)) ? -8 : 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 38 }}
                  style={{ zIndex: 2 }}
                >
                  <Card
                    card={card}
                    size={size}
                    interactive={mode === "swap" || mode === "faceUp"}
                    selected={selectedKeys.has(cardKey(card))}
                    dimmed={
                      mode === "faceUp" &&
                      playableRanks !== null &&
                      !playableRanks.has(card.rank)
                    }
                    wild={wildRanks.has(card.rank)}
                    onClick={() => onTapFaceUp(card)}
                    testId={`faceup-card-${cardKey(card)}`}
                  />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
