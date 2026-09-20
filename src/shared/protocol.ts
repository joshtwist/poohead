import type { Card, GamePhase, PlayerIcon, Source } from "./types.ts";
import type { Requirement, RuleSetId } from "./rules.ts";

// ── Client → Server ────────────────────────────────────────────────

export type ClientMessage =
  | JoinMessage
  | ReconnectMessage
  | StartGameMessage
  | SwapMessage
  | ReadyMessage
  | UnreadyMessage
  | ForceStartMessage
  | PlayMessage
  | FlipMessage
  | PickUpMessage
  | CreateRematchMessage
  | PingMessage
  | TestForceMessage;

export interface JoinMessage {
  type: "join";
  playerId: string;
  name: string;
  icon: PlayerIcon;
}

export interface ReconnectMessage {
  type: "reconnect";
  playerId: string;
}

/** Host only. Deals the cards under the chosen rule set. */
export interface StartGameMessage {
  type: "start_game";
  rules: RuleSetId;
}

/** Swapping phase: trade one hand card for one of your face-up cards. */
export interface SwapMessage {
  type: "swap";
  handCard: Card;
  faceUpCard: Card;
}

/** Swapping phase: done swapping. Play begins when everyone is ready. */
export interface ReadyMessage {
  type: "ready";
}

/** Swapping phase: changed your mind — keep swapping (only while others are still deciding). */
export interface UnreadyMessage {
  type: "unready";
}

/** Host only: start once every CONNECTED player is ready. */
export interface ForceStartMessage {
  type: "force_start";
}

/**
 * Play one or more same-rank cards. The server works out whether they
 * come from your hand or your face-up cards (hand first, always).
 */
export interface PlayMessage {
  type: "play";
  cards: Card[];
}

/** Flip one of your face-down cards (stable slot 0..2). */
export interface FlipMessage {
  type: "flip";
  slot: number;
}

/** Take the whole pile into your hand. */
export interface PickUpMessage {
  type: "pick_up";
}

export interface CreateRematchMessage {
  type: "create_rematch";
}

export interface PingMessage {
  type: "ping";
}

/**
 * TEST-ONLY. Overwrites parts of the SENDER'S situation (and the shared
 * stock/pile) so the e2e suite can reach specific scenarios
 * deterministically. Omitted fields are left untouched. Ignored unless
 * the Worker runs with TEST_HOOKS=1 (never in production).
 */
export interface TestForceMessage {
  type: "_test_force";
  hand?: Card[];
  faceUp?: Card[];
  /** Length 3; null marks an already-flipped slot. */
  faceDown?: (Card | null)[];
  stock?: Card[];
  /** Plays bottom → top; each inner array is one same-rank play. */
  pile?: Card[][];
  /** Make the sender the current player. */
  makeCurrent?: boolean;
  /** Jump straight from swapping to playing (everyone auto-readied). */
  phase?: "playing";
}

// ── Server → Client ────────────────────────────────────────────────

export type ServerMessage =
  | StateMessage
  | LobbyInfoMessage
  | ErrorMessage
  | PlayerReconnectedMessage
  | PlayerDisconnectedMessage
  | GameCompleteMessage
  | PongMessage;

/**
 * Sent to any WebSocket whose playerId is NOT (yet) part of the game.
 * Lets the join form know which names/icons are already taken.
 */
export interface LobbyInfoMessage {
  type: "lobby_info";
  phase: GamePhase;
  players: {
    playerId: string;
    name: string;
    icon: PlayerIcon;
  }[];
}

/** What everyone can see about a player. Face-up cards are public. */
export interface PlayerView {
  playerId: string;
  name: string;
  icon: PlayerIcon;
  handCount: number;
  faceUp: Card[];
  /** Which of the 3 face-down slots still hold a card. */
  faceDownSlots: boolean[];
  faceDownCount: number;
  connected: boolean;
  ready: boolean;
  isOut: boolean;
  /** 1-based finishing position once out; null while still playing. */
  finishedPlace: number | null;
}

export interface SelfView {
  playerId: string;
  name: string;
  icon: PlayerIcon;
  hand: Card[];
  faceUp: Card[];
  faceDownSlots: boolean[];
  faceDownCount: number;
  ready: boolean;
  /** Where your next play must come from (null unless playing). */
  source: Source | null;
  isCreator: boolean;
}

export interface RematchInfoView {
  gameId: string;
  creatorId: string;
  creatorName: string;
}

interface EventBase {
  seq: number;
  playerId: string;
  /** Who plays next after this event (null once the game is complete). */
  nextPlayerId: string | null;
}

/**
 * Exactly one event per mutation; burn / skip / out are flags on the
 * play so a client can build every banner it needs from one record.
 */
export type GameEvent = EventBase &
  (
    | { kind: "start"; lowestRank: string | null }
    | {
        kind: "play";
        cards: Card[];
        source: Source;
        burned: boolean;
        burnedCount: number;
        skippedIds: string[];
        wentOut: boolean;
      }
    | {
        kind: "flip";
        card: Card;
        burned: boolean;
        burnedCount: number;
        skippedIds: string[];
        wentOut: boolean;
      }
    | { kind: "flip_fail"; card: Card; pickedUp: number }
    | { kind: "pickup"; count: number }
  );

export interface StateMessage {
  type: "state";
  phase: GamePhase;
  rules: RuleSetId;
  you: SelfView;
  players: PlayerView[];
  /** Null unless the game is in the playing phase. */
  currentPlayerId: string | null;
  /** Every card on the pile, bottom → top. Public information. */
  pile: Card[];
  /** How many of the top pile cards were played together (the top play). */
  lastPlayCount: number;
  requirement: Requirement;
  stockCount: number;
  burnedCount: number;
  /** Players who have gone out, in order. */
  finishedOrder: string[];
  lastEvent: GameEvent | null;
  /**
   * Present on completed games once any player has opened a rematch.
   * Every connected client watches this field — when it flips from
   * null to an object, the end screen swaps its CTA to "Join X's game".
   */
  rematch: RematchInfoView | null;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface PlayerReconnectedMessage {
  type: "player_reconnected";
  playerId: string;
}

export interface PlayerDisconnectedMessage {
  type: "player_disconnected";
  playerId: string;
}

export interface StandingEntry {
  playerId: string;
  name: string;
  icon: PlayerIcon;
  /** 1 = first out … n = the 💩head. */
  place: number;
  isPoohead: boolean;
}

export interface FinalCards {
  hand: Card[];
  faceUp: Card[];
  /** Revealed only here, once the game is over. */
  faceDown: Card[];
}

export interface GameCompleteMessage {
  type: "game_complete";
  pooheadId: string;
  pooheadName: string;
  standings: StandingEntry[];
  finalCards: Record<string, FinalCards>;
}

export interface PongMessage {
  type: "pong";
}
