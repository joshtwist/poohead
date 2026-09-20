import type { PlayerIcon } from "../../shared/types.ts";

/** Avatar glyph for each pickable icon. */
export const ICON_EMOJI: Record<PlayerIcon, string> = {
  cat: "🐱",
  dog: "🐶",
  bird: "🐦",
  fish: "🐟",
  rabbit: "🐰",
  snail: "🐌",
  bug: "🐛",
  flame: "🔥",
  zap: "⚡",
  star: "⭐",
  moon: "🌙",
  sun: "☀️",
  heart: "❤️",
  skull: "💀",
  ghost: "👻",
  rocket: "🚀",
  crown: "👑",
  gem: "💎",
  anchor: "⚓",
  "gamepad-2": "🎮",
};

/** You are always hot pink; everyone else takes these in seat order. */
export const ME_COLOR = "#FF4FA3";
export const OPPONENT_COLORS = ["#FF8A3D", "#4FC3FF", "#B76CFF", "#59E3A7"];

/** Disc colours for the icon picker, cycled by index. */
export const PICKER_COLORS = [ME_COLOR, ...OPPONENT_COLORS];

/**
 * Colour for a player as seen from `selfId`: you are pink, opponents are
 * coloured by their seat order among the other players.
 */
export function playerColor(
  players: { playerId: string }[],
  playerId: string,
  selfId: string,
): string {
  if (playerId === selfId) return ME_COLOR;
  const others = players.filter((p) => p.playerId !== selfId);
  const idx = others.findIndex((p) => p.playerId === playerId);
  return OPPONENT_COLORS[(idx >= 0 ? idx : 0) % OPPONENT_COLORS.length];
}
