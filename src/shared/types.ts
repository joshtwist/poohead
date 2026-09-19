export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

export const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

/**
 * lobby     — players joining
 * dealing   — cards dealt, deal animation running (server alarm ends it)
 * swapping  — players may swap hand cards with their face-up cards, then Ready
 * playing   — the game proper
 * complete  — one player left holding cards: the 💩head
 */
export type GamePhase = "lobby" | "dealing" | "swapping" | "playing" | "complete";

/** Where the current player's next play must come from. */
export type Source = "hand" | "faceUp" | "blind";

export const PLAYER_ICONS = [
  "cat",
  "dog",
  "bird",
  "fish",
  "rabbit",
  "snail",
  "bug",
  "flame",
  "zap",
  "star",
  "moon",
  "sun",
  "heart",
  "skull",
  "ghost",
  "rocket",
  "crown",
  "gem",
  "anchor",
  "gamepad-2",
] as const;

export type PlayerIcon = (typeof PLAYER_ICONS)[number];

/** One 52-card deck: 5 players × 9 cards = 45, leaving a 7-card stock. */
export const MAX_PLAYERS = 5;
export const MIN_PLAYERS = 2;

/** Cards held in hand (drawn back up to this while the stock lasts). */
export const HAND_SIZE = 3;
/** Face-down cards per player, and face-up cards dealt on top of them. */
export const TABLE_SIZE = 3;

/**
 * Display order for a hand: natural 2…A. Purely cosmetic — play
 * legality uses RANK_POWER in rules.ts, where 2 and 10 are wild.
 */
export const SORT_ORDER: Record<Rank, number> = {
  "2": 2,
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

const SUIT_ORDER: Record<Suit, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
};

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function cardKey(c: Card): string {
  return `${c.suit}-${c.rank}`;
}

/** Sort by natural rank, then bridge suit order. Returns a new array. */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const rankDiff = SORT_ORDER[a.rank] - SORT_ORDER[b.rank];
    if (rankDiff !== 0) return rankDiff;
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}
