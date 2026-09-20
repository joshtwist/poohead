/*
 * Responsive layout tiers. Most sizing on the board is done with container
 * query units (cqw) in CSS, mirroring the design prototype; the JS tier is
 * still the single source of truth for the few structural decisions
 * (side-by-side table on short wide screens) and for the Tailwind
 * `compact:` / `tablet:` variants keyed off `data-tier`.
 */

export type Tier = "compact" | "phone" | "tablet" | "tabletWide";

/** Base card geometry the artwork is designed at; everything scales from it. */
export const CARD_BASE_W = 76;
export const CARD_BASE_H = 106;
export const CARD_RATIO = CARD_BASE_H / CARD_BASE_W;

export type CardSize = "xs" | "sm" | "md" | "ml" | "lg" | "xl";

/** Widths for the static `Card` component sizes (height follows the ratio). */
export const CARD_WIDTHS: Record<CardSize, number> = {
  xs: 26,
  sm: 40,
  md: 64,
  ml: 80,
  lg: 96,
  xl: 120,
};

/**
 * - tablet: iPad portrait and tall desktop windows.
 * - tabletWide: iPad landscape (Safari leaves ~730px) and short desktop
 *   windows — the table centre and your slots share a row.
 * - compact: short phones (iPhone SE) or a phone browser with toolbars.
 */
export function computeTier(w: number, h: number): Tier {
  if (w >= 768) return h >= 900 ? "tablet" : "tabletWide";
  if (h < 700) return "compact";
  return "phone";
}

export interface Layout {
  tier: Tier;
  width: number;
  height: number;
  /** Render the table (stock + pile) beside your table slots instead of above. */
  sideBySide: boolean;
}

export function layoutFor(w: number, h: number): Layout {
  const tier = computeTier(w, h);
  return { tier, width: w, height: h, sideBySide: tier === "tabletWide" };
}
