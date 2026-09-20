import type { Card, GamePhase, PlayerIcon, Rank, Source } from "../shared/types.ts";
import {
  HAND_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TABLE_SIZE,
  cardKey,
  cardsEqual,
} from "../shared/types.ts";
import type { Play, RuleSet, RuleSetId } from "../shared/rules.ts";
import {
  DEFAULT_RULES,
  RANK_SCAN_ORDER,
  RULE_SETS,
  canPlayRank,
  flattenPile,
  formatRank,
  formatRequirement,
  hasFourOfAKindOnTop,
  isRuleSetId,
  isSkip,
  isWild,
  requirementAt,
} from "../shared/rules.ts";
import type {
  FinalCards,
  GameEvent,
  PlayerView,
  SelfView,
  StandingEntry,
  StateMessage,
  TestForceMessage,
} from "../shared/protocol.ts";
import { createDeck, deal, shuffle } from "./deck.ts";

// ── State types ────────────────────────────────────────────────────

export interface Player {
  playerId: string;
  name: string;
  icon: PlayerIcon;
  connected: boolean;
}

export interface RematchInfo {
  gameId: string;
  creatorId: string;
  creatorName: string;
}

/**
 * A player's cards on the table. `faceDown` has TABLE_SIZE stable slots;
 * a flipped slot becomes null so the UI never has to re-index. Face-up
 * cards are a plain list (they can be played in any order / several at
 * once) that visually sits on top of the slots.
 */
export interface Table {
  faceUp: Card[];
  faceDown: (Card | null)[];
}

export interface GameState {
  gameId: string;
  phase: GamePhase;
  rules: RuleSetId;
  players: Player[];
  creatorId: string;
  stock: Card[];
  hands: Record<string, Card[]>;
  tables: Record<string, Table>;
  /** Bottom → top. Stored as plays so the Millybims 7 can look beneath a play. */
  pile: Play[];
  /** Cards removed from the game by burns. */
  burnedCount: number;
  /** Swapping phase: who has finished swapping. */
  ready: Record<string, boolean>;
  currentPlayerIndex: number;
  /** Players who have gone out, first to last. The 💩head is whoever is missing. */
  finishedOrder: string[];
  eventSeq: number;
  lastEvent: GameEvent | null;
  /**
   * Set after the game completes when someone opens a rematch. Other
   * players see this and can hop into the new game at their leisure.
   */
  rematch: RematchInfo | null;
}

/**
 * Injectable randomness so tests can be deterministic. Production uses
 * the crypto-backed defaults.
 */
export interface EngineDeps {
  shuffle: (cards: Card[]) => Card[];
  randomIndex: (n: number) => number;
}

export function cryptoRandomIndex(n: number): number {
  if (n <= 1) return 0;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

export const defaultDeps: EngineDeps = {
  shuffle,
  randomIndex: cryptoRandomIndex,
};

// ── Helpers ────────────────────────────────────────────────────────

function getPlayerIndex(state: GameState, playerId: string): number {
  return state.players.findIndex((p) => p.playerId === playerId);
}

function assertPlayer(state: GameState, playerId: string): void {
  if (getPlayerIndex(state, playerId) === -1) {
    throw new Error("You are not in this game");
  }
}

function assertTurn(state: GameState, playerId: string): void {
  if (state.phase !== "playing") {
    throw new Error("The game is not in progress");
  }
  assertPlayer(state, playerId);
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.playerId !== playerId) {
    throw new Error("It is not your turn");
  }
}

export function rulesOf(state: GameState): RuleSet {
  return RULE_SETS[state.rules];
}

function emptyTable(): Table {
  return { faceUp: [], faceDown: [] };
}

export function tableOf(state: GameState, playerId: string): Table {
  return state.tables[playerId] ?? emptyTable();
}

export function handOf(state: GameState, playerId: string): Card[] {
  return state.hands[playerId] ?? [];
}

function faceDownCards(table: Table): Card[] {
  return table.faceDown.filter((c): c is Card => c !== null);
}

