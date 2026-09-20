import { useEffect, useState, type CSSProperties } from "react";
import type { Card as CardType, Rank, Suit } from "../../shared/types.ts";
import { CARD_BASE_H, CARD_BASE_W, CARD_RATIO, CARD_WIDTHS, type CardSize } from "../lib/layout.ts";

/* ── Card artwork constants (from the design prototype) ─────────────── */

export const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const SUIT_COLOR: Record<Suit, string> = {
  hearts: "#E0362C",
  diamonds: "#E0362C",
  clubs: "#1E1A2B",
  spades: "#1E1A2B",
};

const CROWN: Partial<Record<Rank, string>> = { J: "♟", Q: "♛", K: "♚" };

/** Pip positions (x%, y%, flipped) inside the inset pip box. */
const C = 50;
const PIPS: Partial<Record<Rank, [number, number, 1?][]>> = {
  "2": [[C, 12], [C, 88, 1]],
  "3": [[C, 12], [C, 50], [C, 88, 1]],
  "4": [[25, 12], [75, 12], [25, 88, 1], [75, 88, 1]],
  "5": [[25, 12], [75, 12], [C, 50], [25, 88, 1], [75, 88, 1]],
  "6": [[25, 12], [75, 12], [25, 50], [75, 50], [25, 88, 1], [75, 88, 1]],
  "7": [[25, 12], [75, 12], [C, 31], [25, 50], [75, 50], [25, 88, 1], [75, 88, 1]],
  "8": [[25, 12], [75, 12], [C, 31], [25, 50], [75, 50], [C, 69, 1], [25, 88, 1], [75, 88, 1]],
  "9": [[25, 12], [75, 12], [25, 37], [75, 37], [C, 50], [25, 63, 1], [75, 63, 1], [25, 88, 1], [75, 88, 1]],
  "10": [
    [25, 12],
    [75, 12],
    [C, 25],
    [25, 37],
    [75, 37],
    [25, 63, 1],
    [75, 63, 1],
    [C, 75, 1],
    [25, 88, 1],
    [75, 88, 1],
  ],
};

/** Box-shadow recipes for the card states. */
export const CARD_SHADOW = {
  rest: "0 1px 0 rgba(255,255,255,.5) inset, 0 5px 12px rgba(10,4,20,.38)",
  playable:
    "0 1px 0 rgba(255,255,255,.5) inset, 0 0 0 1.5px rgba(212,255,79,.55), 0 5px 12px rgba(10,4,20,.38)",
  selected: "0 0 0 3px #D4FF4F, 0 18px 28px rgba(10,4,20,.5)",
  swapSelected: "0 0 0 3px #D4FF4F, 0 14px 24px rgba(10,4,20,.45)",
  swapTarget: "0 0 0 2.5px rgba(212,255,79,.85), 0 5px 12px rgba(10,4,20,.38)",
  blind: "0 0 0 2.5px rgba(212,255,79,.9), 0 0 22px rgba(212,255,79,.45)",
  flat: "0 5px 12px rgba(10,4,20,.38)",
} as const;

const DISPLAY: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 800,
  lineHeight: 1,
};

/* ── CardArt: the 76×106 face + back with a real 3D flip ─────────────── */

export interface CardArtProps {
  /** Omit for an anonymous face-down card. */
  card?: CardType;
  faceUp: boolean;
  wild?: boolean;
  shadow?: string;
}

/**
 * One card at its base geometry. Scale the parent with `transform` so the
 * pips stay proportional; never re-layout per size. The flip is a real
 * rotateY with backface-visibility, plus a visibility swap at the midpoint
 * for browsers that ignore backface-visibility.
 */
