import { useMemo } from "react";

interface EmojiRainProps {
  /** One glyph, or several to alternate between. */
  emoji: string | string[];
  count: number;
  /** burst: every drop falls once within ~2.5s. loop: the end-screen downpour. */
  mode?: "burst" | "loop";
  /** Surfaced as data-kind for tests. */
  kind?: string;
  className?: string;
}

/**
 * Emoji falling over the whole board. Pure CSS keyframes (see index.css);
 * static under prefers-reduced-motion. Deterministic per index so it
 * renders identically on every client.
 */
export function EmojiRain({ emoji, count, mode = "burst", kind, className = "" }: EmojiRainProps) {
  const glyphs = Array.isArray(emoji) ? emoji : [emoji];
  const glyphKey = glyphs.join("");
  const drops = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        left: (i * 37 + 11) % 100,
        delay: mode === "loop" ? ((i * 53) % 40) / 10 : ((i * 53) % 9) / 10,
        duration: mode === "loop" ? 5 + ((i * 29) % 40) / 10 : 1.5 + ((i * 29) % 8) / 10,
        size: 18 + ((i * 17) % 22),
        glyph: glyphs[i % glyphs.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, mode, glyphKey],
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
          className={mode === "loop" ? "emoji-drop" : "emoji-drop emoji-burst"}
          style={{
            left: `${d.left}%`,
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
