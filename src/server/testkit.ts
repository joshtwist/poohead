/*
 * Deterministic helpers for the engine unit tests. Not shipped: only
 * imported from *.test.ts files.
 */
import type { Card, PlayerIcon, Rank, Suit } from "../shared/types.ts";
import { PLAYER_ICONS, cardKey } from "../shared/types.ts";
import type { Play, RuleSetId } from "../shared/rules.ts";
import { flattenPile } from "../shared/rules.ts";
import type { EngineDeps, GameState, Player, Table } from "./game-engine.ts";
import { createGame, hasCards } from "./game-engine.ts";

const SUIT_BY_LETTER: Record<string, Suit> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

/** `c("Ks")` → King of spades, `c("10h")` → ten of hearts. */
export function c(code: string): Card {
  const suit = SUIT_BY_LETTER[code[code.length - 1]];
  const rank = code.slice(0, -1) as Rank;
  if (!suit || !rank) throw new Error(`Bad card code: ${code}`);
  return { suit, rank };
}

/** `cs("Ks 3c 10h")` → three cards. */
export function cs(codes: string): Card[] {
  return codes
    .split(/\s+/)
    .filter(Boolean)
    .map(c);
}

/** Player ids p1..p5 with fixed icons. */
export const P = ["p1", "p2", "p3", "p4", "p5"] as const;

export const identityShuffle = (cards: Card[]) => [...cards];
export const pick0 = () => 0;
/** Deterministic deps: no shuffling, ties resolve to the first candidate. */
export const fixedDeps: EngineDeps = { shuffle: identityShuffle, randomIndex: pick0 };

export interface MakeStateOpts {
  players?: number | string[];
  rules?: RuleSetId;
  phase?: GameState["phase"];
  /** Per player id, e.g. { p1: "Ks 3c" } */
  hands?: Record<string, string>;
  faceUp?: Record<string, string>;
  /** Per player id; "-" marks a flipped (null) slot, e.g. "Ks - 4d" */
  faceDown?: Record<string, string>;
  stock?: string;
  /** Plays bottom → top, e.g. ["3h", "9s 9d"] */
  pile?: string[];
  current?: string;
  ready?: string[];
  finishedOrder?: string[];
  burnedCount?: number;
  creator?: string;
}

/**
 * Build an arbitrary mid-game state without dealing. Defaults: 2 players,
 * millybims, playing phase, p1 to move, everyone holding one dummy card so
 * nobody is accidentally "out" — override what the test cares about.
 */
export function makeState(opts: MakeStateOpts = {}): GameState {
  const ids =
    typeof opts.players === "number"
      ? [...P].slice(0, opts.players)
      : opts.players ?? ["p1", "p2"];
  const players: Player[] = ids.map((id, i) => ({
    playerId: id,
    name: id.toUpperCase(),
    icon: PLAYER_ICONS[i] as PlayerIcon,
    connected: true,
  }));

  const hands: Record<string, Card[]> = {};
  const tables: Record<string, Table> = {};
  const ready: Record<string, boolean> = {};
  for (const id of ids) {
    const hand = opts.hands?.[id];
    hands[id] = hand !== undefined ? cs(hand) : [];
    const fu = opts.faceUp?.[id];
    const fd = opts.faceDown?.[id];
    tables[id] = {
      faceUp: fu !== undefined ? cs(fu) : [],
      faceDown:
        fd !== undefined
          ? fd
              .split(/\s+/)
              .filter(Boolean)
              .map((code) => (code === "-" ? null : c(code)))
          : [null, null, null],
    };
    ready[id] = opts.ready ? opts.ready.includes(id) : false;
  }

  const pile: Play[] = (opts.pile ?? []).map((codes) => {
    const cards = cs(codes);
    return { rank: cards[0].rank, cards };
  });

  const state: GameState = {
    ...createGame("test01"),
    phase: opts.phase ?? "playing",
    rules: opts.rules ?? "millybims",
    players,
    creatorId: opts.creator ?? ids[0],
    stock: opts.stock ? cs(opts.stock) : [],
    hands,
    tables,
    pile,
    burnedCount: opts.burnedCount ?? 0,
    ready,
    currentPlayerIndex: opts.current ? ids.indexOf(opts.current) : 0,
    finishedOrder: opts.finishedOrder ?? [],
  };

  // Anyone the test didn't give cards to (and who isn't listed as out)
  // gets a dummy card so they count as still in the game.
  if (state.phase === "playing") {
    for (const id of ids) {
      if (!hasCards(state, id) && !state.finishedOrder.includes(id)) {
        state.hands[id] = [c("Qc")];
      }
    }
  }
  return state;
}

export function currentPlayer(state: GameState): string {
  return state.players[state.currentPlayerIndex].playerId;
}

export function pileCards(state: GameState): Card[] {
  return flattenPile(state.pile);
}

export function keys(cards: Card[]): string[] {
  return cards.map(cardKey).sort();
}

/**
 * Structural invariants that must hold after every reducer. Card
 * conservation is checked only for states built by dealing (a test
 * fixture can deliberately hold fewer than 52 cards).
 */
export function assertInvariants(state: GameState, opts: { fullDeck?: boolean } = {}): void {
  const all: Card[] = [...state.stock, ...flattenPile(state.pile)];
  for (const id of Object.keys(state.hands)) all.push(...state.hands[id]);
  for (const id of Object.keys(state.tables)) {
    const t = state.tables[id];
    all.push(...t.faceUp);
    all.push(...t.faceDown.filter((x): x is Card => x !== null));
    if (t.faceDown.length !== 3) throw new Error(`faceDown of ${id} must have 3 slots`);
  }
  const seen = new Set<string>();
  for (const card of all) {
    const k = cardKey(card);
    if (seen.has(k)) throw new Error(`Duplicate card in state: ${k}`);
    seen.add(k);
  }
  if (opts.fullDeck && all.length + state.burnedCount !== 52) {
    throw new Error(`Card count off: ${all.length} in play + ${state.burnedCount} burned`);
  }
  for (const play of state.pile) {
    if (play.cards.length === 0) throw new Error("Empty play on pile");
    if (play.cards.some((x) => x.rank !== play.rank)) throw new Error("Mixed-rank play");
  }
  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= state.players.length) {
    throw new Error("currentPlayerIndex out of range");
  }
  if (state.phase === "playing" || state.phase === "complete") {
    for (const p of state.players) {
      const out = state.finishedOrder.includes(p.playerId);
      if (out && hasCards(state, p.playerId)) throw new Error(`${p.playerId} is out but holds cards`);
      if (!out && !hasCards(state, p.playerId)) throw new Error(`${p.playerId} holds nothing but isn't out`);
      if (
        state.phase === "playing" &&
        state.stock.length > 0 &&
        state.hands[p.playerId]?.length === 0 &&
        !out
      ) {
        throw new Error(`${p.playerId} has an empty hand while the stock has cards`);
      }
    }
  }
}
