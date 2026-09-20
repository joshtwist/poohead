import { useEffect, useRef, useState } from "react";
import type { GameEvent, StateMessage } from "../../shared/protocol.ts";
import { getLastSeenSeq, setLastSeenSeq } from "../lib/storage.ts";
import { joinNames } from "../lib/format.ts";
import {
  vibrateAction,
  vibrateBurn,
  vibrateLoss,
  vibratePickup,
  vibrateTurn,
  vibrateWin,
} from "../lib/haptics.ts";

export const LIME = "#D4FF4F";
export const PINK = "#FF4FA3";
export const TANGERINE = "#FF8A3D";
export const CREAM = "#FFF7E8";

export interface Banner {
  key: string;
  kind: GameEvent["kind"] | "burn" | "skip" | "out";
  text: string;
  sub: string;
  color: string;
  durationMs: number;
}

export interface Flash {
  key: number;
  /** A CSS background (radial gradient). */
  color: string;
}

export interface Burst {
  key: number;
  kind: "fire";
}

export interface Rain {
  key: number;
  kind: "poo" | "confetti";
  count: number;
}

export interface GameEffects {
  banner: Banner | null;
  flash: Flash | null;
  bursts: Burst[];
  rain: Rain | null;
  badges: Record<string, { text: string; key: number }>;
}

const BANNER_MS = 1750;
const FLASH_MS = 1000;
const BURST_MS = 1600;
const RAIN_MS = 3600;
const BADGE_MS = 2300;
/** A burn is shown once the play has landed on the pile. */
export const BURN_DELAY_MS = 500;

const FLASH_BURN = "radial-gradient(circle at 50% 45%, rgba(255,138,61,.6), transparent 70%)";
const FLASH_SHAME = "radial-gradient(circle at 50% 60%, rgba(255,79,163,.5), transparent 70%)";
const FLASH_OVER = "radial-gradient(circle at 50% 40%, rgba(255,79,163,.55), transparent 70%)";
const FLASH_WIN = "radial-gradient(circle at 50% 40%, rgba(212,255,79,.45), transparent 70%)";

/**
 * Turns `state.lastEvent` into the board's effects: the display banner
 * (queued, one at a time), the full-board flash, fire bursts, emoji rain,
 * per-opponent reaction badges, and haptics.
 *
 * Dedupe: the last seen seq is kept in a ref AND in sessionStorage, so a
 * reload/reconnect (which re-delivers the same state) doesn't replay
 * anything, while a brand-new tab still gets the "Go!" banner.
 */
