import { DurableObject } from "cloudflare:workers";
import type { Card } from "../shared/types.ts";
import type {
  ClientMessage,
  ServerMessage,
  TestForceMessage,
} from "../shared/protocol.ts";
import type { RuleSetId } from "../shared/rules.ts";
import {
  createGame,
  addPlayer,
  startGame,
  finishDealing,
  swapCards,
  setReady,
  setUnready,
  forceStart,
  playCards,
  flipBlind,
  pickUpPile,
  createRematch,
  getPlayerView,
  getGameCompleteResult,
  setPlayerConnected,
  applyTestForce,
} from "./game-engine.ts";
import type { GameState } from "./game-engine.ts";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
  /** "1" to enable test-only messages like _test_force. */
  TEST_HOOKS?: string;
}

/** How long clients get to run the deal animation before swapping opens. */
const DEALING_DELAY_MS = 3500;

/**
 * One Durable Object per game. Owns the only mutable GameState, brokers
 * the WebSockets (Hibernation API, sockets tagged with playerId) and
 * persists state under a single storage key. All game rules live in the
 * pure reducers in game-engine.ts; this class only wires messages to
 * them and broadcasts the result.
 */
export class GameRoom extends DurableObject<Env> {
  private gameState: GameState | null = null;

  // ── State persistence ────────────────────────────────────────────

  private async loadState(): Promise<GameState> {
    if (this.gameState) return this.gameState;

    const stored = await this.ctx.storage.get<GameState>("state");
    if (stored) {
      this.gameState = stored;
      return this.gameState;
    }

    // First access: create an empty lobby. The gameId will be set from the
    // URL path on the first fetch() call.
    this.gameState = createGame("");
    return this.gameState;
  }

  private async saveState(newState: GameState): Promise<void> {
    this.gameState = newState;
    await this.ctx.storage.put("state", newState);
  }

  /** Persist + broadcast. Every mutating handler ends with this. */
  private async afterMutation(newState: GameState): Promise<void> {
    await this.saveState(newState);
    this.broadcastState(newState);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private getPlayerIdFromSocket(ws: WebSocket): string | null {
    const tags = this.ctx.getTags(ws);
    return tags.length > 0 ? tags[0] : null;
  }

  private requirePlayerId(ws: WebSocket): string {
    const playerId = this.getPlayerIdFromSocket(ws);
    if (!playerId) throw new Error("Not identified");
    return playerId;
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket may have closed between check and send; swallow.
    }
  }

