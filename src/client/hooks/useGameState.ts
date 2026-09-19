import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ServerMessage,
  StateMessage,
  GameCompleteMessage,
  LobbyInfoMessage,
} from "../../shared/protocol.ts";

interface GameState {
  state: StateMessage | null;
  gameComplete: GameCompleteMessage | null;
  lobbyInfo: LobbyInfoMessage | null;
  error: string | null;
  /** Increments on every error so consumers can react to repeats. */
  errorSeq: number;
}

/**
 * Manages client-side game state derived from server messages.
 *
 * Returns a stable `processMessage` callback that should be called
 * directly from the WebSocket `onmessage` handler — NOT via an
 * intermediate `lastMessage` state. Using a state intermediary loses
 * messages when React batches rapid-fire updates (e.g. the server
 * sends both a `state` and `game_complete` message in the same
 * broadcast). Functional `setGameState(prev => ...)` updates are
 * immune to batching because each updater runs against the latest
 * state, in order.
 */
export function useGameState() {
  const [gameState, setGameState] = useState<GameState>({
    state: null,
    gameComplete: null,
    lobbyInfo: null,
    error: null,
    errorSeq: 0,
  });

  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const processMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "state":
        setGameState((prev) => ({ ...prev, state: msg }));
        break;

      case "lobby_info":
        setGameState((prev) => ({ ...prev, lobbyInfo: msg }));
        break;

      case "game_complete":
        setGameState((prev) => ({ ...prev, gameComplete: msg }));
        break;

      case "error":
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        setGameState((prev) => ({
          ...prev,
          error: msg.message,
          errorSeq: prev.errorSeq + 1,
        }));
        errorTimerRef.current = setTimeout(() => {
          setGameState((prev) => ({ ...prev, error: null }));
        }, 3000);
        break;

      case "player_reconnected":
      case "player_disconnected": {
        const connected = msg.type === "player_reconnected";
        setGameState((prev) => {
          if (!prev.state) return prev;
          return {
            ...prev,
            state: {
              ...prev.state,
              players: prev.state.players.map((p) =>
                p.playerId === msg.playerId ? { ...p, connected } : p,
              ),
            },
          };
        });
        break;
      }
    }
  }, []);

  return { ...gameState, processMessage };
}
