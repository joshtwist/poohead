import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation, Navigate } from "react-router-dom";
import type { GamePhase, PlayerIcon } from "../../shared/types.ts";
import { getPlayerId, setPlayerId } from "../lib/storage.ts";
import { vibrateTurn, vibrateError } from "../lib/haptics.ts";
import { useWebSocket } from "../hooks/useWebSocket.ts";
import { useGameState } from "../hooks/useGameState.ts";
import { JoinForm } from "./JoinForm.tsx";
import { Lobby } from "./Lobby.tsx";
import { GameBoard } from "./GameBoard.tsx";
import { GameComplete } from "./GameComplete.tsx";
import { ErrorToast } from "./ErrorToast.tsx";
import type { RematchInfoView } from "../../shared/protocol.ts";

interface AutoJoin {
  name: string;
  icon: PlayerIcon;
}

/** How long the final table stays visible before the end screen. */
const END_HOLD_MS = 2600;

/**
 * Top-level container for a single game room.
 *
 * - Ensures a playerId exists for this gameId (generates on first visit).
 * - Manages the WebSocket lifecycle.
 * - Routes to the appropriate child component based on phase.
 * - Handles redirect-on-play-again (with auto-join for the new game).
 *
 * Owns NO game logic -- pure orchestration.
 */
export function GameRoom() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const autoJoin = (location.state as { autoJoin?: AutoJoin } | null)?.autoJoin;

  if (!gameId) {
    return <Navigate to="/" replace />;
  }

  // `key={gameId}` forces a clean remount when navigating between rooms
  // (e.g. opening a rematch), so per-room refs never leak across games.
  return <GameRoomInner key={gameId} gameId={gameId} navigate={navigate} autoJoin={autoJoin} />;
}

function GameRoomInner({
  gameId,
  navigate,
  autoJoin,
}: {
  gameId: string;
  navigate: ReturnType<typeof useNavigate>;
  autoJoin: AutoJoin | undefined;
}) {
  const [{ playerId, isReturning }] = useState(() => {
    const stored = getPlayerId(gameId);
    if (stored) return { playerId: stored, isReturning: true };
    const fresh = crypto.randomUUID();
    setPlayerId(gameId, fresh);
    return { playerId: fresh, isReturning: false };
  });

  const { state, gameComplete, lobbyInfo, error, errorSeq, processMessage } = useGameState();
  const { send, connected, failed, retry } = useWebSocket(gameId, playerId, processMessage);

  // After connecting, give the server a brief window to send state before we
  // assume this player isn't in the game. Avoids a join-form flash for
  // returning players.
  const [waitedForState, setWaitedForState] = useState(false);
  useEffect(() => {
    if (!connected || state) return;
    const delay = isReturning ? 1500 : 400;
    const t = setTimeout(() => setWaitedForState(true), delay);
    return () => clearTimeout(t);
  }, [connected, state, isReturning]);

  useEffect(() => {
    if (state) setWaitedForState(false);
  }, [state]);

  function handleJoinRematch(rematch: RematchInfoView) {
    const me = state?.you;
    navigate(`/${rematch.gameId}`, {
      replace: true,
      state: { autoJoin: me ? { name: me.name, icon: me.icon } : undefined },
    });
  }

  // Auto-join when we arrive from a play-again redirect
  const autoJoinSentRef = useRef(false);
  useEffect(() => {
    if (!autoJoin || autoJoinSentRef.current || !connected) return;
    if (state?.players.some((p) => p.playerId === playerId)) return;
    autoJoinSentRef.current = true;
    send({ type: "join", playerId, name: autoJoin.name, icon: autoJoin.icon });
  }, [autoJoin, connected, state, playerId, send]);

  // Haptic: it just became your turn
  const prevCurrentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const current = state.currentPlayerId;
    if (state.phase === "playing" && current === playerId && prevCurrentRef.current !== playerId) {
      vibrateTurn();
    }
    prevCurrentRef.current = current;
  }, [state, playerId]);

  useEffect(() => {
    if (error) vibrateError();
  }, [error]);

  // When the last card lands, keep the table on screen for a moment so
  // everyone sees how it ended before the 💩head screen takes over.
  // (A reload of a finished game goes straight to the end screen.)
  const prevPhaseRef = useRef<GamePhase | null>(null);
  const [holdBoard, setHoldBoard] = useState(false);
  const phase = state?.phase ?? null;
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (phase === "complete" && prev === "playing") {
      setHoldBoard(true);
      const t = setTimeout(() => setHoldBoard(false), END_HOLD_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // ── Render ──────────────────────────────────────────────────────

  if (failed && !state) {
    return (
      <>
        <ErrorToast message={error} />
        <ConnectionFailedScreen onRetry={retry} />
      </>
    );
  }

  if (!connected && !state && !lobbyInfo) {
    return (
      <>
        <ErrorToast message={error} />
        <LoadingScreen text="Connecting…" />
      </>
    );
  }

  const playerInState = state?.players.some((p) => p.playerId === playerId) ?? false;

  if (!state || !playerInState) {
    if (!waitedForState && !autoJoin && !lobbyInfo) {
      return (
        <>
          <ErrorToast message={error} />
          <LoadingScreen text={isReturning ? "Reconnecting…" : "Loading…"} />
        </>
      );
    }
    if (autoJoin && !autoJoinSentRef.current) {
      return (
        <>
          <ErrorToast message={error} />
          <LoadingScreen text="Rejoining…" />
        </>
      );
    }
    const takenIcons = state?.players.map((p) => p.icon) ?? lobbyInfo?.players.map((p) => p.icon) ?? [];
    return (
      <>
        <ErrorToast message={error} />
        <JoinForm playerId={playerId} send={send} takenIcons={takenIcons} />
      </>
    );
  }

  const showBoard = state.phase !== "lobby";
  const showEnd = state.phase === "complete" && gameComplete && !holdBoard;

  return (
    <>
      <ErrorToast message={error} />
      {state.phase === "lobby" && <Lobby state={state} gameId={gameId} send={send} />}
      {showBoard && (
        <div className="relative flex flex-1 min-h-0 flex-col">
          <GameBoard state={state} gameId={gameId} send={send} errorSeq={errorSeq} />
          {showEnd && (
            <GameComplete state={state} result={gameComplete} send={send} onJoinRematch={handleJoinRematch} />
          )}
        </div>
      )}
    </>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-muted font-extrabold" data-testid="loading-screen">
        <span className="anim-floaty mr-2">🃏</span>
        {text}
      </div>
    </div>
  );
}

function ConnectionFailedScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4 text-center" data-testid="connection-failed">
        <div className="font-display font-extrabold text-2xl">Couldn't reach the table</div>
        <div className="text-muted text-sm max-w-xs">Check your link and connection, then try again.</div>
        <button
          onClick={onRetry}
          data-testid="retry-btn"
          className="btn-lime mt-2 px-6 h-12 rounded-[18px] text-lg cursor-pointer border-0"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
