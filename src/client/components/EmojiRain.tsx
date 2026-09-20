import { useMemo } from "react";
import { jit } from "../lib/placement.ts";

interface EmojiRainProps {
  /** One glyph, or several to alternate between. */
  emoji: string | string[];
  count: number;
  /** Surfaced as data-kind for tests. */
  kind?: string;
  className?: string;
}

/**
 * Emoji falling across the whole board (💩 for a pick-up, 🎉✨🎊 for going
 * out). Pure CSS `fall` keyframes; static under prefers-reduced-motion.
 * Deterministic per index so every client sees the same shower.
 */
export function EmojiRain({ emoji, count, kind, className = "" }: EmojiRainProps) {
  const glyphs = Array.isArray(emoji) ? emoji : [emoji];
  const glyphKey = glyphs.join("");
  const drops = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        left: `calc(${(100 * (i + 0.5)) / count}% + ${jit(`p${i}`, "x", 14)}px)`,
        delay: (i * 0.11) % 0.9,
        duration: 2 + ((i * 7) % 9) / 10,
        size: 22 + ((i * 11) % 18),
        glyph: glyphs[i % glyphs.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, glyphKey],
  );
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
      data-testid="emoji-rain"
      data-kind={kind}
    >
      {drops.map((d, i) => (
        <span
          key={i}
          className="emoji-drop"
          style={{
            left: d.left,
            top: -40,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
            fontSize: d.size,
          }}
        >
          {d.glyph}
        </span>
      ))}
    </div>
  );
}