export function CardArt({ card, faceUp, wild = false, shadow = CARD_SHADOW.rest }: CardArtProps) {
  const showFront = useFlipFace(faceUp && !!card);
  const front = faceUp && !!card;
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 700 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transition: "transform .5s cubic-bezier(.4,0,.2,1)",
          transform: `rotateY(${front ? 0 : 180}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 9,
            background: "linear-gradient(160deg,#FFFDF7,#FFF6E4)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            boxShadow: shadow,
            color: card ? SUIT_COLOR[card.suit] : undefined,
            overflow: "hidden",
            visibility: showFront ? "visible" : "hidden",
            transition: "box-shadow .3s",
          }}
        >
          {card && <Face card={card} wild={wild} />}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 9,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "repeating-linear-gradient(135deg,#5E2C8C 0 5px,#4C2076 5px 10px)",
            boxShadow: shadow,
            overflow: "hidden",
            visibility: showFront ? "hidden" : "visible",
            transition: "box-shadow .3s",
          }}
        >
          <div style={{ position: "absolute", inset: 4, borderRadius: 6, border: "2px solid #D4FF4F", opacity: 0.9 }} />
          <div style={{ position: "absolute", inset: 9, borderRadius: 3, border: "1px solid rgba(255,247,232,.35)" }} />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "#FFF7E8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 21,
              lineHeight: 1,
              boxShadow: "0 2px 0 rgba(0,0,0,.25)",
            }}
          >
            💩
          </div>
        </div>
      </div>
    </div>
  );
}

/** Which face is visible; swaps at the midpoint of the 500ms flip. */
function useFlipFace(front: boolean): boolean {
  const [shown, setShown] = useState(front);
  useEffect(() => {
    if (shown === front) return;
    const t = setTimeout(() => setShown(front), 250);
    return () => clearTimeout(t);
  }, [front, shown]);
  return shown;
}

function Face({ card, wild }: { card: CardType; wild: boolean }) {
  const sym = SUIT_SYMBOL[card.suit];
  const r = card.rank;
  const isCourt = r === "J" || r === "Q" || r === "K";
  const isAce = r === "A";
  const pips = PIPS[r] ?? [];
  return (
    <>
      <Corner rank={r} sym={sym} flipped={false} />
      <Corner rank={r} sym={sym} flipped />
      {isCourt && (
        <div
          style={{
            position: "absolute",
            left: 19,
            right: 19,
            top: 17,
            bottom: 17,
            border: "1.5px solid currentColor",
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", inset: 2, border: ".75px solid currentColor", borderRadius: 2, opacity: 0.5 }} />
          <div style={{ position: "absolute", top: 3, left: 3, fontSize: 9, lineHeight: 1 }}>{sym}</div>
          <div style={{ position: "absolute", bottom: 3, right: 3, fontSize: 9, lineHeight: 1, transform: "rotate(180deg)" }}>
            {sym}
          </div>
          <div style={{ position: "absolute", fontSize: 44, lineHeight: 1, opacity: 0.13 }}>{sym}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
            <div style={{ fontSize: 11 }}>{CROWN[r]}</div>
            <div style={{ ...DISPLAY, fontSize: 30, letterSpacing: "-.05em" }}>{r}</div>
            <div style={{ fontSize: 11, transform: "rotate(180deg)" }}>{CROWN[r]}</div>
          </div>
        </div>
      )}
      {isAce && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 44,
            lineHeight: 1,
            textShadow: "0 2px 0 rgba(0,0,0,.08)",
          }}
        >
          {sym}
        </div>
      )}
      {pips.length > 0 && (
        <div style={{ position: "absolute", left: 19, right: 19, top: 16, bottom: 16 }}>
          {pips.map(([x, y, f], i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%,-50%) rotate(${f ? 180 : 0}deg)`,
                fontSize: 15,
                lineHeight: 1,
              }}
            >
              {sym}
            </span>
          ))}
        </div>
      )}
      {wild && (
        <div
          title="Wild card"
          style={{
            position: "absolute",
            top: 5,
            right: 6,
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: "#D4FF4F",
            color: "#1B0D2E",
            fontSize: 9,
            lineHeight: "13px",
            textAlign: "center",
            fontWeight: 900,
          }}
        >
          ✦
        </div>
      )}
    </>
  );
}

function Corner({ rank, sym, flipped }: { rank: Rank; sym: string; flipped: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        ...(flipped ? { bottom: 5, right: 6, transform: "rotate(180deg)" } : { top: 5, left: 6 }),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        ...DISPLAY,
      }}
    >
      <span style={{ fontSize: 17, letterSpacing: "-.04em" }}>{rank}</span>
      <span style={{ fontSize: 12, marginTop: 1 }}>{sym}</span>
    </div>
  );
}

/* ── Public Card component (static, scaled) ─────────────────────────── */

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  size?: CardSize;
  onClick?: () => void;
  selected?: boolean;
  interactive?: boolean;
  /** Fade the card to show it can't be played right now. */
  dimmed?: boolean;
  /** Mark a wild card (2, 10, invisible ranks, the Millybims 7). */
  wild?: boolean;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

/**
 * A card at one of the fixed sizes: the base artwork scaled with
 * `transform`. Used for static places (end screen, hero fans); the board
 * renders its cards through CardLayer instead.
 */
export function Card({
  card,
  faceDown = false,
  size = "md",
  onClick,
  selected = false,
  interactive = false,
  dimmed = false,
  wild = false,
  className = "",
  style,
  testId,
}: CardProps) {
  const w = CARD_WIDTHS[size];
  const h = Math.round(w * CARD_RATIO);
  return (
    <div
      data-testid={testId}
      onClick={interactive ? onClick : undefined}
      className={`${interactive ? "cursor-pointer" : ""} ${className}`}
      style={{
        position: "relative",
        width: w,
        height: h,
        flexShrink: 0,
        opacity: dimmed ? 0.5 : 1,
        transition: "opacity .2s",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: CARD_BASE_W,
          height: CARD_BASE_H,
          transform: `scale(${w / CARD_BASE_W})`,
          transformOrigin: "top left",
        }}
      >
        <CardArt
          card={card}
          faceUp={!faceDown && !!card}
          wild={wild}
          shadow={selected ? CARD_SHADOW.selected : CARD_SHADOW.rest}
        />
      </div>
    </div>
  );
}

/** Dashed outline the size of a card, for empty slots. */
export function CardGhost({
  size,
  className = "",
  testId,
  children,
}: {
  size: CardSize;
  className?: string;
  testId?: string;
  children?: React.ReactNode;
}) {
  const w = CARD_WIDTHS[size];
  return (
    <div
      data-testid={testId}
      style={{ width: w, height: Math.round(w * CARD_RATIO), borderRadius: Math.max(4, Math.round(w / 9)) }}
      className={`border-2 border-dashed border-cream/16 flex items-center justify-center ${className}`}
    >
      {children}
    </div>
  );
}
