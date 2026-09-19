import type { Card, Rank } from "./types.ts";

/*
 * Pure rules for 💩head. Shared by the server (to validate plays and
 * compute the requirement) and the client (to highlight playable cards
 * and label wild ones). Nothing in here touches randomness or state.
 */

// ── Rule sets ──────────────────────────────────────────────────────

export type RuleSetId = "standard" | "ukpub" | "millybims";

/**
 * How a 7 constrains the next player:
 * - none: a 7 is an ordinary card (next plays 7 or higher).
 * - sevenOrLower: next player must play 7 or lower.
 * - lowerThanPrevious: next player must play equal or lower than the
 *   card the 7 was played ON (7 on an empty pile → 7 or lower; 7 on a
 *   2 → anything).
 */
export type SevenRule = "none" | "sevenOrLower" | "lowerThanPrevious";

export interface RuleSet {
  id: RuleSetId;
  name: string;
  /** One-liner for the lobby card. */
  blurb: string;
  /** Bullet points shown in the lobby's rules disclosure. */
  details: string[];
  seven: SevenRule;
  /** Millybims: the 7 itself can be played on anything. */
  sevenWild: boolean;
  /** Wild AND transparent: the next player faces whatever lies beneath. */
  invisible: Rank[];
  /** Each card of this rank played skips one player. */
  skip: Rank[];
}

const ALWAYS_ON = [
  "2 can be played on anything and resets the pile",
  "10 can be played on anything and burns the pile — you go again",
  "Four of a kind on top of the pile burns it — you go again",
  "Can't (or won't) play? Pick up the whole pile",
  "Last player holding cards is the 💩head",
];

export const RULE_SETS: Record<RuleSetId, RuleSet> = {
  standard: {
    id: "standard",
    name: "Standard",
    blurb: "Just 2s, 10s and four of a kind. Clean and simple.",
    details: ALWAYS_ON,
    seven: "none",
    sevenWild: false,
    invisible: [],
    skip: [],
  },
  ukpub: {
    id: "ukpub",
    name: "UK pub",
    blurb: "3s are invisible, 7s send it lower, 8s skip a player.",
    details: [
      "3 is invisible: play it on anything, the next player beats the card beneath",
      "7: the next player must play 7 or lower",
      "8: skips the next player (two 8s skip two)",
      ...ALWAYS_ON,
    ],
    seven: "sevenOrLower",
    sevenWild: false,
    invisible: ["3"],
    skip: ["8"],
  },
  millybims: {
    id: "millybims",
    name: "Millybims",
    blurb: "House rules: wild 7s that send it lower, invisible 8s.",
    details: [
      "7 can be played on anything; the next player must play equal or lower than the card the 7 landed on (7 on an empty pile → 7 or lower, 7 on a 2 → anything)",
      "8 is invisible: play it on anything, the next player faces exactly what you faced",
      ...ALWAYS_ON,
    ],
    seven: "lowerThanPrevious",
    sevenWild: true,
    invisible: ["8"],
    skip: [],
  },
};

export const RULE_SET_IDS: RuleSetId[] = ["millybims", "ukpub", "standard"];
export const DEFAULT_RULES: RuleSetId = "millybims";

export function isRuleSetId(x: unknown): x is RuleSetId {
  return typeof x === "string" && x in RULE_SETS;
}

// ── Rank power ─────────────────────────────────────────────────────

/**
 * Comparison power. 2 and 10 are wild and never compared, but 2 sits
 * at the bottom so "equal or lower than a 2" naturally means anything.
 */
export const RANK_POWER: Record<Rank, number> = {
  "2": 0,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/** Ranks checked (lowest first) when choosing who starts. */
export const RANK_SCAN_ORDER: Rank[] = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "J",
  "Q",
  "K",
  "A",
];

export function isInvisible(rank: Rank, rules: RuleSet): boolean {
  return rules.invisible.includes(rank);
}

export function isSkip(rank: Rank, rules: RuleSet): boolean {
  return rules.skip.includes(rank);
}

/** Wild ranks can be played on anything, ignoring the requirement. */
export function isWild(rank: Rank, rules: RuleSet): boolean {
  return (
    rank === "2" ||
    rank === "10" ||
    isInvisible(rank, rules) ||
    (rank === "7" && rules.sevenWild)
  );
}

// ── The pile ───────────────────────────────────────────────────────

/** A group of same-rank cards played together in one turn. */
export interface Play {
  rank: Rank;
  cards: Card[];
}

export type Requirement =
  | { kind: "any" }
  | { kind: "min"; rank: Rank }
  | { kind: "max"; rank: Rank };

/**
 * Index of the topmost play at or below `from` that is not transparent,
 * or -1 if there is none.
 */
function topVisiblePlay(plays: Play[], rules: RuleSet, from: number): number {
  let i = from;
  while (i >= 0 && isInvisible(plays[i].rank, rules)) i--;
  return i;
}

/**
 * What the next player has to beat, given the pile as a list of plays
 * (bottom → top). Pure function of the pile + rules — nothing is stored.
 */
export function requirementAt(
  plays: Play[],
  rules: RuleSet,
  idx: number = plays.length - 1,
): Requirement {
  const i = topVisiblePlay(plays, rules, idx);
  if (i < 0) return { kind: "any" };

  const rank = plays[i].rank;
  if (rank === "2") return { kind: "any" };

  if (rank === "7") {
    if (rules.seven === "sevenOrLower") return { kind: "max", rank: "7" };
    if (rules.seven === "lowerThanPrevious") {
      const below = topVisiblePlay(plays, rules, i - 1);
      if (below < 0) return { kind: "max", rank: "7" };
      const beneath = plays[below].rank;
      if (beneath === "2") return { kind: "any" };
      return { kind: "max", rank: beneath };
    }
  }

  return { kind: "min", rank };
}

export function canPlayRank(
  rank: Rank,
  req: Requirement,
  rules: RuleSet,
): boolean {
  if (isWild(rank, rules)) return true;
  switch (req.kind) {
    case "any":
      return true;
    case "min":
      return RANK_POWER[rank] >= RANK_POWER[req.rank];
    case "max":
      return RANK_POWER[rank] <= RANK_POWER[req.rank];
  }
}

export function formatRank(rank: Rank): string {
  switch (rank) {
    case "A":
      return "Ace";
    case "K":
      return "King";
    case "Q":
      return "Queen";
    case "J":
      return "Jack";
    default:
      return rank;
  }
}

/** Short label for the requirement chip. */
export function formatRequirement(req: Requirement): string {
  switch (req.kind) {
    case "any":
      return "Anything goes";
    case "min":
      return `Play ${formatRank(req.rank)} or higher`;
    case "max":
      return `Play ${formatRank(req.rank)} or lower`;
  }
}

export function flattenPile(plays: Play[]): Card[] {
  const out: Card[] = [];
  for (const p of plays) out.push(...p.cards);
  return out;
}

/** True when the top four cards of the pile (across plays) share a rank. */
export function hasFourOfAKindOnTop(plays: Play[]): boolean {
  const cards = flattenPile(plays);
  if (cards.length < 4) return false;
  const top = cards[cards.length - 1].rank;
  for (let i = cards.length - 4; i < cards.length; i++) {
    if (cards[i].rank !== top) return false;
  }
  return true;
}

/** Ranks that would be legal to play right now. */
export function playableRanks(req: Requirement, rules: RuleSet, ranks: Rank[]): Rank[] {
  return ranks.filter((r) => canPlayRank(r, req, rules));
}