/** Does this player still hold any card anywhere? */
export function hasCards(state: GameState, playerId: string): boolean {
  const table = tableOf(state, playerId);
  return (
    handOf(state, playerId).length > 0 ||
    table.faceUp.length > 0 ||
    faceDownCards(table).length > 0
  );
}

/** Where the player's next play must come from. */
export function sourceFor(state: GameState, playerId: string): Source {
  if (handOf(state, playerId).length > 0) return "hand";
  if (tableOf(state, playerId).faceUp.length > 0) return "faceUp";
  return "blind";
}

function removeCards(zone: Card[], cards: Card[]): Card[] {
  const remaining = [...zone];
  for (const card of cards) {
    const idx = remaining.findIndex((c) => cardsEqual(c, card));
    if (idx === -1) throw new Error("Card not found in zone");
    remaining.splice(idx, 1);
  }
  return remaining;
}

/** Omit that distributes over a union (plain Omit collapses GameEvent to its common keys). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type EventInput = DistributiveOmit<GameEvent, "seq">;

function withEvent(state: GameState, event: EventInput): GameState {
  const seq = state.eventSeq + 1;
  return {
    ...state,
    eventSeq: seq,
    lastEvent: { ...event, seq } as GameEvent,
  };
}

// ── Lobby (unchanged from Rummy) ───────────────────────────────────

/** Create a fresh game in lobby phase. No creator yet -- they join like everyone else. */
export function createGame(gameId: string): GameState {
  return {
    gameId,
    phase: "lobby",
    rules: DEFAULT_RULES,
    players: [],
    creatorId: "",
    stock: [],
    hands: {},
    tables: {},
    pile: [],
    burnedCount: 0,
    ready: {},
    currentPlayerIndex: 0,
    finishedOrder: [],
    eventSeq: 0,
    lastEvent: null,
    rematch: null,
  };
}

/** Add a player to the lobby. The first player to join becomes the creator. */
export function addPlayer(
  state: GameState,
  playerId: string,
  name: string,
  icon: PlayerIcon,
): GameState {
  if (state.phase !== "lobby") {
    throw new Error("Cannot join: the game has already started");
  }
  if (state.players.length >= MAX_PLAYERS) {
    throw new Error(`Cannot join: the game is full (max ${MAX_PLAYERS} players)`);
  }
  if (state.players.some((p) => p.playerId === playerId)) {
    throw new Error("You have already joined this game");
  }

  const newPlayers = [
    ...state.players,
    { playerId, name, icon, connected: true },
  ];
  const creatorId = state.creatorId || playerId;

  return { ...state, players: newPlayers, creatorId };
}

/** Remove a player from the lobby. Only allowed before the game starts. */
export function removePlayer(state: GameState, playerId: string): GameState {
  if (state.phase !== "lobby") {
    throw new Error("Cannot leave: the game has already started");
  }
  assertPlayer(state, playerId);

  const newPlayers = state.players.filter((p) => p.playerId !== playerId);

  let { creatorId } = state;
  if (creatorId === playerId) {
    creatorId = newPlayers.length > 0 ? newPlayers[0].playerId : "";
  }

  return { ...state, players: newPlayers, creatorId };
}

/** Mark a player as connected or disconnected. */
export function setPlayerConnected(
  state: GameState,
  playerId: string,
  connected: boolean,
): GameState {
  const newPlayers = state.players.map((p) =>
    p.playerId === playerId ? { ...p, connected } : p,
  );
  return { ...state, players: newPlayers };
}

/**
 * Attach a rematch pointer to a completed game. First caller wins.
 */
export function createRematch(
  state: GameState,
  playerId: string,
  newGameId: string,
): GameState {
  if (state.phase !== "complete") {
    throw new Error("Can only create a rematch after the game ends");
  }
  if (state.rematch) {
    throw new Error("A rematch has already been created for this game");
  }
  const player = state.players.find((p) => p.playerId === playerId);
  if (!player) {
    throw new Error("You are not in this game");
  }
  return {
    ...state,
    rematch: {
      gameId: newGameId,
      creatorId: playerId,
      creatorName: player.name,
    },
  };
}

