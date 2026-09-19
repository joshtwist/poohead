import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, LogIn } from "lucide-react";
import type {
  GameCompleteMessage,
  StateMessage,
  ClientMessage,
  RematchInfoView,
} from "../../shared/protocol.ts";
import { ICON_MAP, ICON_COLORS } from "../lib/icons.ts";
import { ordinal } from "../lib/format.ts";
import { Card } from "./Card.tsx";

interface GameCompleteProps {
  state: StateMessage;
  result: GameCompleteMessage;
  send: (msg: ClientMessage) => void;
  onJoinRematch: (rematch: RematchInfoView) => void;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * End-of-game screen. Three possible CTAs, chosen from state:
 *
 * 1. `state.rematch == null`: "Deal the next game" for whoever wants to
 *    move things along.
 * 2. `state.rematch != null` AND I'm the rematch creator: creating it
 *    auto-navigates me over (effect below); the fallback CTA says "Go to
 *    your new game" in case the navigate raced with the re-render.
 * 3. `state.rematch != null` AND I'm NOT the creator: "Join X's new
 *    game" — they follow at their leisure. No forced redirect.
 *
 * The completed game persists in the Durable Object, so re-visiting the
 * URL always lands back here with the same rematch info.
 */
export function GameComplete({
  state,
  result,
  send,
  onJoinRematch,
}: GameCompleteProps) {
  const me = state.you.playerId;
  const amPoohead = result.pooheadId === me;
  const myStanding = result.standings.find((s) => s.playerId === me);
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
  const leftover = pooheadCards
    ? [...pooheadCards.hand, ...pooheadCards.faceUp, ...pooheadCards.faceDown]
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative flex flex-1 min-h-0 flex-col overflow-y-auto"
    >
      <PoohRain count={amPoohead ? 40 : 12} />

      <div className="relative flex flex-col items-center px-6 py-8 w-full max-w-md mx-auto">
        {/* Banner */}
        <motion.div
          initial={{ scale: 0.9, y: -20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="flex flex-col items-center gap-2 mb-6 text-center"
        >
          <motion.div
            className="text-6xl"
            animate={amPoohead ? { rotate: [0, -8, 8, -6, 6, 0] } : { y: [0, -6, 0] }}
            transition={{ duration: amPoohead ? 0.9 : 1.6, repeat: Infinity, repeatDelay: 1.2 }}
          >
            {amPoohead ? "💩" : "🎉"}
          </motion.div>
          <h1 className="text-4xl font-bold" data-testid="poohead-banner" data-poohead={result.pooheadName}>
            {amPoohead ? "You're the 💩head!" : `${result.pooheadName} is the 💩head!`}
          </h1>
          <p className="text-slate-300">
            {amPoohead
              ? "Last one holding cards. It happens to the best of us."
              : myStanding
                ? `You finished ${ordinal(myStanding.place)}`
                : ""}
          </p>
        </motion.div>

        {/* Standings */}
        <div
          className="w-full bg-slate-800/70 border border-slate-700 rounded-2xl p-4 mb-6"
          data-testid="standings"
        >
          <h2 className="text-center text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Standings
          </h2>
          <div className="flex flex-col gap-2">
            {result.standings.map((s) => {
              const Icon = ICON_MAP[s.icon];
              const colorIndex = state.players.findIndex((p) => p.playerId === s.playerId);
              const color = ICON_COLORS[(colorIndex >= 0 ? colorIndex : 0) % ICON_COLORS.length];
              const isMe = s.playerId === me;
              return (
                <div
                  key={s.playerId}
                  data-testid={`standing-row-${s.name}`}
                  data-place={s.place}
                  className={`rounded-xl p-3 flex items-center gap-3 ${
                    s.isPoohead
                      ? "bg-poo/30 border border-poo-light/50"
                      : s.place === 1
                        ? "bg-gold/10 border border-gold/40"
                        : "bg-slate-900/60 border border-slate-800"
                  }`}
                >
                  <div className="w-8 text-center text-xl">
                    {s.isPoohead ? "💩" : MEDALS[s.place - 1] ?? <span className="text-sm text-slate-400">{ordinal(s.place)}</span>}
                  </div>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {s.name}
                      {isMe && <span className="text-slate-400 text-sm ml-1">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-400">
                      {s.isPoohead ? "The 💩head" : `Out ${ordinal(s.place)}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {leftover.length > 0 && poohead && (
            <div className="mt-4" data-testid="poohead-cards">
              <div className="text-xs text-slate-400 mb-2 text-center">
                {poohead.playerId === me ? "You were" : `${poohead.name} was`} left holding
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {leftover.map((card, i) => (
                  <Card key={`${card.suit}-${card.rank}-${i}`} card={card} size="sm" testId="poohead-card" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        {rematch == null ? (
          <button
            onClick={() => send({ type: "create_rematch" })}
            data-testid="create-rematch-btn"
            className="w-full py-4 px-6 bg-gold hover:bg-amber-400 active:bg-amber-500 text-slate-900 font-bold text-lg rounded-xl transition-colors duration-200 shadow-lg cursor-pointer flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Deal the next game
          </button>
        ) : (
          <button
            onClick={() => onJoinRematch(rematch)}
            data-testid="join-rematch-btn"
            className="w-full py-4 px-6 bg-gold hover:bg-amber-400 active:bg-amber-500 text-slate-900 font-bold text-lg rounded-xl transition-colors duration-200 shadow-lg cursor-pointer flex items-center justify-center gap-2"
          >
            <LogIn className="w-5 h-5" />
            {amCreator ? "Go to your new game" : `Join ${rematch.creatorName}'s new game`}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** Falling 💩 emoji. Pure CSS keyframes; static under reduced motion. */
function PoohRain({ count }: { count: number }) {
  const drops = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        left: (i * 37 + 11) % 100,
        delay: ((i * 53) % 40) / 10,
        duration: 5 + ((i * 29) % 40) / 10,
        size: 18 + ((i * 17) % 22),
      })),
    [count],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden data-testid="poo-rain">
      {drops.map((d, i) => (
        <span
          key={i}
          className="poo-drop"
          style={{
            left: `${d.left}%`,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
            fontSize: d.size,
          }}
        >
          💩
        </span>
      ))}
    </div>
  );
}