export function useGameEvents(state: StateMessage, selfId: string, gameId: string): GameEffects {
  const seenRef = useRef<number | null>(null);
  if (seenRef.current === null) seenRef.current = getLastSeenSeq(gameId);

  const [queue, setQueue] = useState<Banner[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [rain, setRain] = useState<Rain | null>(null);
  const [badges, setBadges] = useState<Record<string, { text: string; key: number }>>({});
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const event = state.lastEvent;
  const seq = event?.seq ?? 0;

  useEffect(() => {
    if (!event || seq <= (seenRef.current ?? 0)) return;
    seenRef.current = seq;
    setLastSeenSeq(gameId, seq);

    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timersRef.current.push(t);
    };
    const me = event.playerId === selfId;
    const who = me ? "You" : state.players.find((p) => p.playerId === event.playerId)?.name ?? "Someone";
    const key = (suffix: string) => `${seq}-${suffix}`;
    const show = (b: Omit<Banner, "durationMs" | "key"> & { key?: string }) =>
      setQueue((q) => [...q, { ...b, key: b.key ?? key(b.kind), durationMs: BANNER_MS }]);
    const doFlash = (color: string) => {
      setFlash({ key: seq, color });
      later(() => setFlash((f) => (f?.key === seq ? null : f)), FLASH_MS);
    };
    const doRain = (kind: Rain["kind"], count: number) => {
      setRain({ key: seq, kind, count });
      later(() => setRain((r) => (r?.key === seq ? null : r)), RAIN_MS);
    };
    const doBadge = (text: string) => {
      const pid = event.playerId;
      setBadges((b) => ({ ...b, [pid]: { text, key: seq } }));
      later(() => setBadges((b) => (b[pid]?.key === seq ? Object.fromEntries(Object.entries(b).filter(([k]) => k !== pid)) : b)), BADGE_MS);
    };
    const doFire = () => {
      setBursts((bs) => [...bs, { key: seq, kind: "fire" }]);
      later(() => setBursts((bs) => bs.filter((b) => b.key !== seq)), BURST_MS);
    };
    const amPoohead = state.phase === "complete" && !state.finishedOrder.includes(selfId);

    switch (event.kind) {
      case "start":
        show({
          kind: "start",
          text: "Go!",
          sub: me ? "You start. Lowest card energy." : `${who} starts. Lowest card energy.`,
          color: LIME,
        });
        if (me) vibrateTurn();
        break;

      case "play":
      case "flip": {
        if (me) {
          if (event.burned) vibrateBurn();
          else vibrateAction();
        }
        if (event.skippedIds.length) {
          const names = event.skippedIds.map((id) =>
            id === selfId ? "You" : state.players.find((p) => p.playerId === id)?.name ?? "Someone",
          );
          const plural = names.length > 1 || names[0] === "You";
          show({ kind: "skip", text: "Skip!", sub: `${joinNames(names)} sit${plural ? "" : "s"} this one out.`, color: CREAM });
        }
        if (event.wentOut) {
          if (me) {
            show({ kind: "out", text: "Out!", sub: "Clean hands. Sit back and gloat.", color: LIME });
            doRain("confetti", 16);
            vibrateWin();
          } else {
            doBadge("out! 🎉");
          }
        }
        if (event.burned) {
          later(() => {
            doFlash(FLASH_BURN);
            doFire();
            show({
              kind: "burn",
              text: "BURN!",
              sub: me ? "Pile's gone. Go again." : `${who} torched it.`,
              color: TANGERINE,
            });
            if (!me) doBadge("burn 🔥");
          }, BURN_DELAY_MS);
        }
        if (state.phase === "complete") {
          later(() => {
            doFlash(amPoohead ? FLASH_OVER : FLASH_WIN);
            if (amPoohead) {
              doRain("poo", 24);
              vibrateLoss();
            } else if (!me) {
              doRain("confetti", 16);
            }
          }, event.burned ? BURN_DELAY_MS + 300 : 300);
        }
        break;
      }

      case "flip_fail": {
        const n = event.pickedUp;
        doFlash(FLASH_SHAME);
        if (me) {
          show({ kind: "flip_fail", text: "Nope.", sub: `Blind flip failed. +${n} 💩`, color: PINK });
          doRain("poo", 24);
          vibratePickup();
        } else {
          doBadge(`+${n} 💩`);
          show({ kind: "flip_fail", text: `${who} whiffed`, sub: `Blind flip. +${n} to the hand.`, color: PINK });
          doRain("poo", 16);
        }
        break;
      }

      case "pickup": {
        const n = event.count;
        doFlash(FLASH_SHAME);
        if (me) {
          show({ kind: "pickup", text: "Oof.", sub: `+${n} cards. That's a lot of 💩.`, color: PINK });
          doRain("poo", 24);
          vibratePickup();
        } else {
          doBadge(`+${n} 💩`);
          show({ kind: "pickup", text: `${who} eats it`, sub: `+${n} to the hand.`, color: PINK });
          doRain("poo", 16);
        }
        break;
      }
    }
    // `state` is only read for names/phase; keying on seq is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, event, gameId, selfId]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // Promote the next queued banner when the current one expires…
  useEffect(() => {
    if (banner || queue.length === 0) return;
    setBanner(queue[0]);
    setQueue((q) => q.slice(1));
  }, [banner, queue]);

  // …and expire the current one (separate effect so the queue update
  // above can't cancel the timer).
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), banner.durationMs);
    return () => clearTimeout(t);
  }, [banner]);

  return { banner, flash, bursts, rain, badges };
}
