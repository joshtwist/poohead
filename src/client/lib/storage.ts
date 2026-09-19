const PREFIX = "poohead";

export function getPlayerId(gameId: string): string | null {
  try {
    return localStorage.getItem(`${PREFIX}:game:${gameId}:playerId`);
  } catch {
    return null;
  }
}

export function setPlayerId(gameId: string, playerId: string): void {
  try {
    localStorage.setItem(`${PREFIX}:game:${gameId}:playerId`, playerId);
  } catch {
    // localStorage may be unavailable (private browsing, full storage, etc.)
  }
}

/** Last game event sequence number this tab has already shown a banner for. */
export function getLastSeenSeq(gameId: string): number {
  try {
    const v = sessionStorage.getItem(`${PREFIX}:game:${gameId}:lastSeq`);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

export function setLastSeenSeq(gameId: string, seq: number): void {
  try {
    sessionStorage.setItem(`${PREFIX}:game:${gameId}:lastSeq`, String(seq));
  } catch {
    // ignore
  }
}