// ── Deal → swap → start ────────────────────────────────────────────

/**
 * Start the game. Host only. Deals 3 face-down, 3 face-up, 3 hand cards
 * to every player and moves to "dealing" (the DO's alarm ends the deal
 * animation and moves on to "swapping").
 */
export function startGame(
  state: GameState,
  playerId: string,
  rules: RuleSetId,
  deps: EngineDeps = defaultDeps,
): GameState {
  if (state.phase !== "lobby") {
    throw new Error("Game has already started");
  }
  if (state.creatorId !== playerId) {
    throw new Error("Only the host can start the game");
  }
  if (state.players.length < MIN_PLAYERS) {
    throw new Error(`Need at least ${MIN_PLAYERS} players to start`);
  }
  if (!isRuleSetId(rules)) {
    throw new Error("Unknown rule set");
  }

  const playerIds = state.players.map((p) => p.playerId);
  const deck = deps.shuffle(createDeck());
  const blind = deal(deck, playerIds, TABLE_SIZE);
  const faceUp = deal(blind.remaining, playerIds, TABLE_SIZE);
  const hands = deal(faceUp.remaining, playerIds, HAND_SIZE);

  const tables: Record<string, Table> = {};
  const ready: Record<string, boolean> = {};
  for (const id of playerIds) {
    tables[id] = { faceUp: faceUp.hands[id], faceDown: blind.hands[id] };
    ready[id] = false;
  }

  return {
    ...state,
    phase: "dealing",
    rules,
    stock: hands.remaining,
    hands: hands.hands,
    tables,
    pile: [],
    burnedCount: 0,
    ready,
    currentPlayerIndex: 0,
    finishedOrder: [],
    eventSeq: 0,
    lastEvent: null,
  };
}

/** dealing → swapping. Called by the DO alarm after the deal animation. */
export function finishDealing(state: GameState): GameState {
  if (state.phase !== "dealing") {
    throw new Error("Game is not in the dealing phase");
  }
  return { ...state, phase: "swapping" };
}

/** Swapping phase: trade one hand card for one of your own face-up cards. */
export function swapCards(
  state: GameState,
  playerId: string,
  handCard: Card,
  faceUpCard: Card,
): GameState {
  if (state.phase !== "swapping") {
    throw new Error("You can only swap cards before play starts");
  }
  assertPlayer(state, playerId);
  if (state.ready[playerId]) {
    throw new Error("You've already marked yourself ready");
  }

  const hand = handOf(state, playerId);
  const table = tableOf(state, playerId);
  const hi = hand.findIndex((c) => cardsEqual(c, handCard));
  const fi = table.faceUp.findIndex((c) => cardsEqual(c, faceUpCard));
  if (hi === -1) throw new Error("That card is not in your hand");
  if (fi === -1) throw new Error("That card is not one of your face-up cards");

  const newHand = [...hand];
  const newFaceUp = [...table.faceUp];
  newHand[hi] = faceUpCard;
  newFaceUp[fi] = handCard;

  return {
    ...state,
    hands: { ...state.hands, [playerId]: newHand },
    tables: { ...state.tables, [playerId]: { ...table, faceUp: newFaceUp } },
  };
}

/** Swapping phase: done swapping. When everyone is ready, play begins. */
export function setReady(
  state: GameState,
  playerId: string,
  deps: EngineDeps = defaultDeps,
): GameState {
  if (state.phase !== "swapping") {
    throw new Error("The game is not in the swapping phase");
  }
  assertPlayer(state, playerId);
  if (state.ready[playerId]) return state;

  const ready = { ...state.ready, [playerId]: true };
  const next = { ...state, ready };
  const allReady = state.players.every((p) => ready[p.playerId]);
  return allReady ? beginPlay(next, deps) : next;
}