  /** Build the LobbyInfoMessage that non-player sockets receive. */
  private lobbyInfo(state: GameState): ServerMessage {
    return {
      type: "lobby_info",
      phase: state.phase,
      players: state.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        icon: p.icon,
      })),
    };
  }

  /**
   * Broadcast to every connected socket:
   * - Players receive their personalised StateMessage.
   * - Non-players (viewing the join form) receive a LobbyInfoMessage.
   * - If the game has completed, every client also gets the
   *   GameCompleteMessage so a reconnecting client lands on the end
   *   screen with the same data.
   */
  private broadcastState(state: GameState): void {
    const info = this.lobbyInfo(state);
    const completeMsg = this.buildCompleteMessage(state);
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      const playerId = tags[0];
      if (!playerId) continue;

      const isPlayer = state.players.some((p) => p.playerId === playerId);
      if (isPlayer) {
        this.send(ws, getPlayerView(state, playerId));
      } else {
        this.send(ws, info);
      }
      if (completeMsg) this.send(ws, completeMsg);
    }
  }

  private buildCompleteMessage(state: GameState): ServerMessage | null {
    if (state.phase !== "complete") return null;
    const result = getGameCompleteResult(state);
    return { type: "game_complete", ...result };
  }

  /** Send the same message to every connected socket. */
  private broadcastToAll(msg: ServerMessage): void {
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, msg);
    }
  }

  // ── HTTP handler (WebSocket upgrade) ─────────────────────────────
  //
  // The client ALWAYS connects with ?playerId=<uuid> in the URL, so every
  // accepted WebSocket is tagged with a playerId from the start, which
  // keeps the hibernation API usage clean.

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pathMatch = url.pathname.match(/\/api\/game\/([a-z0-9]+)\/ws/);
    const gameId = pathMatch ? pathMatch[1] : "";
    let state = await this.loadState();
    if (!state.gameId) {
      state = { ...state, gameId };
      await this.saveState(state);
    }

    const playerId = url.searchParams.get("playerId");
    if (!playerId) {
      return new Response("Missing playerId query parameter", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [playerId]);

    const existingPlayer = state.players.some((p) => p.playerId === playerId);
    if (existingPlayer) {
      state = setPlayerConnected(state, playerId, true);
      await this.saveState(state);
      this.send(server, getPlayerView(state, playerId));
      this.broadcastToAll({ type: "player_reconnected", playerId });
    } else {
      this.send(server, this.lobbyInfo(state));
    }

    const completeMsg = this.buildCompleteMessage(state);
    if (completeMsg) this.send(server, completeMsg);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernation event handlers ───────────────────────────────────

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== "string") return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      this.send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    try {
      await this.handleMessage(ws, msg);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      this.send(ws, { type: "error", message: errMsg });
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const playerId = this.getPlayerIdFromSocket(ws);
    if (!playerId) return;

    const state = await this.loadState();
    const playerExists = state.players.some((p) => p.playerId === playerId);
    if (!playerExists) return;

    // Only mark disconnected if this was the player's last socket
    const remaining = this.ctx.getWebSockets(playerId).filter((s) => s !== ws);
    if (remaining.length === 0) {
      const newState = setPlayerConnected(state, playerId, false);
      await this.saveState(newState);
      this.broadcastToAll({ type: "player_disconnected", playerId });
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.webSocketClose(ws, 1006, "error", false);
  }

  // ── Alarm handler (dealing -> swapping transition) ───────────────

  async alarm(): Promise<void> {
    const state = await this.loadState();
    if (state.phase !== "dealing") return;
    await this.afterMutation(finishDealing(state));
  }

  // ── Message dispatch ─────────────────────────────────────────────

  private async handleMessage(ws: WebSocket, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case "ping":
        this.send(ws, { type: "pong" });
        return;
      case "join":
        await this.handleJoin(msg.playerId, msg.name, msg.icon);
        return;
      case "reconnect":
        await this.handleReconnect(ws, msg.playerId);
        return;
      case "start_game":
        await this.handleStartGame(ws, msg.rules);
        return;
      case "swap":
        await this.handleSwap(ws, msg.handCard, msg.faceUpCard);
        return;
      case "ready":
        await this.handleReady(ws);
        return;
      case "unready":
        await this.handleUnready(ws);
        return;
      case "force_start":
        await this.handleForceStart(ws);
        return;
      case "play":
        await this.handlePlay(ws, msg.cards);
        return;
      case "flip":
        await this.handleFlip(ws, msg.slot);
        return;
      case "pick_up":
        await this.handlePickUp(ws);
        return;
      case "create_rematch":
        await this.handleCreateRematch(ws);
        return;
      case "_test_force":
        await this.handleTestForce(ws, msg);
        return;
      default:
        this.send(ws, { type: "error", message: "Unknown message type" });
    }
  }

  // ── Individual handlers ──────────────────────────────────────────

  private async handleJoin(
    playerId: string,
    name: string,
    icon: string,
  ): Promise<void> {
    const state = await this.loadState();
    // The socket is already tagged with this playerId from fetch().
    await this.afterMutation(addPlayer(state, playerId, name, icon as any));
  }

  private async handleReconnect(ws: WebSocket, playerId: string): Promise<void> {
    let state = await this.loadState();

    const playerExists = state.players.some((p) => p.playerId === playerId);
    if (!playerExists) {
      this.send(ws, {
        type: "error",
        message: "Player not found. Please join as a new player.",
      });
      return;
    }

    state = setPlayerConnected(state, playerId, true);
    await this.saveState(state);
    this.send(ws, getPlayerView(state, playerId));
    this.broadcastToAll({ type: "player_reconnected", playerId });
  }

  private async handleStartGame(ws: WebSocket, rules: RuleSetId): Promise<void> {
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(startGame(state, playerId, rules));
    // After the dealing animation, move on to the swapping phase.
    await this.ctx.storage.setAlarm(Date.now() + DEALING_DELAY_MS);
  }

  private async handleSwap(
    ws: WebSocket,
    handCard: Card,
    faceUpCard: Card,
  ): Promise<void> {
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(swapCards(state, playerId, handCard, faceUpCard));
  }

  private async handleReady(ws: WebSocket): Promise<void> {
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(setReady(state, playerId));
  }

  private async handleUnready(ws: WebSocket): Promise<void> {
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(setUnready(state, playerId));
  }

  private async handleForceStart(ws: WebSocket): Promise<void> {
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(forceStart(state, playerId));
  }

  private async handlePlay(ws: WebSocket, cards: Card[]): Promise<void> {
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(playCards(state, playerId, cards));
  }

  private async handleFlip(ws: WebSocket, slot: number): Promise<void> {
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(flipBlind(state, playerId, slot));
  }

  private async handlePickUp(ws: WebSocket): Promise<void> {
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(pickUpPile(state, playerId));
  }

  /**
   * Player opened a rematch from the end screen: mint a new gameId and
   * attach it to the completed state so every client sees the CTA.
   * First caller wins — `createRematch()` throws for the second.
   */
  private async handleCreateRematch(ws: WebSocket): Promise<void> {
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(createRematch(state, playerId, generateGameId()));
  }

  /**
   * Test-only hook. Ignored unless TEST_HOOKS is explicitly enabled in
   * the worker env (.dev.vars locally, never in production).
   */
  private async handleTestForce(ws: WebSocket, msg: TestForceMessage): Promise<void> {
    if (this.env.TEST_HOOKS !== "1") return;
    const playerId = this.requirePlayerId(ws);
    const state = await this.loadState();
    await this.afterMutation(applyTestForce(state, playerId, msg));
  }
}

// ── Utility ────────────────────────────────────────────────────────

const ALPHANUM = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateGameId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += ALPHANUM[buf[i] % ALPHANUM.length];
  }
  return id;
}
