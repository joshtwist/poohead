import { motion } from "framer-motion";
import { Check, WifiOff } from "lucide-react";
import type { GamePhase } from "../../shared/types.ts";
import { TABLE_SIZE, cardKey } from "../../shared/types.ts";
import type { PlayerView } from "../../shared/protocol.ts";
import { ICON_MAP, ICON_COLORS } from "../lib/icons.ts";
import { ordinal } from "../lib/format.ts";
import { Card, CardGhost } from "./Card.tsx";
import { CARD_DIMS, type Layout } from "../lib/layout.ts";

interface OpponentsAreaProps {
  players: PlayerView[];
  selfId: string;
  currentPlayerId: string | null;
  phase: GamePhase;
  layout: Layout;
}

/**
 * One centred row of opponent tiles (never wraps: four compact tiles fit
 * a 360px phone). Each tile shows avatar, name, hand size and — the big
 * difference from Rummy — their three table slots, because face-up cards
 * are public information in 💩head.
 */
export function OpponentsArea({
  players,
  selfId,
  currentPlayerId,
  phase,
  layout,
}: OpponentsAreaProps) {
  const opponents = players
    .map((p, i) => ({ player: p, colorIndex: i }))
    .filter(({ player }) => player.playerId !== selfId);

  return (
    <div
      className="flex-shrink-0 flex justify-center items-start gap-2 compact:gap-1.5 tablet:gap-6 px-2 pt-2 pb-1 flex-nowrap"
      data-testid="player-bar"
    >
      {opponents.map(({ player, colorIndex }) => (
        <OpponentTile
          key={player.playerId}
          player={player}
          colorClass={ICON_COLORS[colorIndex % ICON_COLORS.length]}
          isActive={currentPlayerId === player.playerId}
          phase={phase}
          layout={layout}
        />
      ))}
    </div>
  );
}

function OpponentTile({
  player,
  colorClass,
  isActive,
  phase,
  layout,
}: {
  player: PlayerView;
  colorClass: string;
  isActive: boolean;
  phase: GamePhase;
  layout: Layout;
}) {
  const Icon = ICON_MAP[player.icon];
  const size = layout.oppCard;
  const d = CARD_DIMS[size];
  const peek = size === "xs" ? 5 : 7;
  const avatar = layout.avatar;

  return (
    <div
      data-testid={`opponent-${player.name}`}
      className={`flex flex-col items-center gap-1 flex-shrink-0 transition-opacity ${
        !player.connected ? "opacity-50" : ""
      } ${player.isOut ? "opacity-70" : ""}`}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          {isActive && (
            <motion.div
              className="absolute -inset-1 rounded-full ring-2 ring-gold"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          <div
            className={`relative rounded-full flex items-center justify-center ${colorClass}`}
            style={{ width: avatar, height: avatar }}
          >
            <Icon className="text-white" style={{ width: avatar * 0.5, height: avatar * 0.5 }} />
          </div>
          {phase === "swapping" && player.ready && (
            <div
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center"
              data-testid={`opponent-${player.name}-ready`}
            >
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </div>
          )}
          {!player.connected && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center">
              <WifiOff className="w-2.5 h-2.5 text-slate-300" />
            </div>
          )}
          {player.isOut && player.finishedPlace != null && (
            <div
              className="absolute -top-1.5 -right-2 px-1 rounded-full bg-gold text-slate-900 text-[9px] font-bold leading-4"
              data-testid={`opponent-${player.name}-place`}
            >
              {ordinal(player.finishedPlace)}
            </div>
          )}
        </div>
        <div className="flex flex-col leading-tight">
          <span
            className={`text-[11px] tablet:text-sm font-semibold max-w-[64px] tablet:max-w-[110px] truncate ${
              isActive ? "text-gold" : "text-slate-100"
            }`}
          >
            {player.name}
          </span>
          <HandCount count={player.handCount} isOut={player.isOut} name={player.name} />
        </div>
      </div>

      {/* Table slots */}
      <div className="flex" style={{ gap: size === "xs" ? 3 : 5 }}>
        {Array.from({ length: TABLE_SIZE }).map((_, i) => {
          const hasBack = player.faceDownSlots[i] ?? false;
          const card = player.faceUp[i];
          return (
            <div
              key={i}
              data-testid={`opponent-${player.name}-slot-${i}`}
              className="relative"
              style={{ width: d.w, height: d.h + peek }}
            >
              <div className="absolute left-0" style={{ top: peek }}>
                {hasBack ? <Card faceDown size={size} /> : <CardGhost size={size} />}
              </div>
              {card && (
                <div className="absolute left-0 top-0" style={{ zIndex: 2 }}>
                  <Card
                    card={card}
                    size={size}
                    testId={`opp-faceup-${player.name}-${cardKey(card)}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Tiny fan of card backs + a number, capped so big hands stay compact. */
function HandCount({ count, isOut, name }: { count: number; isOut: boolean; name: string }) {
  const visible = Math.min(count, 4);
  const cardW = 9;
  const stepX = 4;
  return (
    <div
      className="flex items-center gap-1 h-4"
      data-testid={`opponent-${name}-hand-count`}
      data-count={count}
    >
      {isOut ? (
        <span className="text-[10px] text-gold">out</span>
      ) : (
        <>
          <div className="relative h-3.5" style={{ width: visible === 0 ? 0 : cardW + (visible - 1) * stepX }}>
            {Array.from({ length: visible }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 rounded-[2px] bg-card-blue border border-card-blue-dark"
                style={{ left: i * stepX, width: cardW, height: 14, zIndex: i }}
              />
            ))}
          </div>
          <span className="text-[10px] text-slate-300/90 tabular-nums">{count}</span>
        </>
      )}
    </div>
  );
}