/**
 * Take back "ready" while the table is still waiting on someone. Once the
 * last player readies, play begins at once, so there is nothing to undo.
 */
export function setUnready(state: GameState, playerId: string): GameState {
  if (state.phase !== "swapping") {
    throw new Error("The game is not in the swapping phase");
  }
  assertPlayer(state, playerId);
  if (!state.ready[playerId]) return state;
  return { ...state, ready: { ...state.ready, [playerId]: false } };
}

/**
 * Host only: begin play once every CONNECTED player is ready. Players
 * who dropped during the swap are auto-readied with the cards they have.
 */
export function forceStart(
  state: GameState,
  playerId: string,
  deps: EngineDeps = defaultDeps,
): GameState {
  if (state.phase !== "swapping") {
    throw new Error("The game is not in the swapping phase");
  }
  if (state.creatorId !== playerId) {
    throw new Error("Only the host can start play early");
  }
  const blocking = state.players.filter(
    (p) => p.connected && !state.ready[p.playerId],
  );
  if (blocking.length > 0) {
    throw new Error("Everyone who's still connected needs to be ready first");
  }
  const ready: Record<string, boolean> = {};
  for (const p of state.players) ready[p.playerId] = true;
  return beginPlay({ ...state, ready }, deps);
}

/**
 * swapping → playing. The player holding the lowest non-wild rank
 * (scanning 3, 4, … A across hand + face-up cards) starts; ties are
 * broken at random. If nobody holds a non-wild card, pick at random.
 */
function beginPlay(state: GameState, deps: EngineDeps): GameState {
  const rules = rulesOf(state);
  let startIndex = -1;
  let lowestRank: Rank | null = null;

  for (const rank of RANK_SCAN_ORDER) {
    if (isWild(rank, rules)) continue;
    const holders: number[] = [];
    state.players.forEach((p, i) => {
      const cards = [...handOf(state, p.playerId), ...tableOf(state, p.playerId).faceUp];
      if (cards.some((c) => c.rank === rank)) holders.push(i);
    });
    if (holders.length > 0) {
      startIndex = holders[deps.randomIndex(holders.length)];
      lowestRank = rank;
      break;
    }
  }
  if (startIndex === -1) {
    startIndex = deps.randomIndex(state.players.length);
  }

  const starter = state.players[startIndex].playerId;
  return withEvent(
    { ...state, phase: "playing", currentPlayerIndex: startIndex },
    { kind: "start", playerId: starter, nextPlayerId: starter, lowestRank },
  );
}

// ── Turns ──────────────────────────────────────────────────────────

/**
 * Walk clockwise from the current player over players who still hold
 * cards, skipping `skipCount` of them. Returns the landing index and
 * who was skipped (for the banner).
 */
function advanceTurn(
  state: GameState,
  skipCount: number,
): { index: number; skippedIds: string[] } {
  const n = state.players.length;
  const skippedIds: string[] = [];
  let remaining = skipCount;
  let idx = state.currentPlayerIndex;
  // Bounded: at most one full lap per skip plus one to land.
  for (let step = 0; step < n * (skipCount + 2); step++) {
    idx = (idx + 1) % n;
    const p = state.players[idx];
    if (!hasCards(state, p.playerId)) continue;
    if (remaining > 0) {
      skippedIds.push(p.playerId);
      remaining--;
      continue;
    }
    return { index: idx, skippedIds };
  }
  // Nobody else holds cards — leave the turn where it is.
  return { index: state.currentPlayerIndex, skippedIds };
}

function activePlayerCount(state: GameState): number {
  return state.players.filter((p) => hasCards(state, p.playerId)).length;
}

/**
 * Shared tail of every successful play (from hand, face-up or a flipped
 * blind card). `state` must already have the cards removed from their
 * zone. Handles: pile push, draw-to-3, burns, going out, game end, and
 * whose turn is next (including UK-pub skips).
 */
