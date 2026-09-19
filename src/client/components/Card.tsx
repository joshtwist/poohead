import { motion } from "framer-motion";
import type { Card as CardType } from "../../shared/types.ts";
import { CARD_DIMS, type CardSize } from "../lib/layout.ts";

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

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
  layoutId?: string;
  testId?: string;
}

/** Inline size so Tailwind never has to see interpolated class names. */
function dimStyle(size: CardSize): React.CSSProperties {
  const d = CARD_DIMS[size];
  return { width: d.w, height: d.h, borderRadius: d.r };
}

/* ── Card back (face-down) ──────────────────────────────────────────── */

function CardBack({
  size,
  className,
  testId,
  onClick,
  interactive,
  selected,
}: {
  size: CardSize;
  className: string;
  testId?: string;
  onClick?: () => void;
  interactive: boolean;
  selected: boolean;
}) {
  const thin = size === "xs" || size === "sm";
  return (
    <div
      data-testid={testId}
      onClick={interactive ? onClick : undefined}
      style={dimStyle(size)}
      className={`relative bg-card-blue border border-card-blue-dark shadow-[0_2px_6px_var(--color-card-shadow)] overflow-hidden ${
        interactive ? "cursor-pointer" : ""
      } ${selected ? "ring-2 ring-gold" : ""} ${className}`}
    >
      <div
        className={`absolute rounded-[inherit] border-card-blue-light/50 ${
          thin ? "inset-[2px] border" : "inset-[3px] border-[1.5px]"
        }`}
      >
        {!thin && (
          <div className="absolute inset-[3px] rounded-[inherit] border border-card-blue-dark/60 bg-card-blue-dark/20" />
        )}
      </div>
    </div>
  );
}

/* ── Card face (face-up) ────────────────────────────────────────────── */

function CardFace({
  card,
  size,
  isRed,
  interactive,
  selected,
  dimmed,
  wild,
  onClick,
  className,
  testId,
}: {
  card: CardType;
  size: CardSize;
  isRed: boolean;
  interactive: boolean;
  selected: boolean;
  dimmed: boolean;
  wild: boolean;
  onClick?: () => void;
  className: string;
  testId?: string;
}) {
  const d = CARD_DIMS[size];
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const colorClass = isRed ? "text-card-red" : "text-card-black";

  return (
    <div
      data-testid={testId}
      style={dimStyle(size)}
      className={`
        ${colorClass}
        relative bg-white border border-black/[0.08]
        shadow-[0_2px_6px_var(--color-card-shadow)]
        overflow-hidden select-none
        ${interactive ? "cursor-pointer" : ""}
        ${selected ? "ring-2 ring-gold shadow-[0_4px_14px_var(--color-card-shadow),0_0_0_2px_var(--color-gold)]" : ""}
        ${dimmed ? "opacity-45" : ""}
        transition-opacity duration-200
        ${className}
      `.trim()}
      onClick={interactive ? onClick : undefined}
    >
      {size === "xs" ? (
        // Tiny cards: one centred rank + suit, nothing else fits.
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span style={{ fontSize: d.rank }} className="font-bold leading-none">
            {card.rank}
          </span>
          <span style={{ fontSize: d.suit }} className="leading-none">
            {suitSymbol}
          </span>
        </div>
      ) : (
        <>
          <div
            className="absolute top-0 left-0 flex flex-col items-center leading-none"
            style={{ padding: d.pad }}
          >
            <span style={{ fontSize: d.rank }} className="font-bold leading-none">
              {card.rank}
            </span>
            <span style={{ fontSize: d.suit }} className="leading-none -mt-[1px]">
              {suitSymbol}
            </span>
          </div>
          <div
            className="absolute bottom-0 right-0 flex flex-col items-center rotate-180 leading-none"
            style={{ padding: d.pad }}
          >
            <span style={{ fontSize: d.rank }} className="font-bold leading-none">
              {card.rank}
            </span>
            <span style={{ fontSize: d.suit }} className="leading-none -mt-[1px]">
              {suitSymbol}
            </span>
          </div>
          {size !== "sm" && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ fontSize: Math.round(d.h * 0.32) }}
            >
              <span className="opacity-90 leading-none">{suitSymbol}</span>
            </div>
          )}
        </>
      )}
      {wild && (
        <span
          className={`absolute pointer-events-none ${
            size === "xs" || size === "sm"
              ? "top-0 right-0 w-[7px] h-[7px] rounded-full bg-gold m-[2px]"
              : "top-1 right-1 text-gold"
          }`}
          style={size === "xs" || size === "sm" ? undefined : { fontSize: Math.max(10, d.suit) }}
          title="Wild card"
        >
          {size === "xs" || size === "sm" ? "" : "✦"}
        </span>
      )}
    </div>
  );
}

/* ── Public Card component ──────────────────────────────────────────── */

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
  layoutId,
  testId,
}: CardProps) {
  const isRed = card != null && (card.suit === "hearts" || card.suit === "diamonds");

  const content =
    faceDown || !card ? (
      <CardBack
        size={size}
        className={className}
        testId={testId}
        onClick={onClick}
        interactive={interactive}
        selected={selected}
      />
    ) : (
      <CardFace
        card={card}
        size={size}
        isRed={isRed}
        interactive={interactive}
        selected={selected}
        dimmed={dimmed}
        wild={wild}
        onClick={onClick}
        className={className}
        testId={testId}
      />
    );

  if (layoutId) {
    return (
      <motion.div layoutId={layoutId} transition={{ duration: 0.25 }}>
        {content}
      </motion.div>
    );
  }

  return content;
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
  return (
    <div
      data-testid={testId}
      style={dimStyle(size)}
      className={`border-2 border-dashed border-white/15 flex items-center justify-center ${className}`}
    >
      {children}
    </div>
  );
}
