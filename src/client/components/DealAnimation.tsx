import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { StateMessage } from "../../shared/protocol.ts";
import { TABLE_SIZE } from "../../shared/types.ts";
import { Card } from "./Card.tsx";
import { ICON_MAP, ICON_COLORS } from "../lib/icons.ts";
import { useLayoutTier } from "../hooks/useLayoutTier.ts";
import { CARD_DIMS } from "../lib/layout.ts";

interface DealAnimationProps {
  state: StateMessage;
}

/** Rounds dealt per player: 3 face-down, 3 face-up, 3 to the hand. */
const ROUNDS = 3 * TABLE_SIZE;

/**
 * Animates the deal: three rounds of backs to everyone's table slots,
 * three face-up cards revealed on top (they're public, so everyone sees
 * the real cards), then three hand cards — yours face up, everyone
 * else's face down. Purely visual: the server has already dealt and
 * moves to the swapping phase ~3.5s later.
 */
export function DealAnimation({ state }: DealAnimationProps) {
  const layout = useLayoutTier();
  const players = state.players;
  const n = players.length;
  const selfIndex = players.findIndex((p) => p.playerId === state.you.playerId);
  const total = n * ROUNDS;
  const intervalMs = Math.max(2800 / total, 45);

  const [dealt, setDealt] = useState(0);
  useEffect(() => {
    if (dealt >= total) return;
    const t = setTimeout(() => setDealt((d) => d + 1), intervalMs);
    return () => clearTimeout(t);
  }, [dealt, total, intervalMs]);

  const oppSize = layout.oppCard;
  const mySize = layout.myTableCard;
  const others = n - 1;

  // Percent positions: opponents across the top, you at the bottom.
  const positions = players.map((_, i) => {
    if (i === selfIndex) return { x: 50, y: layout.sideBySide ? 70 : 78 };
    const k = i < selfIndex ? i : i - 1;
    const x = others <= 1 ? 50 : 14 + (72 * k) / (others - 1);
    return { x, y: 24 };
  });

  return (
    <div className="flex flex-1 min-h-0 flex-col relative overflow-hidden" data-testid="deal-animation">
      {/* Player labels */}
      {players.map((p, i) => {
        const Icon = ICON_MAP[p.icon];
        const color = ICON_COLORS[i % ICON_COLORS.length];
        const isSelf = i === selfIndex;
        const pos = positions[i];
        const size = isSelf ? mySize : oppSize;
        const d = CARD_DIMS[size];
        return (
          <div
            key={p.playerId}
            className="absolute flex flex-col items-center gap-1 -translate-x-1/2"
            style={{
              left: `${pos.x}%`,
              top: `calc(${pos.y}% - ${d.h / 2 + layout.avatar + 30}px)`,
            }}
          >
            <div
              className={`rounded-full flex items-center justify-center ${color}`}
              style={{ width: layout.avatar, height: layout.avatar }}
            >
              <Icon className="text-white" style={{ width: layout.avatar * 0.5, height: layout.avatar * 0.5 }} />
            </div>
            <span className="text-[11px] tablet:text-sm text-slate-200 font-medium whitespace-nowrap">
              {isSelf ? "You" : p.name}
            </span>
          </div>
        );
      })}

      {/* Flying cards */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {Array.from({ length: dealt }).map((_, i) => {
          const round = Math.floor(i / n);
          const pIdx = i % n;
          const slot = round % TABLE_SIZE;
          const kind = round < 3 ? "down" : round < 6 ? "up" : "hand";
          const isSelf = pIdx === selfIndex;
          const size = isSelf ? mySize : oppSize;
          const d = CARD_DIMS[size];
          const gap = size === "xs" ? 4 : 8;
          const pos = positions[pIdx];
          const dx = (slot - 1) * (d.w + gap);
          const dy = kind === "hand" ? d.h * 0.8 + 10 : kind === "up" ? -5 : 0;
          const card =
            kind === "up"
              ? players[pIdx].faceUp[slot]
              : kind === "hand" && isSelf
                ? state.you.hand[slot]
                : undefined;
          const faceDown = kind === "down" || (kind === "hand" && !isSelf);

          return (
            <motion.div
              key={i}
              className="absolute"
              style={{ marginLeft: -d.w / 2, marginTop: -d.h / 2, zIndex: i }}
              initial={{ left: "50%", top: "50%", x: 0, y: 0, rotate: -6, opacity: 0.9 }}
              animate={{ left: `${pos.x}%`, top: `${pos.y}%`, x: dx, y: dy, rotate: 0, opacity: 1 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
            >
              <Card card={card} faceDown={faceDown} size={size} />
            </motion.div>
          );
        })}
      </div>

      {/* The stock in the centre */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Card faceDown size={layout.tableCard} />
      </div>

      {/* Status text */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none"
        style={{ top: `calc(50% + ${CARD_DIMS[layout.tableCard].h / 2 + 14}px)` }}
      >
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-gold font-bold text-lg"
        >
          Dealing…
        </motion.div>
      </div>
    </div>
  );
}
