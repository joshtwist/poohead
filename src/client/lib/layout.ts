/*
 * Responsive layout tiers. The JS tier is the single source of truth:
 * GameBoard computes it from the viewport, sets `data-tier` on the board
 * (so Tailwind `compact:` / `tablet:` variants in index.css agree with
 * it) and passes the spec down as a prop.
 */

export type Tier = "compact" | "phone" | "tablet" | "tabletWide";

export type CardSize = "xs" | "sm" | "md" | "ml" | "lg" | "xl";

export interface CardDims {
  w: number;
  h: number;
  /** border radius */
  r: number;
  /** rank font size */
  rank: number;
  /** suit font size */
  suit: number;
  /** corner padding */
  pad: number;
}

export const CARD_DIMS: Record<CardSize, CardDims> = {
  xs: { w: 26, h: 36, r: 4, rank: 10, suit: 8, pad: 2 },
  sm: { w: 40, h: 56, r: 6, rank: 11, suit: 8, pad: 3 },
  md: { w: 64, h: 90, r: 10, rank: 15, suit: 11, pad: 5 },
  ml: { w: 80, h: 112, r: 11, rank: 19, suit: 13, pad: 7 },
  lg: { w: 96, h: 136, r: 12, rank: 24, suit: 16, pad: 9 },
  xl: { w: 120, h: 168, r: 14, rank: 30, suit: 20, pad: 11 },
};

export interface LayoutSpec {
  tier: Tier;
  /** Opponents' table cards. */
  oppCard: CardSize;
  /** Stock and pile. */
  tableCard: CardSize;
  /** Your own table slots. */
  myTableCard: CardSize;
  /** Your hand. */
  handCard: CardSize;
  /** Smallest horizontal step between fanned hand cards before scrolling. */
  minStep: number;
  /** Horizontal padding either side of the hand row. */
  rowPad: number;
  /** Cap on the hand row width so big screens don't stretch the fan. */
  maxRow: number;
  /** How far a selected card lifts. */
  lift: number;
  /** Avatar diameter in px. */
  avatar: number;
  /** Action bar button height in px. */
  barBtn: number;
  /** Render the table (stock + pile) beside your table slots instead of above. */
  sideBySide: boolean;
}

export const LAYOUT: Record<Tier, LayoutSpec> = {
  compact: {
    tier: "compact",
    oppCard: "xs",
    tableCard: "md",
    myTableCard: "md",
    handCard: "lg",
    minStep: 26,
    rowPad: 12,
    maxRow: 420,
    lift: 12,
    avatar: 28,
    barBtn: 44,
    sideBySide: false,
  },
  phone: {
    tier: "phone",
    oppCard: "xs",
    tableCard: "lg",
    myTableCard: "ml",
    handCard: "lg",
    minStep: 30,
    rowPad: 12,
    maxRow: 420,
    lift: 14,
    avatar: 32,
    barBtn: 48,
    sideBySide: false,
  },
  tablet: {
    tier: "tablet",
    oppCard: "sm",
    tableCard: "lg",
    myTableCard: "lg",
    handCard: "xl",
    minStep: 34,
    rowPad: 24,
    maxRow: 760,
    lift: 16,
    avatar: 40,
    barBtn: 56,
    sideBySide: false,
  },
  tabletWide: {
    tier: "tabletWide",
    oppCard: "sm",
    tableCard: "lg",
    myTableCard: "md",
    handCard: "lg",
    minStep: 30,
    rowPad: 24,
    maxRow: 900,
    lift: 14,
    avatar: 40,
    barBtn: 52,
    sideBySide: true,
  },
};

/**
 * - tablet: iPad portrait and tall desktop windows.
 * - tabletWide: iPad landscape (Safari leaves ~730px) and short desktop
 *   windows — same big cards, but the table and your slots share a row.
 * - compact: short phones (iPhone SE) or a phone browser with toolbars.
 */
export function computeTier(w: number, h: number): Tier {
  if (w >= 768) return h >= 900 ? "tablet" : "tabletWide";
  if (h < 700) return "compact";
  return "phone";
}

export interface Layout extends LayoutSpec {
  width: number;
  height: number;
  /** Usable width for the hand fan. */
  rowWidth: number;
}

export function layoutFor(w: number, h: number): Layout {
  const spec = LAYOUT[computeTier(w, h)];
  return {
    ...spec,
    width: w,
    height: h,
    rowWidth: Math.max(200, Math.min(w - 2 * spec.rowPad, spec.maxRow)),
  };
}

/** Horizontal step between fanned cards; clamps to [minStep, cardW]. */
export function stepFor(
  count: number,
  cardW: number,
  rowW: number,
  minStep: number,
): number {
  if (count <= 1) return cardW;
  const ideal = (rowW - cardW) / (count - 1);
  return Math.min(cardW, Math.max(minStep, ideal));
}
