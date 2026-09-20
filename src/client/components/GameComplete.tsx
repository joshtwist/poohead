import { useEffect, useRef } from "react";
import type { GameCompleteMessage, StateMessage, ClientMessage, RematchInfoView } from "../../shared/protocol.ts";
import { ICON_EMOJI, playerColor } from "../lib/icons.ts";
import { ordinal } from "../lib/format.ts";
import { Card } from "./Card.tsx";

interface GameCompleteProps {
  state: StateMessage;
  result: GameCompleteMessage;
  send: (msg: ClientMessage) => void;
  onJoinRematch: (rematch: RematchInfoView) => void;
}

/**
 * End-of-game overlay over the frozen table. Three possible CTAs:
 *
 * 1. `state.rematch == null`: "Run it back" for whoever wants to move
 *    things along.
 * 2. `state.rematch != null` AND I'm the rematch creator: creating it
 *    auto-navigates me over (effect below); the fallback CTA says "Go to
 *    your new game" in case the navigate raced with the re-render.
 * 3. `state.rematch != null` AND I'm NOT the creator: "Join X's new
 *    game" — they follow at their leisure. No forced redirect.
 */
export function GameComplete({ state, result, send, onJoinRematch }: GameCompleteProps) {
  const me = state.you.playerId;
  const amPoohead = result.pooheadId === me;
  const rematch = state.rematch;
  const amCreator = rematch?.creatorId === me;

  const autoJumpedRef = useRef(false);
  useEffect(() => {
    if (!rematch || !amCreator || autoJumpedRef.current) return;
    autoJumpedRef.current = true;
    onJoinRematch(rematch);
  }, [rematch, amCreator, onJoinRematch]);

  const poohead = result.standings.find((s) => s.isPoohead);
  const pooheadCards = poohead ? result.finalCards[poohead.playerId] : undefined;
  const leftover = pooheadCards ? [...pooheadCards.hand, ...pooheadCards.faceUp, ...pooheadCards.faceDown] : [];
  const standings = [...result.standings].sort((a, b) => a.place - b.place);

  return (
    <div
      className="anim-pop cq absolute inset-0 z-30 flex flex-col overflow-y-auto no-scrollbar"
      style={{ background: "rgba(27,13,46,.82)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
    >
      <div
        className="relative min-h-full flex flex-col items-center justify-center text-center"
        style={{ padding: "clamp(40px,10cqw,90px) clamp(20px,6cqw,44px) clamp(32px,8cqw,64px)", gap: "clamp(16px,4cqw,26px)" }}
      >
        <div
          className="anim-wiggle"
          style={{
            fontSize: "clamp(90px,26cqw,150px)",
            lineHeight: 1,
            animationDuration: "1.6s",
            filter: "drop-shadow(0 16px 24px rgba(0,0,0,.5))",
          }}
        >
          {amPoohead ? "💩" : "👑"}
        </div>
        <div>
          <h1
            className="font-display font-extrabold"
            data-testid="poohead-banner"
            data-poohead={result.pooheadName}
            style={{
              fontSize: "clamp(40px,12cqw,66px)",
              lineHeight: 0.92,
              letterSpacing: "-.045em",
              color: amPoohead ? "#FF4FA3" : "#D4FF4F",
              textShadow: "0 5px 0 rgba(0,0,0,.3)",
            }}
          >
            {amPoohead ? "You're the " : `${result.pooheadName} is the `}
            <span className="whitespace-nowrap">💩head</span>
          </h1>
          <p className="mt-2.5 font-extrabold text-cream" style={{ fontSize: "clamp(15px,4.2cqw,20px)" }}>
            {amPoohead ? "Wear it with pride. Or don't." : "Everyone point and laugh."}
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full max-w-[400px]" data-testid="standings">
          {standings.map((s, i) => {
            const loser = s.isPoohead;
            return (
              <div
                key={s.playerId}
                data-testid={`standing-row-${s.name}`}
                data-place={s.place}
                className="anim-slide-in flex items-center gap-3 h-[52px] rounded-[18px] pl-2 pr-3.5"
                style={{
                  background: loser ? "rgba(255,79,163,.2)" : "rgba(255,247,232,.1)",
                  animationDelay: `${i * 60}ms`,
                  animationDuration: ".4s",
                }}
              >
                <div
                  className="font-display font-extrabold text-base w-7 text-left"
                  style={{ color: loser ? "#FF4FA3" : "#FFF7E8" }}
                >
                  {ordinal(s.place)}
                </div>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[19px]"
                  style={{ background: playerColor(state.players, s.playerId, me) }}
                >
                  {ICON_EMOJI[s.icon]}
                </div>
                <div
                  className="flex-1 text-left font-display font-bold text-[17px] truncate"
                  style={{ color: loser ? "#FF4FA3" : "#FFF7E8" }}
                >
                  {s.playerId === me ? "You" : s.name}
                </div>
                <div className="text-lg">{loser ? "💩" : s.place === 1 ? "👑" : ""}</div>
              </div>
            );
          })}
          {leftover.length > 0 && poohead && (
            <div className="mt-1 flex flex-col items-center gap-1.5" data-testid="poohead-cards">
              <div className="text-xs font-extrabold text-muted">
                {poohead.playerId === me ? "You were" : `${poohead.name} was`} left holding
              </div>
              <div className="flex flex-wrap justify-center gap-1">
                {leftover.map((card, i) => (
                  <Card key={`${card.suit}-${card.rank}-${i}`} card={card} size="xs" testId="poohead-card" />
                ))}
              </div>
            </div>
          )}
        </div>

        {rematch == null ? (
          <button
            onClick={() => send({ type: "create_rematch" })}
            data-testid="create-rematch-btn"
            className="btn-lime w-full max-w-[400px] rounded-[22px] border-0 cursor-pointer"
            style={{ height: "clamp(56px,13cqw,68px)", fontSize: "clamp(18px,4.8cqw,24px)" }}
          >
            Run it back
          </button>
        ) : (
          <button
            onClick={() => onJoinRematch(rematch)}
            data-testid="join-rematch-btn"
            className="btn-lime w-full max-w-[400px] rounded-[22px] border-0 cursor-pointer"
            style={{ height: "clamp(56px,13cqw,68px)", fontSize: "clamp(18px,4.8cqw,24px)" }}
          >
            {amCreator ? "Go to your new game" : `Join ${rematch.creatorName}'s new game`}
          </button>
        )}
      </div>
    </div>
  );
}