function applyPlay(
  state: GameState,
  playerId: string,
  cards: Card[],
  source: Source,
  kind: "play" | "flip",
): GameState {
  const rules = rulesOf(state);
  const rank = cards[0].rank;

  let pile: Play[] = [...state.pile, { rank, cards }];
  let hands = state.hands;
  let stock = state.stock;

  // Draw back up to HAND_SIZE while the stock lasts (hand plays only —
  // by the time you're on table cards the stock is necessarily empty).
  if (source === "hand" && stock.length > 0) {
    const hand = [...handOf(state, playerId)];
    stock = [...stock];
    while (hand.length < HAND_SIZE && stock.length > 0) {
      hand.push(stock.shift()!);
    }
    hands = { ...hands, [playerId]: hand };
  }

  // Burn: a 10, or four of a kind on top.
  let burnedCount = 0;
  const burned = rank === "10" || hasFourOfAKindOnTop(pile);
  if (burned) {
    burnedCount = flattenPile(pile).length;
    pile = [];
  }

  let next: GameState = {
    ...state,
    pile,
    hands,
    stock,
    burnedCount: state.burnedCount + burnedCount,
  };

  // Out?
  const wentOut = !hasCards(next, playerId);
  if (wentOut) {
    next = { ...next, finishedOrder: [...next.finishedOrder, playerId] };
  }

  // Complete? (one player left holding cards — the 💩head)
  if (activePlayerCount(next) <= 1) {
    next = { ...next, phase: "complete" };
  }

  // Whose turn?
  let skippedIds: string[] = [];
  let nextPlayerId: string | null = null;
  if (next.phase === "complete") {
    // Leave the index alone; nothing more happens.
  } else if (burned && !wentOut) {
    nextPlayerId = playerId; // go again on an empty pile
  } else {
    const skipCount = !burned && isSkip(rank, rules) ? cards.length : 0;
    const adv = advanceTurn(next, skipCount);
    skippedIds = adv.skippedIds;
    next = { ...next, currentPlayerIndex: adv.index };
    nextPlayerId = next.players[adv.index].playerId;
  }

  const base = { playerId, nextPlayerId, burned, burnedCount, skippedIds, wentOut };
  return withEvent(
    next,
    kind === "flip"
      ? { kind: "flip", card: cards[0], ...base }
      : { kind: "play", cards, source, ...base },
  );
}

/**
 * Current player plays one or more same-rank cards from their hand (or,
 * once the hand is empty, from their face-up cards).
 */
export function playCards(
  state: GameState,
  playerId: string,
  cards: Card[],
): GameState {
  assertTurn(state, playerId);
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error("Select at least one card to play");
  }
  const keys = new Set(cards.map(cardKey));
  if (keys.size !== cards.length) {
    throw new Error("You can't play the same card twice");
  }
  const rank = cards[0].rank;
  if (cards.some((c) => c.rank !== rank)) {
    throw new Error("All the cards you play must be the same rank");
  }

  const source = sourceFor(state, playerId);
  if (source === "blind") {
    throw new Error("You have no cards left in hand — flip a face-down card instead");
  }
  const table = tableOf(state, playerId);
  const zone = source === "hand" ? handOf(state, playerId) : table.faceUp;
  for (const card of cards) {
    if (!zone.some((c) => cardsEqual(c, card))) {
      throw new Error(
        source === "hand"
          ? "That card is not in your hand"
          : "That card is not one of your face-up cards",
      );
    }
  }

  const rules = rulesOf(state);
  const req = requirementAt(state.pile, rules);
  if (!canPlayRank(rank, req, rules)) {
    throw new Error(
      `You can't play ${cards.length > 1 ? `${formatRank(rank)}s` : `a ${formatRank(rank)}`} here — ${formatRequirement(req).toLowerCase()}`,
    );
  }

  const remaining = removeCards(zone, cards);
  const next: GameState =
    source === "hand"
      ? { ...state, hands: { ...state.hands, [playerId]: remaining } }
      : {
          ...state,
          tables: { ...state.tables, [playerId]: { ...table, faceUp: remaining } },
        };
  return applyPlay(next, playerId, cards, source, "play");
}

