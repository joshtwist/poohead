import { useState } from "react";
import type { StateMessage, ClientMessage } from "../../shared/protocol.ts";
import { MAX_PLAYERS, MIN_PLAYERS } from "../../shared/types.ts";
import { DEFAULT_RULES, RULE_SETS, type RuleSetId } from "../../shared/rules.ts";
import { ICON_EMOJI, playerColor } from "../lib/icons.ts";
import { ShareButton } from "./ShareButton.tsx";
import { RulesPicker } from "./RulesPicker.tsx";
import { HeroFan } from "./HeroFan.tsx";

interface LobbyProps {
  state: StateMessage;
  gameId: string;
  send: (msg: ClientMessage) => void;
}

/** How many empty "waiting" seats to show under the players. */
const EMPTY_SEATS_SHOWN = 2;

export function Lobby({ state, gameId, send }: LobbyProps) {
  const [rules, setRules] = useState<RuleSetId>(DEFAULT_RULES);
  const { you, players } = state;
  const canStart = players.length >= MIN_PLAYERS;
  const host = players[0];
  const emptySeats = Math.min(EMPTY_SEATS_SHOWN, MAX_PLAYERS - players.length);

  function handleStart() {
    if (!canStart) return;
    send({ type: "start_game", rules });
  }

  return (
    <div className="cq relative flex-1 min-h-0 overflow-y-auto no-scrollbar">
      <div className="dot-grid absolute inset-0 pointer-events-none" />
      <div
        className="relative min-h-full flex flex-col max-w-[560px] mx-auto"
        style={{ padding: "clamp(28px,7cqw,56px) clamp(18px,5cqw,40px) clamp(24px,5cqw,40px)", gap: "clamp(14px,3.5cqw,22px)" }}
      >
        {/* Title + count + small hero */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1
              className="font-display font-extrabold"
              style={{ fontSize: "clamp(36px,10cqw,58px)", lineHeight: 0.95, letterSpacing: "-.04em" }}
            >
              The lobby
            </h1>
            <div
              className="mt-1.5 font-extrabold text-lime"
              style={{ fontSize: "clamp(14px,3.8cqw,18px)" }}
              data-testid="lobby-count"
            >
              {players.length} of {MAX_PLAYERS} at the table
            </div>
          </div>
          <HeroFan style={{ width: "min(12cqw,70px)", height: "min(16.7cqw,98px)", marginRight: "min(6cqw,40px)" }} />
        </div>

        {/* Seats */}
        <div className="flex flex-col gap-2">
          {players.map((player, i) => {
            const isYou = player.playerId === you.playerId;
            return (
              <div
                key={player.playerId}
                data-testid={`lobby-player-${player.name}`}
                className="anim-slide-in flex items-center gap-3 rounded-[20px] pl-2 pr-3.5"
                style={{
                  height: "clamp(52px,13cqw,66px)",
                  background: "rgba(255,247,232,.1)",
                  border: "2px solid rgba(255,247,232,.12)",
                  animationDelay: `${i * 40}ms`,
                }}
              >
                <div
                  className="rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    width: "clamp(38px,9.5cqw,48px)",
                    height: "clamp(38px,9.5cqw,48px)",
                    background: playerColor(players, player.playerId, you.playerId),
                    fontSize: "clamp(20px,5cqw,26px)",
                    boxShadow: "inset 0 -3px 0 rgba(0,0,0,.18)",
                  }}
                >
                  {ICON_EMOJI[player.icon]}
                </div>
                <div
                  className="flex-1 font-display font-bold truncate"
                  style={{ fontSize: "clamp(17px,4.4cqw,21px)", letterSpacing: "-.01em" }}
                >
                  {isYou ? "You" : player.name}
                  {!player.connected && <span className="text-muted text-sm font-body ml-2">offline</span>}
                </div>
                {i === 0 && (
                  <div className="text-xs font-black tracking-[.06em] uppercase text-ink bg-lime px-2.5 py-1 rounded-full">
                    Host
                  </div>
                )}
              </div>
            );
          })}
          {Array.from({ length: emptySeats }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 rounded-[20px] pl-2 pr-3.5"
              style={{ height: "clamp(52px,13cqw,66px)", border: "2px dashed rgba(255,247,232,.2)" }}
            >
              <div
                className="rounded-full flex-shrink-0"
                style={{
                  width: "clamp(38px,9.5cqw,48px)",
                  height: "clamp(38px,9.5cqw,48px)",
                  background: "rgba(255,247,232,.08)",
                }}
              />
              <div className="flex-1 font-display font-bold text-muted" style={{ fontSize: "clamp(17px,4.4cqw,21px)" }}>
                Waiting for a mate…
              </div>
            </div>
          ))}
        </div>

        <ShareButton gameId={gameId} />

        {/* House rules */}
        <div className="flex-1 min-h-0 flex flex-col gap-2.5">
          <div className="text-xs font-black tracking-[.1em] uppercase text-muted">House rules</div>
          {you.isCreator ? (
            <RulesPicker value={rules} onChange={setRules} />
          ) : (
            <div
              className="rounded-2xl px-4 py-3 text-muted font-bold"
              style={{ background: "rgba(255,247,232,.06)", border: "2px solid rgba(255,247,232,.14)", fontSize: "clamp(13px,3.4cqw,15px)" }}
            >
              {host?.name ?? "The host"} picks the rules. Three flavours: {RULE_SETS.millybims.name},{" "}
              {RULE_SETS.ukpub.name} or {RULE_SETS.standard.name}.
            </div>
          )}
        </div>

        {you.isCreator ? (
          <button
            data-testid="start-game-btn"
            onClick={handleStart}
            disabled={!canStart}
            className="btn-lime w-full rounded-[22px] border-0 cursor-pointer"
            style={{ height: "clamp(58px,14cqw,72px)", fontSize: "clamp(19px,5cqw,26px)" }}
          >
            {canStart ? "Deal the cards" : "Need one more player…"}
          </button>
        ) : (
          <div
            className="w-full rounded-[22px] flex items-center justify-center font-display font-extrabold text-muted"
            style={{ height: "clamp(58px,14cqw,72px)", fontSize: "clamp(17px,4.4cqw,22px)", background: "rgba(255,247,232,.1)" }}
          >
            <span className="anim-floaty mr-2">🃏</span>
            Waiting for {host?.name ?? "the host"} to deal…
          </div>
        )}
      </div>
    </div>
  );
}
