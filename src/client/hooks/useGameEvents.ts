import { useEffect, useRef, useState } from "react";
import type { GameEvent, StateMessage } from "../../shared/protocol.ts";
import { formatRank } from "../../shared/rules.ts";
import { getLastSeenSeq, setLastSeenSeq } from "../lib/storage.ts";
import { joinNames, ordinal, cardCount } from "../lib/format.ts";
import {
  vibrateAction,
  vibrateBurn,
  vibratePickup,
  vibrateTurn,
  vibrateWin,
} from "../lib/haptics.ts";
import type { TableFlash } from "../components/TableArea.tsx";

export interface Banner {
  key: string;
  kind: GameEvent["kind"] | "burn" | "skip" | "out";
  text: string;
  tone: "neutral" | "gold" | "poo";
  durationMs: number;
}

interface Queued {
  banners: Banner[];
  flash: TableFlash | null;
}

/**
 * Turns `state.lastEvent` into banners, haptics and a table flash.
 *
 * Dedupe: the last seen seq is kept in a ref AND in sessionStorage, so a
 * reload/reconnect (which re-delivers the same state) doesn't replay the
 * banner, while a brand-new tab still gets the "X starts" banner. Events
 * can arrive back-to-back (flip → play → burn), so they queue.
 */
export function useGameEvents(
  state: StateMessage,
  selfId: string,
  gameId: string,
): { banner: Banner | null; flash: TableFlash | null } {
  const seenRef = useRef<number | null>(null);
  if (seenRef.current === null) seenRef.current = getLastSeenSeq(gameId);

  const [queue, setQueue] = useState<Banner[]>([]);
  const [current, setCurrent] = useState<Banner | null>(null);
  const [flash, setFlash] = useState<TableFlash | null>(null);

  const event = state.lastEvent;
  const seq = event?.seq ?? 0;

  useEffect(() => {
    if (!event || seq <= (seenRef.current ?? 0)) return;
    seenRef.current = seq;
    setLastSeenSeq(gameId, seq);

    const { banners, flash: newFlash } = describe(event, state, selfId);
    if (banners.length > 0) setQueue((q) => [...q, ...banners]);
    if (newFlash) setFlash(newFlash);
    buzz(event, selfId);
    // `state` is only read for names; keying on seq is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, event, gameId, selfId]);

  // Promote the next queued banner when the current one expires.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [head, ...rest] = queue;
    setCurrent(head);
    setQueue(rest);
    const t = setTimeout(() => setCurrent(null), head.durationMs);
    return () => clearTimeout(t);
  }, [current, queue]);

  // Clear the flash after its animation.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash]);

  return { banner: current, flash };
}

function nameOf(state: StateMessage, playerId: string, selfId: string): string {
  if (playerId === selfId) return "You";
  return state.players.find((p) => p.playerId === playerId)?.name ?? "Someone";
}

function describe(event: GameEvent, state: StateMessage, selfId: string): Queued {
  const me = event.playerId === selfId;
  const who = nameOf(state, event.playerId, selfId);
  const banners: Banner[] = [];
  let flash: TableFlash | null = null;
  const key = (suffix: string) => `${event.seq}-${suffix}`;

  switch (event.kind) {
    case "start": {
      banners.push({
        key: key("start"),
        kind: "start",
        tone: me ? "gold" : "neutral",
        durationMs: 2200,
        text: me
          ? event.lowestRank
            ? `You have the lowest card — you start!`
            : "You start!"
          : event.lowestRank
            ? `${who} has the lowest card and starts`
            : `${who} starts`,
      });
      break;
    }
    case "play":
    case "flip": {
      const rankText =
        event.kind === "flip"
          ? formatRank(event.card.rank)
          : event.cards.length > 1
            ? `${event.cards.length} ${formatRank(event.cards[0].rank)}s`
            : null;
      if (event.kind === "flip") {
        banners.push({
          key: key("flip"),
          kind: "flip",
          tone: "neutral",
          durationMs: 1600,
          text: me ? `You flipped a ${rankText} — it plays!` : `${who} flipped a ${rankText}!`,
        });
      }
      if (event.burned) {
        flash = { seq: event.seq, kind: "burn" };
        banners.push({
          key: key("burn"),
          kind: "burn",
          tone: "gold",
          durationMs: 1800,
          text: me ? `🔥 You burned the pile!` : `🔥 ${who} burned the pile!`,
        });
      }
      if (event.skippedIds.length > 0) {
        const names = event.skippedIds.map((id) => nameOf(state, id, selfId));
        banners.push({
          key: key("skip"),
          kind: "skip",
          tone: "neutral",
          durationMs: 1400,
          text: `⏭ ${joinNames(names)} ${names.length === 1 && names[0] !== "You" ? "gets" : "get"} skipped`,
        });
      }
      if (event.wentOut) {
        const place = state.finishedOrder.indexOf(event.playerId) + 1;
        banners.push({
          key: key("out"),
          kind: "out",
          tone: "gold",
          durationMs: 2400,
          text: me
            ? `🎉 You're out — ${ordinal(place)}!`
            : `🎉 ${who} is out — ${ordinal(place)}!`,
        });
      } else if (event.kind === "play" && rankText && !event.burned && !me) {
        // Multi-card plays by others get a small note; single plays are silent.
        banners.push({
          key: key("multi"),
          kind: "play",
          tone: "neutral",
          durationMs: 1200,
          text: `${who} played ${rankText}`,
        });
      }
      break;
    }
    case "flip_fail": {
      flash = { seq: event.seq, kind: "flip_fail" };
      banners.push({
        key: key("flipfail"),
        kind: "flip_fail",
        tone: "poo",
        durationMs: 2400,
        text: me
          ? `😬 You flipped a ${formatRank(event.card.rank)} — pick up ${cardCount(event.pickedUp)}`
          : `😬 ${who} flipped a ${formatRank(event.card.rank)} — picks up ${cardCount(event.pickedUp)}`,
      });
      break;
    }
    case "pickup": {
      flash = { seq: event.seq, kind: "pickup" };
      banners.push({
        key: key("pickup"),
        kind: "pickup",
        tone: "poo",
        durationMs: 2200,
        text: me
          ? `💩 You picked up ${cardCount(event.count)}`
          : `💩 ${who} picked up ${cardCount(event.count)}`,
      });
      break;
    }
  }
  return { banners, flash };
}

function buzz(event: GameEvent, selfId: string): void {
  const me = event.playerId === selfId;
  switch (event.kind) {
    case "start":
      if (me) vibrateTurn();
      break;
    case "play":
    case "flip":
      if (me) {
        if (event.wentOut) vibrateWin();
        else if (event.burned) vibrateBurn();
        else vibrateAction();
      }
      break;
    case "flip_fail":
    case "pickup":
      if (me) vibratePickup();
      break;
  }
}