/**
 * Current player flips one of their face-down cards (hand and face-up
 * cards must be gone). Legal → it's played with all the usual effects.
 * Illegal → the card and the whole pile go into their hand.
 */
export function flipBlind(
  state: GameState,
  playerId: string,
  slot: number,
): GameState {
  assertTurn(state, playerId);
  if (handOf(state, playerId).length > 0) {
    throw new Error("Play from your hand first");
  }
  const table = tableOf(state, playerId);
  if (table.faceUp.length > 0) {
    throw new Error("Play your face-up cards first");
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= TABLE_SIZE) {
    throw new Error("Invalid face-down slot");
  }
  const card = table.faceDown[slot];
  if (!card) {
    throw new Error("That face-down card is already gone");
  }

  const faceDown = [...table.faceDown];
  faceDown[slot] = null;
  const withoutCard: GameState = {
    ...state,
    tables: { ...state.tables, [playerId]: { ...table, faceDown } },
  };

  const rules = rulesOf(state);
  const req = requirementAt(state.pile, rules);
  if (canPlayRank(card.rank, req, rules)) {
    return applyPlay(withoutCard, playerId, [card], "blind", "flip");
  }

  // Unlucky: the flipped card and the whole pile go into your hand.
  const pileCards = flattenPile(state.pile);
  const hand = [...handOf(state, playerId), ...pileCards, card];
  let next: GameState = {
    ...withoutCard,
    hands: { ...state.hands, [playerId]: hand },
    pile: [],
  };
  const adv = advanceTurn(next, 0);
  next = { ...next, currentPlayerIndex: adv.index };
  return withEvent(next, {
    kind: "flip_fail",
    playerId,
    nextPlayerId: next.players[adv.index].playerId,
    card,
    pickedUp: pileCards.length + 1,
  });
}

/** Current player takes the whole pile into their hand. */
export function pickUpPile(state: GameState, playerId: string): GameState {
  assertTurn(state, playerId);
  if (state.pile.length === 0) {
    throw new Error("The pile is empty — you have to play a card");
  }
  const pileCards = flattenPile(state.pile);
  let next: GameState = {
    ...state,
    hands: { ...state.hands, [playerId]: [...handOf(state, playerId), ...pileCards] },
    pile: [],
  };
  const adv = advanceTurn(next, 0);
  next = { ...next, currentPlayerIndex: adv.index };
  return withEvent(next, {
    kind: "pickup",
    playerId,
    nextPlayerId: next.players[adv.index].playerId,
    count: pileCards.length,
  });
}

// ── Views ──────────────────────────────────────────────────────────

function slotsOf(table: Table): boolean[] {
  return table.faceDown.map((c) => c !== null);
}

/** Build the personalised StateMessage that one specific player should receive. */
export function getPlayerView(state: GameState, playerId: string): StateMessage {
  const selfPlayer = state.players.find((p) => p.playerId === playerId);
  if (!selfPlayer) {
    throw new Error("Player not found in game");
  }
  const rules = rulesOf(state);
  const selfTable = tableOf(state, playerId);

  const you: SelfView = {
    playerId: selfPlayer.playerId,
    name: selfPlayer.name,
    icon: selfPlayer.icon,
    hand: handOf(state, playerId),
    faceUp: selfTable.faceUp,
    faceDownSlots: slotsOf(selfTable),
    faceDownCount: faceDownCards(selfTable).length,
    ready: !!state.ready[playerId],
    source: state.phase === "playing" ? sourceFor(state, playerId) : null,
    isCreator: state.creatorId === playerId,
  };

  const players: PlayerView[] = state.players.map((p) => {
    const table = tableOf(state, p.playerId);
    const place = state.finishedOrder.indexOf(p.playerId);
    return {
      playerId: p.playerId,
      name: p.name,
      icon: p.icon,
      handCount: handOf(state, p.playerId).length,
      faceUp: table.faceUp,
      faceDownSlots: slotsOf(table),
      faceDownCount: faceDownCards(table).length,
      connected: p.connected,
      ready: !!state.ready[p.playerId],
      isOut: place !== -1,
      finishedPlace: place === -1 ? null : place + 1,
    };
  });

  const currentPlayerId =
    state.phase === "playing"
      ? state.players[state.currentPlayerIndex]?.playerId ?? null
      : null;

  const topPlay = state.pile[state.pile.length - 1];

  return {
    type: "state",
    phase: state.phase,
    rules: state.rules,
    you,
    players,
    currentPlayerId,
    pile: flattenPile(state.pile),
    lastPlayCount: topPlay ? topPlay.cards.length : 0,
    requirement: requirementAt(state.pile, rules),
    stockCount: state.stock.length,
    burnedCount: state.burnedCount,
    finishedOrder: state.finishedOrder,
    lastEvent: state.lastEvent,
    rematch: state.rematch,
  };
}

