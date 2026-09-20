import type { GamePhase } from "../../shared/types.ts";
import { TABLE_SIZE } from "../../shared/types.ts";
import type { PlayerView } from "../../shared/protocol.ts";
import { ICON_EMOJI } from "../lib/icons.ts";
import { ordinal } from "../lib/format.ts";

interface OpponentsAreaProps {
  /** Everyone but you, in seat order. */
  opponents: PlayerView[];
  colorFor: (playerId: string) => string;
  currentPlayerId: string | null;
  phase: GamePhase;
  /** Transient reactions ("+3 💩", "burn 🔥") keyed by playerId. */
  badges: Record<string, { text: string; key: number }>;
  /**
   * Narrow tiles (avatar over name, count as a pill) so three or four
   * opponents still share one row of a phone.
   */
  dense: boolean;
}

/**
 * One centred row of opponent tiles. Each tile is avatar + name + hand
 * count, a hand-stub zone and three slot zones; the cards themselves live
 * in the card layer and fly to these placeholders.
 */
export function OpponentsArea({ opponents, colorFor, currentPlayerId, phase, badges, dense }: OpponentsAreaProps) {
  const many = opponents.length >= 4;
  const slotW = dense ? (many ? "min(6.8cqw,40px)" : "min(8cqw,46px)") : "min(8cqw,46px)";
  const slotH = dense ? (many ? "min(9.5cqw,56px)" : "min(11.2cqw,64px)") : "min(11.2cqw,64px)";
  const avatar = dense ? "clamp(26px,7cqw,34px)" : "clamp(30px,7.5cqw,42px)";
  return (
    <div
      className="flex-shrink-0 flex justify-center items-start flex-nowrap"
      style={{ gap: dense ? "clamp(8px,2.5cqw,24px)" : "clamp(10px,4cqw,40px)" }}
      data-testid="player-bar"
    >
      {opponents.map((p) => {
        const active = phase === "playing" && currentPlayerId === p.playerId;
        const badge = badges[p.playerId];
        const avatarEl = (
          <div className="relative">
            <div
              className={`rounded-full flex items-center justify-center ${active ? "pulse-lime" : ""}`}
              style={{
                width: avatar,
                height: avatar,
                background: colorFor(p.playerId),
                fontSize: dense ? "clamp(13px,3.4cqw,18px)" : "clamp(15px,3.8cqw,22px)",
                boxShadow: `inset 0 -3px 0 rgba(0,0,0,.18)${active ? ", 0 0 0 3px #2B1743, 0 0 0 6px #D4FF4F" : ""}`,
                transition: "box-shadow .3s",
              }}
            >
              {ICON_EMOJI[p.icon]}
            </div>
            {phase === "swapping" && p.ready && (
              <div
                data-testid={`opponent-${p.name}-ready`}
                className="absolute -right-1 -bottom-[3px] w-4 h-4 rounded-full bg-lime text-ink text-[10px] font-black flex items-center justify-center border-2 border-table"
              >
                ✓
              </div>
            )}
            {!p.connected && (
              <div
                className="absolute -right-1 -bottom-[3px] w-4 h-4 rounded-full bg-table-deep text-muted text-[9px] flex items-center justify-center border-2 border-table"
                title="Offline"
              >
                ⌁
              </div>
            )}
            {p.isOut && p.finishedPlace != null && (
              <div
                data-testid={`opponent-${p.name}-place`}
                className="absolute -right-2 -top-1.5 px-1.5 rounded-full bg-lime text-ink text-[10px] font-black leading-4"
              >
                {ordinal(p.finishedPlace)}
              </div>
            )}
          </div>
        );
        const nameStyle = {
          fontSize: dense ? "clamp(11px,2.9cqw,14px)" : "clamp(12px,3.2cqw,16px)",
          color: active ? "#D4FF4F" : "#FFF7E8",
        };
        return (
          <div
            key={p.playerId}
            data-testid={`opponent-${p.name}`}
            data-opponent-tile
            data-connected={p.connected ? "true" : "false"}
            data-out={p.isOut ? "true" : undefined}
            className="relative flex flex-col items-center gap-1.5 flex-shrink-0 transition-opacity duration-300"
            style={{ opacity: p.isOut ? 0.55 : p.connected ? 1 : 0.5 }}
          >
            {badge && (
              <div
                key={badge.key}
                data-testid={`opponent-${p.name}-badge`}
                className="anim-badge-up absolute left-1/2 z-10 px-2.5 py-1 rounded-full bg-cream text-ink font-black text-xs whitespace-nowrap pointer-events-none"
                style={{ top: -6, boxShadow: "0 4px 12px rgba(0,0,0,.35)" }}
              >
                {badge.text}
              </div>
            )}

            {dense ? (
              <>
                <div className="flex items-center gap-1.5">
                  {avatarEl}
                  <div className="relative">
                    <div data-zone={`ohand-${p.playerId}`} style={{ width: "min(5cqw,28px)", height: "min(7cqw,40px)" }} />
                    <div
                      className="absolute -right-1.5 -bottom-1 min-w-4 px-1 rounded-full bg-cream text-ink font-black text-[9.5px] leading-[15px] text-center whitespace-nowrap"
                      data-testid={`opponent-${p.name}-hand-count`}
                      data-count={p.handCount}
                      style={{ boxShadow: "0 2px 6px rgba(0,0,0,.35)" }}
                    >
                      {p.isOut ? "out" : p.handCount}
                    </div>
                  </div>
                </div>
                <div
                  className="font-display font-extrabold truncate -mt-0.5"
                  style={{ ...nameStyle, maxWidth: `calc(3 * ${slotW} + 8px)` }}
                >
                  {p.name}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-[7px]">
                {avatarEl}
                <div className="flex flex-col" style={{ lineHeight: 1.05 }}>
                  <div className="font-display font-extrabold truncate" style={{ ...nameStyle, maxWidth: 70 }}>
                    {p.name}
                  </div>
                  <div
                    className="text-muted font-extrabold mt-0.5"
                    style={{ fontSize: "clamp(10px,2.7cqw,13px)" }}
                    data-testid={`opponent-${p.name}-hand-count`}
                    data-count={p.handCount}
                  >
                    {p.isOut ? "out" : `${p.handCount} in hand`}
                  </div>
                </div>
                <div
                  data-zone={`ohand-${p.playerId}`}
                  className="ml-0.5"
                  style={{ width: "min(6cqw,34px)", height: "min(8.4cqw,48px)" }}
                />
              </div>
            )}

            <div className="flex gap-1">
              {Array.from({ length: TABLE_SIZE }).map((_, i) => (
                <div
                  key={i}
                  data-zone={`oslot-${p.playerId}-${i}`}
                  data-testid={`opponent-${p.name}-slot-${i}`}
                  className="rounded-[5px] border-[1.5px] border-dashed border-cream/18"
                  style={{ width: slotW, height: slotH }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
