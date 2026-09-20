import type { Card as CardType, Rank, Source } from "../../shared/types.ts";
import { TABLE_SIZE, cardKey, sortCards } from "../../shared/types.ts";
import type { PlayerView, StateMessage } from "../../shared/protocol.ts";
import type { Rect } from "../hooks/useZones.ts";
import type { Placement, Pose } from "../components/CardLayer.tsx";
import { CARD_SHADOW } from "../components/Card.tsx";
import { CARD_BASE_W } from "./layout.ts";

/* ── Deterministic jitter (same on every client) ────────────────────── */

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
/** Uniform in [-amp, amp], stable for (id, k). */
export function jit(id: string, k: string, amp: number): number {
  return ((Math.abs(hash(id + k)) % 1000) / 1000 - 0.5) * 2 * amp;
}

/* ── Inputs ─────────────────────────────────────────────────────────── */

export type SelectionKind = "none" | "hand" | "faceUp" | "blind" | "swapHand" | "swapFaceUp";

export interface PlacementInput {
  state: StateMessage;
  zones: Record<string, Rect>;
  bw: number;
  bh: number;
  /** Opponents in seat order (everyone but you). */
  opponents: PlayerView[];
  wildRanks: ReadonlySet<Rank>;
  legalRanks: ReadonlySet<Rank>;
  isMyTurn: boolean;
  source: Source | null;
  /** Swap phase and you haven't tapped Ready yet. */
  swapping: boolean;
  selectedKeys: ReadonlySet<string>;
  selectionKind: SelectionKind;
  selectedSlot: number | null;
  /** How many cards of the deal have been shown so far; null = all. */
  dealt: number | null;
  /** Cards held face-up at a slot for a moment after a blind flip. */
  reveals: Record<string, { zone: string; until: number }>;
  /** An opponent's failed blind flip: shown at their slot, then gone into their hand. */
  ghostReveal: { id: string; card: CardType; zone: string; exitZone: string } | null;
  /** The pile as it was just before a burn, kept in place until the burn lands. */
  burnHold: { cards: CardType[]; topCount: number } | null;
  /** Zone a newly appearing card should fly in from (default: the stock). */
  enterHints: Record<string, string>;
  now: number;
  canTapPile: boolean;
  onTapHand: (card: CardType) => void;
  onTapFaceUp: (card: CardType) => void;
  onTapBlind: (slot: number) => void;
  onTapPile: () => void;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

const HALF_W = CARD_BASE_W / 2;
const HALF_H = 53;

interface Spot {
  x: number;
  y: number;
  scale: number;
}

/** Card centre at the centre of `zone`, offset by (dx, dy), scaled to the zone width. */
function at(zone: Rect | undefined, dx = 0, dy = 0): Spot | null {
  if (!zone) return null;
  return { x: zone.x + zone.w / 2 - HALF_W + dx, y: zone.y + zone.h / 2 - HALF_H + dy, scale: zone.w / CARD_BASE_W };
}

function pose(spot: Spot, rest: Partial<Pose> & { z: number }): Pose {
  return { x: spot.x, y: spot.y, scale: spot.scale, rotate: 0, opacity: 1, faceUp: false, ...rest };
}

const MAX_STOCK_RENDERED = 16;
const MAX_OPP_HAND_RENDERED = 12;

/* ── The placement function ─────────────────────────────────────────── */

/**
 * Where every card on the board belongs right now. Pure: same inputs,
 * same output, on every client. Face-down cards have no identity, so
 * they get synthetic ids that are stable while they stay put.
 */
export function placeCards(input: PlacementInput): Placement[] {
  const { state, zones: z, bw, bh, opponents, now } = input;
  const me = state.you;
  const out: Placement[] = [];
  const hidden: Pose = { x: bw / 2 - HALF_W, y: bh + 120, rotate: 0, scale: 1, opacity: 0, faceUp: false, z: 0 };
  const stockZone = z.stock;
  const stockSpot = (i: number) => at(stockZone, -i * 0.18, -i * 0.18);

  /** Entry pose for a card that just appeared: from its hint zone, else the stock. */
  const enterFrom = (id: string): Pose | undefined => {
    const hint = input.enterHints[id];
    const spot = (hint && at(z[hint])) || stockSpot(state.stockCount);
    return spot ? pose(spot, { z: 0 }) : hidden;
  };

  // Deal staging: order is down×3, up×3, hand×3, each round-robin over players.
  const n = state.players.length;
  const myIndex = state.players.findIndex((p) => p.playerId === me.playerId);
  const dealIndex = (kind: 0 | 1 | 2, slot: number, playerIdx: number) => kind * TABLE_SIZE * n + slot * n + playerIdx;
  const undealt = (kind: 0 | 1 | 2, slot: number, playerIdx: number) =>
    input.dealt !== null && dealIndex(kind, slot, playerIdx) >= input.dealt;
  const undealtPose = (order: number): Pose | null => {
    const s = stockSpot(state.stockCount + order * 0.5);
    return s ? pose(s, { z: 0 }) : null;
  };

  /* Stock */
  const stockCount = state.stockCount;
  const firstStock = Math.max(0, stockCount - MAX_STOCK_RENDERED);
  for (let i = firstStock; i < stockCount; i++) {
    const s = stockSpot(i);
    if (!s) break;
    out.push({
      ...pose(s, { z: 1 + (i - firstStock) }),
      id: `stock-${i}`,
      zone: "stock",
      shadow: i === stockCount - 1 ? CARD_SHADOW.rest : CARD_SHADOW.flat,
      interactive: false,
      enterFrom: hidden,
    });
  }

  /* Pile (or the pre-burn pile while the burn lands) */
  const pileCards = input.burnHold ? input.burnHold.cards : state.pile;
  const topCount = input.burnHold ? input.burnHold.topCount : state.lastPlayCount;
  const pileZone = z.pile;
  const pn = pileCards.length;
  pileCards.forEach((card, i) => {
    const id = cardKey(card);
    const inTop = i >= pn - topCount;
    const gi = i - (pn - topCount);
    const dx = inTop ? (gi - (topCount - 1) / 2) * (pileZone ? pileZone.w * 0.26 : 18) : jit(id, "x", 4);
    const dy = inTop ? 0 : jit(id, "y", 3);
    const spot = at(pileZone, dx, dy);
    if (!spot) return;
    const reveal = input.reveals[id];
    const holding = reveal && reveal.until > now ? at(z[reveal.zone]) : null;
    const base: Placement = {
      ...pose(spot, { rotate: inTop ? jit(id, "r", 7) : jit(id, "r", 10), faceUp: true, z: 100 + i }),
      id,
      card,
      zone: "pile",
      wild: input.wildRanks.has(card.rank),
      shadow: inTop ? CARD_SHADOW.rest : CARD_SHADOW.flat,
      interactive: input.canTapPile && !input.burnHold,
      onTap: input.onTapPile,
      testId: inTop ? `pile-top-${id}` : `pile-card-${id}`,
      enterFrom: enterFrom(id),
    };
    if (holding) {
      // Blind flip: sit revealed on the slot for a beat before flying to the pile.
      out.push({
        ...base,
        ...pose(holding, { faceUp: true, z: 900 }),
        zone: reveal.zone,
        interactive: false,
        enterFrom: pose(holding, { z: 900 }),
      });
    } else if (input.burnHold) {
      const s = pose(spot, { z: 100 + i });
      out.push({
        ...base,
        exit: { ...s, y: s.y - 260, scale: s.scale * 0.4, rotate: jit(id, "r", 60) + 40, opacity: 0, faceUp: true, z: 1200 },
      });
    } else {
      out.push(base);
    }
  });

  /* Me */
  const mySlotSpot = (i: number, dy: number) => at(z[`mslot-${i}`], 0, dy);
  me.faceDownSlots.forEach((present, i) => {
    if (!present) return;
    const selected = input.selectionKind === "blind" && input.selectedSlot === i;
    const interactive = input.isMyTurn && input.source === "blind";
    const spot = mySlotSpot(i, selected ? -3 : 7);
    if (!spot) return;
    const stagedPose = undealt(0, i, myIndex) ? undealtPose(dealIndex(0, i, myIndex)) : null;
    out.push({
      ...(stagedPose ?? pose(spot, { z: 150 + i })),
      id: `blind-me-${i}`,
      zone: stagedPose ? "stock" : `mslot-${i}`,
      shadow: selected ? CARD_SHADOW.selected : interactive ? CARD_SHADOW.blind : CARD_SHADOW.rest,
      interactive,
      onTap: () => input.onTapBlind(i),
      testId: `blind-slot-${i}`,
      data: { selected: selected ? "true" : undefined },
      enterFrom: enterFrom(`blind-me-${i}`),
    });
  });

  const swapTargetsFaceUp = input.swapping && input.selectionKind === "swapHand";
  const swapTargetsHand = input.swapping && input.selectionKind === "swapFaceUp";

  me.faceUp.forEach((card, i) => {
    const id = cardKey(card);
    const selected = input.selectedKeys.has(id);
    const interactive = input.swapping || (input.isMyTurn && input.source === "faceUp");
    const legal = input.legalRanks.has(card.rank);
    const playing = input.isMyTurn && input.source === "faceUp";
    const spot = mySlotSpot(i, selected ? -10 : 0);
    if (!spot) return;
    const stagedPose = undealt(1, i, myIndex) ? undealtPose(dealIndex(1, i, myIndex)) : null;
    const reveal = input.reveals[id];
    const holding = reveal && reveal.until > now ? at(z[reveal.zone]) : null;
    out.push({
      ...(stagedPose ?? (holding ? pose(holding, { faceUp: true, z: 900 }) : pose(spot, { faceUp: true, z: 160 + i }))),
      id,
      card,
      zone: stagedPose ? "stock" : holding ? reveal.zone : `mslot-${i}`,
      wild: input.wildRanks.has(card.rank),
      shadow: selected
        ? input.swapping
          ? CARD_SHADOW.swapSelected
          : CARD_SHADOW.selected
        : swapTargetsFaceUp
          ? CARD_SHADOW.swapTarget
          : playing && legal
            ? CARD_SHADOW.playable
            : CARD_SHADOW.rest,
      opacity: playing && !legal ? 0.5 : 1,
      interactive,
      onTap: () => input.onTapFaceUp(card),
      testId: `faceup-card-${id}`,
      data: {
        selected: selected ? "true" : undefined,
        target: swapTargetsFaceUp && !selected ? "true" : undefined,
      },
      enterFrom: enterFrom(id),
    });
  });

  const hand = sortCards(me.hand);
  const H = z.hand;
  const Cz = z.handcard;
  if (H && Cz) {
    const m = hand.length;
    // Big hands shrink a little (12 → 20 cards: ×0.82) so the fan still
    // fits without the rank corners disappearing.
    const shrink = m > 12 ? (12 / m) ** 0.4 : 1;
    const Wc = Cz.w * shrink;
    const Hc = Cz.h * shrink;
    const sc = Wc / CARD_BASE_W;
    const rotStep = Math.min(4.5, 34 / Math.max(m, 1), m > 12 ? 16 / m : 4.5);
    const arcK = Math.min(2.4, 18 / Math.max(m, 1), 12 / Math.max(1, ((m - 1) / 2) ** 2));
    // Rotated end cards stick out past their slot; keep that overhang
    // inside the track so nothing leaves the screen.
    const thetaMax = (((m - 1) / 2) * rotStep * Math.PI) / 180;
    const overhang = Math.max(0, (Hc * Math.sin(thetaMax) + Wc * (Math.cos(thetaMax) - 1)) / 2);
    const avail = H.w - 4 - 2 * overhang;
    const step = m > 1 ? Math.min(Wc * 0.82, (avail - Wc) / (m - 1)) : 0;
    const total = Wc + (m - 1) * step;
    const x0 = H.x + (H.w - total) / 2 + Wc / 2;
    const cy = H.y + H.h - Cz.h / 2 - 12;
    const playing = input.isMyTurn && input.source === "hand";
    const interactive = input.swapping || playing;
    hand.forEach((card, i) => {
      const id = cardKey(card);
      const t = i - (m - 1) / 2;
      const selected = input.selectedKeys.has(id);
      const legal = input.legalRanks.has(card.rank);
      const stagedPose = undealt(2, i, myIndex) ? undealtPose(dealIndex(2, Math.min(i, 2), myIndex)) : null;
      const reveal = input.reveals[id];
      const holding = reveal && reveal.until > now ? at(z[reveal.zone]) : null;
      const fan: Pose = {
        x: x0 + i * step - HALF_W,
        y: cy - HALF_H + t * t * arcK - (selected ? Wc * 0.3 : 0),
        rotate: t * rotStep,
        scale: sc * (selected ? 1.05 : 1),
        opacity: playing && !legal ? 0.5 : 1,
        faceUp: true,
        z: 300 + i,
      };
      out.push({
        ...(stagedPose ?? (holding ? pose(holding, { faceUp: true, z: 900 }) : fan)),
        id,
        card,
        zone: stagedPose ? "stock" : holding ? reveal.zone : "hand",
        wild: input.wildRanks.has(card.rank),
        shadow: selected
          ? input.swapping
            ? CARD_SHADOW.swapSelected
            : CARD_SHADOW.selected
          : swapTargetsHand
            ? CARD_SHADOW.swapTarget
            : playing && legal
              ? CARD_SHADOW.playable
              : CARD_SHADOW.rest,
        interactive,
        onTap: () => input.onTapHand(card),
        testId: `hand-card-${id}`,
        data: {
          selected: selected ? "true" : undefined,
          target: swapTargetsHand && !selected ? "true" : undefined,
        },
        enterFrom: enterFrom(id),
      });
    });
  }

  /* Opponents */
  opponents.forEach((p) => {
    const pid = p.playerId;
    const pIdx = state.players.findIndex((q) => q.playerId === pid);
    p.faceDownSlots.forEach((present, i) => {
      if (!present) return;
      const spot = at(z[`oslot-${pid}-${i}`], 0, 4);
      if (!spot) return;
      const stagedPose = undealt(0, i, pIdx) ? undealtPose(dealIndex(0, i, pIdx)) : null;
      out.push({
        ...(stagedPose ?? pose(spot, { z: 50 + i })),
        id: `blind-${pid}-${i}`,
        zone: stagedPose ? "stock" : `oslot-${pid}-${i}`,
        shadow: CARD_SHADOW.flat,
        interactive: false,
        enterFrom: enterFrom(`blind-${pid}-${i}`),
      });
    });
    p.faceUp.forEach((card, i) => {
      const id = cardKey(card);
      const spot = at(z[`oslot-${pid}-${i}`]);
      if (!spot) return;
      const stagedPose = undealt(1, i, pIdx) ? undealtPose(dealIndex(1, i, pIdx)) : null;
      out.push({
        ...(stagedPose ?? pose(spot, { faceUp: true, z: 60 + i })),
        id,
        card,
        zone: stagedPose ? "stock" : `oslot-${pid}-${i}`,
        wild: input.wildRanks.has(card.rank),
        shadow: CARD_SHADOW.flat,
        interactive: false,
        testId: `opp-faceup-${p.name}-${id}`,
        enterFrom: enterFrom(id),
      });
    });
    const shown = Math.min(p.handCount, MAX_OPP_HAND_RENDERED);
    for (let i = 0; i < shown; i++) {
      const k = Math.min(i, 8);
      const spot = at(z[`ohand-${pid}`], k * 1.4, -k * 0.6);
      if (!spot) break;
      const stagedPose = i < TABLE_SIZE && undealt(2, i, pIdx) ? undealtPose(dealIndex(2, i, pIdx)) : null;
      out.push({
        ...(stagedPose ?? pose(spot, { rotate: ((i % 3) - 1) * 3, z: 40 + i })),
        id: `ohand-${pid}-${i}`,
        zone: stagedPose ? "stock" : `ohand-${pid}`,
        shadow: CARD_SHADOW.flat,
        interactive: false,
        enterFrom: enterFrom(`ohand-${pid}-${i}`),
      });
    }
  });

  /* An opponent's failed flip: revealed at the slot, then swallowed by their hand. */
  if (input.ghostReveal) {
    const g = input.ghostReveal;
    const spot = at(z[g.zone]);
    const exitSpot = at(z[g.exitZone]);
    if (spot) {
      out.push({
        ...pose(spot, { faceUp: true, z: 900 }),
        id: g.id,
        card: g.card,
        zone: g.zone,
        wild: input.wildRanks.has(g.card.rank),
        shadow: CARD_SHADOW.rest,
        interactive: false,
        enterFrom: pose(spot, { z: 900 }),
        exit: exitSpot ? pose(exitSpot, { opacity: 0, z: 900 }) : { ...hidden, z: 900 },
      });
    }
  }

  // One deck means unique ids — except under the test hook, which can hand
  // two players the same card. Suffix later duplicates so React keys and
  // flights stay well-defined.
  const seen = new Map<string, number>();
  for (const p of out) {
    const n = (seen.get(p.id) ?? 0) + 1;
    seen.set(p.id, n);
    if (n > 1) p.id = `${p.id}#${n}`;
  }
  return out;
}