/** Standings + everyone's remaining cards (face-down ones revealed) for the end screen. */
export function getGameCompleteResult(state: GameState): {
  pooheadId: string;
  pooheadName: string;
  standings: StandingEntry[];
  finalCards: Record<string, FinalCards>;
} {
  if (state.phase !== "complete") {
    throw new Error("The game is not complete");
  }
  const poohead = state.players.find(
    (p) => !state.finishedOrder.includes(p.playerId),
  );
  if (!poohead) {
    throw new Error("No 💩head recorded for completed game");
  }

  const standings: StandingEntry[] = state.finishedOrder.map((id, i) => {
    const p = state.players.find((pl) => pl.playerId === id)!;
    return { playerId: id, name: p.name, icon: p.icon, place: i + 1, isPoohead: false };
  });
  standings.push({
    playerId: poohead.playerId,
    name: poohead.name,
    icon: poohead.icon,
    place: state.players.length,
    isPoohead: true,
  });

  const finalCards: Record<string, FinalCards> = {};
  for (const p of state.players) {
    const table = tableOf(state, p.playerId);
    finalCards[p.playerId] = {
      hand: handOf(state, p.playerId),
      faceUp: table.faceUp,
      faceDown: faceDownCards(table),
    };
  }

  return {
    pooheadId: poohead.playerId,
    pooheadName: poohead.name,
    standings,
    finalCards,
  };
}

// ── Test hook ──────────────────────────────────────────────────────

/**
 * TEST-ONLY: overwrite parts of one player's situation (and the shared
 * stock / pile). The DO only calls this when TEST_HOOKS=1.
 */
export function applyTestForce(
  state: GameState,
  playerId: string,
  msg: TestForceMessage,
): GameState {
  assertPlayer(state, playerId);
  let next: GameState = { ...state };
  const table = tableOf(state, playerId);
  if (msg.hand) next = { ...next, hands: { ...next.hands, [playerId]: msg.hand } };
  if (msg.faceUp || msg.faceDown) {
    next = {
      ...next,
      tables: {
        ...next.tables,
        [playerId]: {
          faceUp: msg.faceUp ?? table.faceUp,
          faceDown: msg.faceDown ?? table.faceDown,
        },
      },
    };
  }
  if (msg.stock) next = { ...next, stock: msg.stock };
  if (msg.pile) {
    next = {
      ...next,
      pile: msg.pile
        .filter((cards) => cards.length > 0)
        .map((cards) => ({ rank: cards[0].rank, cards })),
    };
  }
  if (msg.phase === "playing" && next.phase === "swapping") {
    const ready: Record<string, boolean> = {};
    for (const p of next.players) ready[p.playerId] = true;
    next = { ...next, ready, phase: "playing" };
  }
  if (msg.makeCurrent) {
    next = { ...next, currentPlayerIndex: getPlayerIndex(next, playerId) };
  }
  return next;
}
