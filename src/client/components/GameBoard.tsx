import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card as CardType, Rank } from "../../shared/types.ts";
import { RANKS, TABLE_SIZE, cardKey, cardsEqual } from "../../shared/types.ts";
import type { ClientMessage, StateMessage } from "../../shared/protocol.ts";
import { RULE_SETS, canPlayRank, formatRank, isWild, type Requirement } from "../../shared/rules.ts";
import { ICON_EMOJI, ME_COLOR, playerColor } from "../lib/icons.ts";
import { vibrateAction, vibrateError } from "../lib/haptics.ts";
import { jit, placeCards, type SelectionKind } from "../lib/placement.ts";
import { useLayoutTier } from "../hooks/useLayoutTier.ts";
import { useZones } from "../hooks/useZones.ts";
import { BURN_DELAY_MS, useGameEvents } from "../hooks/useGameEvents.ts";
import { CardLayer, type Placement, type Pose } from "./CardLayer.tsx";
import { OpponentsArea } from "./OpponentsArea.tsx";
import { StatusRow } from "./StatusRow.tsx";
import { TableArea } from "./TableArea.tsx";
import { MyTable } from "./MyTable.tsx";
import { PlayerHand } from "./PlayerHand.tsx";
import { ActionBar, type ActionModel } from "./ActionBar.tsx";
import { EventBanner } from "./EventBanner.tsx";
import { EmojiRain } from "./EmojiRain.tsx";

interface GameBoardProps {
  state: StateMessage;
  gameId: string;
  send: (msg: ClientMessage) => void;
  /** Bumps on every server error; clears any half-made move. */
  errorSeq: number;
}

type Selection =
  | { kind: "none" }
  | { kind: "hand"; cards: CardType[] }
  | { kind: "faceUp"; cards: CardType[] }
  | { kind: "blind"; slot: number }
  | { kind: "swapHand"; card: CardType }
  | { kind: "swapFaceUp"; card: CardType };

const NONE: Selection = { kind: "none" };
const PICKUP_ARM_MS = 2500;
const REVEAL_MS = 750;
const NUDGE_MS = 1500;

interface Reveal {
  zone: string;
  until: number;
}
interface GhostReveal {
  id: string;
  card: CardType;
  zone: string;
  exitZone: string;
  until: number;
}
interface BurnHold {
  cards: CardType[];
  topCount: number;
  until: number;
}

function hasCard(list: CardType[], card: CardType): boolean {
  return list.some((c) => cardsEqual(c, card));
}

/** "Anything goes" / "7 or higher" / "King or lower" */
function requirementText(req: Requirement): string {
  switch (req.kind) {
    case "any":
      return "Anything goes";
    case "min":
      return `${formatRank(req.rank)} or higher`;
    case "max":
      return `${formatRank(req.rank)} or lower`;
  }
}

/**
 * The table during dealing, swapping and play. Lays out empty zones with
 * ordinary flexbox and lets the card layer fly every card to them. Owns
 * the client-only state (selection, pick-up confirm, deal staging, flip
 * reveals, effects) and derives everything else from the server state on
 * each render, so a fresh `state` can never leave a stale selection behind.
 */
export function GameBoard({ state, gameId, send, errorSeq }: GameBoardProps) {
  const layout = useLayoutTier();
  const boardRef = useRef<HTMLDivElement>(null);
  const { zones, bw, bh } = useZones(boardRef);
  const rules = RULE_SETS[state.rules];
  const me = state.you;
  const phase = state.phase;
  const isPlaying = phase === "playing";
  const isSwapping = phase === "swapping";
  const isDealing = phase === "dealing";
  const isMyTurn = isPlaying && state.currentPlayerId === me.playerId;
  const source = me.source;
  const myView = state.players.find((p) => p.playerId === me.playerId);
  const amOut = myView?.isOut ?? false;
  // Everyone else, starting with whoever plays after me and continuing
  // in turn order — so play visibly runs left → right along the top and
  // back down to me.
  const opponents = useMemo(() => {
    const i = state.players.findIndex((p) => p.playerId === me.playerId);
    if (i < 0) return state.players;
    return [...state.players.slice(i + 1), ...state.players.slice(0, i)];
  }, [state.players, me.playerId]);
  const colorFor = useCallback(
    (pid: string) => playerColor(state.players, pid, me.playerId),
    [state.players, me.playerId],
  );

  // ── Client-only state ─────────────────────────────────────────────
  const [rawSelection, setRawSelection] = useState<Selection>(NONE);
  const [pickupArmed, setPickupArmed] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const effects = useGameEvents(state, me.playerId, gameId);

  const eventSeq = state.lastEvent?.seq ?? 0;
  useEffect(() => {
    setRawSelection(NONE);
    setPickupArmed(false);
  }, [state.currentPlayerId, phase, eventSeq]);

  useEffect(() => {
    if (errorSeq > 0) {
      setRawSelection(NONE);
      setPickupArmed(false);
    }
  }, [errorSeq]);

  useEffect(() => {
    if (!pickupArmed) return;
    const t = setTimeout(() => setPickupArmed(false), PICKUP_ARM_MS);
    return () => clearTimeout(t);
  }, [pickupArmed]);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), NUDGE_MS);
    return () => clearTimeout(t);
  }, [nudge]);

  // Turn clock.
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!isPlaying) return;
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [state.currentPlayerId, isPlaying]);

  useEffect(() => {
    document.title = isMyTurn ? "Your turn · 💩head" : "💩head";
    return () => {
      document.title = "💩head";
    };
  }, [isMyTurn]);

  // ── Deal staging: one card every 85ms, round-robin ───────────────
  const dealTotal = state.players.length * TABLE_SIZE * 3;
  const [dealt, setDealt] = useState<number | null>(() => (state.phase === "dealing" ? 0 : null));
  useEffect(() => {
    if (!isDealing) {
      setDealt(null);
      return;
    }
    if (dealt === null || dealt >= dealTotal) return;
    const interval = Math.max(60, Math.min(85, 3000 / dealTotal));
    const t = setTimeout(() => setDealt((d) => (d === null ? d : d + 1)), dealt === 0 ? 350 : interval);
    return () => clearTimeout(t);
  }, [isDealing, dealt, dealTotal]);

  // ── Transients driven by the last event ──────────────────────────
  const [reveals, setReveals] = useState<Record<string, Reveal>>({});
  const [ghostReveal, setGhostReveal] = useState<GhostReveal | null>(null);
  const [burnHold, setBurnHold] = useState<BurnHold | null>(null);
  const [enterHints, setEnterHints] = useState<Record<string, string>>({});
  const [, setTick] = useState(0);
  const prevStateRef = useRef<StateMessage | null>(null);
  const seenSeqRef = useRef<number>(eventSeq);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    const ev = state.lastEvent;
    if (!prev || !ev || ev.seq <= seenSeqRef.current) return;
    seenSeqRef.current = ev.seq;
    const now = Date.now();
    const actorIsMe = ev.playerId === me.playerId;
    const prevActor = prev.players.find((p) => p.playerId === ev.playerId);
    const actor = state.players.find((p) => p.playerId === ev.playerId);
    let flippedSlot = -1;
    if (prevActor && actor) {
      for (let i = 0; i < TABLE_SIZE; i++) {
        if (prevActor.faceDownSlots[i] && !actor.faceDownSlots[i]) flippedSlot = i;
      }
    }
    const slotZone =
      flippedSlot >= 0 ? (actorIsMe ? `mslot-${flippedSlot}` : `oslot-${ev.playerId}-${flippedSlot}`) : null;
    const hints: Record<string, string> = {};

    if (ev.kind === "flip" && slotZone) {
      const id = cardKey(ev.card);
      setReveals((r) => ({ ...r, [id]: { zone: slotZone, until: now + REVEAL_MS } }));
      hints[id] = slotZone;
    }
    if (ev.kind === "flip_fail" && slotZone) {
      const id = cardKey(ev.card);
      if (actorIsMe) {
        setReveals((r) => ({ ...r, [id]: { zone: slotZone, until: now + REVEAL_MS } }));
        hints[id] = slotZone;
      } else {
        setGhostReveal({
          id: `reveal-${ev.seq}`,
          card: ev.card,
          zone: slotZone,
          exitZone: `ohand-${ev.playerId}`,
          until: now + REVEAL_MS,
        });
      }
    }
    if (ev.kind === "play" && !actorIsMe && ev.source === "hand") {
      for (const c of ev.cards) hints[cardKey(c)] = `ohand-${ev.playerId}`;
    }
    if ((ev.kind === "play" || ev.kind === "flip") && ev.burned) {
      const played = ev.kind === "play" ? ev.cards : [ev.card];
      const prevPile = prev.pile.filter((c) => !hasCard(played, c));
      setBurnHold({ cards: [...prevPile, ...played], topCount: played.length, until: now + BURN_DELAY_MS });
    }
    if (Object.keys(hints).length) setEnterHints((h) => ({ ...h, ...hints }));
  }, [state, me.playerId]);

  // Expire transients (re-render when the nearest one lapses).
  const now = Date.now();
  useEffect(() => {
    const times = [
      ...Object.values(reveals).map((r) => r.until),
      ghostReveal?.until ?? 0,
      burnHold?.until ?? 0,
    ].filter((t) => t > now);
    if (!times.length) return;
    const t = setTimeout(() => {
      const n = Date.now();
      setReveals((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v.until > n)));
      setGhostReveal((g) => (g && g.until <= n ? null : g));
      setBurnHold((b) => (b && b.until <= n ? null : b));
      setTick((k) => k + 1);
    }, Math.min(...times) - now + 20);
    return () => clearTimeout(t);
  });

  // ── Derived ───────────────────────────────────────────────────────
  const wildRanks = useMemo(() => new Set<Rank>(RANKS.filter((r) => isWild(r, rules))), [rules]);
  const legalRanks = useMemo(
    () => new Set<Rank>(RANKS.filter((r) => canPlayRank(r, state.requirement, rules))),
    [state.requirement, rules],
  );

  // Validate the raw selection against the current state every render.
  const selection: Selection = (() => {
    const s = rawSelection;
    switch (s.kind) {
      case "none":
        return s;
      case "hand": {
        if (!isMyTurn || source !== "hand") return NONE;
        const cards = s.cards.filter((c) => hasCard(me.hand, c));
        return cards.length ? { kind: "hand", cards } : NONE;
      }
      case "faceUp": {
        if (!isMyTurn || source !== "faceUp") return NONE;
        const cards = s.cards.filter((c) => hasCard(me.faceUp, c));
        return cards.length ? { kind: "faceUp", cards } : NONE;
      }
      case "blind":
        return isMyTurn && source === "blind" && me.faceDownSlots[s.slot] ? s : NONE;
      case "swapHand":
        return isSwapping && !me.ready && hasCard(me.hand, s.card) ? s : NONE;
      case "swapFaceUp":
        return isSwapping && !me.ready && hasCard(me.faceUp, s.card) ? s : NONE;
    }
  })();

  const selectedKeys = useMemo(() => {
    const set = new Set<string>();
    if (selection.kind === "hand" || selection.kind === "faceUp") for (const c of selection.cards) set.add(cardKey(c));
    else if (selection.kind === "swapHand" || selection.kind === "swapFaceUp") set.add(cardKey(selection.card));
    return set;
  }, [selection]);

  const sourceCards = source === "hand" ? me.hand : source === "faceUp" ? me.faceUp : [];
  const playableCards = sourceCards.filter((c) => legalRanks.has(c.rank));
  const hasPlayable = isMyTurn && (source === "blind" ? me.faceDownCount > 0 : playableCards.length > 0);
  const currentPlayer = state.players.find((p) => p.playerId === state.currentPlayerId);
  const selCards = selection.kind === "hand" || selection.kind === "faceUp" ? selection.cards : [];
  const canTapPile = isMyTurn && selCards.length > 0;

  // ── Actions ───────────────────────────────────────────────────────
  const toggleCard = useCallback((kind: "hand" | "faceUp", card: CardType) => {
    setRawSelection((prev) => {
      if (prev.kind === kind) {
        if (hasCard(prev.cards, card)) {
          const cards = prev.cards.filter((c) => !cardsEqual(c, card));
          return cards.length ? { kind, cards } : NONE;
        }
        if (prev.cards[0]?.rank === card.rank) return { kind, cards: [...prev.cards, card] };
      }
      return { kind, cards: [card] };
    });
    setPickupArmed(false);
  }, []);

  function sendSwap(handCard: CardType, faceUpCard: CardType) {
    send({ type: "swap", handCard, faceUpCard });
    setRawSelection(NONE);
    vibrateAction();
  }

  function onTapHand(card: CardType) {
    if (isSwapping) {
      if (me.ready) return;
      if (selection.kind === "swapFaceUp") return sendSwap(card, selection.card);
      setRawSelection(
        selection.kind === "swapHand" && cardsEqual(selection.card, card) ? NONE : { kind: "swapHand", card },
      );
      return;
    }
    if (!isMyTurn || source !== "hand") return;
    if (!legalRanks.has(card.rank)) {
      vibrateError();
      setNudge("That won't beat the pile.");
      return;
    }
    toggleCard("hand", card);
  }

  function onTapFaceUp(card: CardType) {
    if (isSwapping) {
      if (me.ready) return;
      if (selection.kind === "swapHand") return sendSwap(selection.card, card);
      setRawSelection(
        selection.kind === "swapFaceUp" && cardsEqual(selection.card, card) ? NONE : { kind: "swapFaceUp", card },
      );
      return;
    }
    if (!isMyTurn || source !== "faceUp") return;
    if (!legalRanks.has(card.rank)) {
      vibrateError();
      setNudge("That won't beat the pile.");
      return;
    }
    toggleCard("faceUp", card);
  }

  function onTapBlind(slot: number) {
    if (!isMyTurn || source !== "blind" || !me.faceDownSlots[slot]) return;
    setRawSelection(selection.kind === "blind" && selection.slot === slot ? NONE : { kind: "blind", slot });
  }

  function onPlay() {
    if (selCards.length === 0) return;
    send({ type: "play", cards: selCards });
    setRawSelection(NONE);
  }

  function onFlip() {
    if (selection.kind !== "blind") return;
    send({ type: "flip", slot: selection.slot });
    setRawSelection(NONE);
  }

  function onPickUp() {
    if (!isMyTurn || state.pile.length === 0) return;
    if (hasPlayable && !pickupArmed) {
      setPickupArmed(true);
      return;
    }
    send({ type: "pick_up" });
    setPickupArmed(false);
    setRawSelection(NONE);
  }

  function onSelectAll() {
    if (selection.kind !== "hand" && selection.kind !== "faceUp") return;
    const rank = selection.cards[0].rank;
    setRawSelection({ kind: selection.kind, cards: sourceCards.filter((c) => c.rank === rank) });
  }

  // ── View models ───────────────────────────────────────────────────
  const readyCount = state.players.filter((p) => p.ready).length;
  const total = state.players.length;
  const allConnectedReady = state.players.filter((p) => p.connected).every((p) => p.ready);

  let actionModel: ActionModel;
  if (isDealing) {
    actionModel = { kind: "waiting", text: "Shuffling up…", emoji: "🃏", hint: "" };
  } else if (isSwapping) {
    actionModel = {
      kind: "swap",
      ready: me.ready,
      readyCount,
      total,
      isHost: me.isCreator,
      canForceStart: allConnectedReady && readyCount < total,
      onReady: () => send({ type: "ready" }),
      onUnready: () => send({ type: "unready" }),
      onForceStart: () => send({ type: "force_start" }),
      hint: me.ready
        ? "Waiting on the others… Undo to keep swapping."
        : selection.kind === "swapHand" || selection.kind === "swapFaceUp"
          ? "Now tap a card in the other row to swap."
          : "Park your big guns face-up: tap a hand card, then a table card.",
    };
  } else if (phase === "complete") {
    actionModel = { kind: "waiting", text: "Game over", emoji: "🏁" };
  } else if (amOut) {
    actionModel = { kind: "out", text: "You're out. Enjoy the show.", emoji: "🍿" };
  } else if (!isMyTurn) {
    actionModel = {
      kind: "waiting",
      text: currentPlayer ? `${currentPlayer.name} is thinking…` : "Waiting…",
      emoji: currentPlayer ? ICON_EMOJI[currentPlayer.icon] : "⏳",
      hint:
        source === "faceUp"
          ? "Hand's empty — you're on your table cards now."
          : source === "blind"
            ? "Down to the blind ones. Brace yourself."
            : "Hang tight.",
    };
  } else if (source === "blind") {
    actionModel = {
      kind: "flip",
      flipDisabled: selection.kind !== "blind",
      onFlip,
      pickupLabel: `Pick up (${state.pile.length})`,
      canPickUp: state.pile.length > 0,
      onPickUp,
      hint:
        selection.kind === "blind"
          ? "Tap Flip. If it can't be played, you eat the pile."
          : "Hand's empty. Tap a face-down card and pray.",
    };
  } else {
    const selRank = selCards[0]?.rank ?? null;
    const sameRankInSource = selRank ? sourceCards.filter((c) => c.rank === selRank).length : 0;
    const pileEmpty = state.pile.length === 0;
    actionModel = {
      kind: "play",
      playLabel:
        selCards.length > 1 ? `Play ${selCards.length}×${selRank}` : selCards.length === 1 ? `Play ${selRank}` : "Play",
      playDisabled: selCards.length === 0,
      onPlay,
      pickupLabel: `Pick up (${state.pile.length})`,
      pickupPrimary: !hasPlayable && !pileEmpty,
      pickupArmed,
      canPickUp: !pileEmpty,
      onPickUp,
      selectAll:
        selRank && sameRankInSource > selCards.length
          ? { label: `All ${sameRankInSource} ${selRank}s`, onSelect: onSelectAll }
          : null,
      hint:
        nudge ??
        (selCards.length
          ? "Tap Play — or just tap the pile."
          : hasPlayable
            ? source === "faceUp"
              ? "Playing from your table now. Same rank stacks."
              : "Tap a card. Same rank stacks together."
            : pileEmpty
              ? "Empty pile — anything goes."
              : "Nothing fits. Time to eat the pile. 💩"),
    };
  }

  const statusText = isDealing
    ? "Dealing…"
    : isSwapping
      ? `Set your table · ${readyCount}/${total} ready`
      : phase === "complete"
        ? "Game over"
        : isMyTurn
          ? "Your turn"
          : currentPlayer
            ? `${currentPlayer.name}'s turn`
            : "…";

  const emptyText =
    isPlaying && !amOut
      ? source === "faceUp"
        ? "Playing from your table"
        : source === "blind"
          ? "Down to the blind ones"
          : ""
      : "";

  const showRotate = layout.width > layout.height && layout.height < 480;

  // ── Card placements (recomputed every render; it's cheap) ─────────
  const selectionKind: SelectionKind = selection.kind;
  const placements: Placement[] = placeCards({
    state,
    zones,
    bw,
    bh,
    opponents,
    wildRanks,
    legalRanks,
    isMyTurn,
    source,
    swapping: isSwapping && !me.ready,
    selectedKeys,
    selectionKind,
    selectedSlot: selection.kind === "blind" ? selection.slot : null,
    dealt,
    reveals,
    ghostReveal: ghostReveal && ghostReveal.until > now ? ghostReveal : null,
    burnHold: burnHold && burnHold.until > now ? burnHold : null,
    enterHints,
    now,
    canTapPile,
    onTapHand,
    onTapFaceUp,
    onTapBlind,
    onTapPile: onPlay,
  });

  // Pile cards that vanish because an opponent scooped them fly to that
  // opponent's hand and fade; burned ones carry their own exit.
  const exitFor = useCallback(
    (prev: Placement): Pose | null => {
      if (prev.zone !== "pile") return null;
      const ev = state.lastEvent;
      if (!ev || ev.playerId === me.playerId) return null;
      if (ev.kind !== "pickup" && ev.kind !== "flip_fail") return null;
      const zone = zones[`ohand-${ev.playerId}`];
      if (!zone) return null;
      return {
        x: zone.x + zone.w / 2 - 38,
        y: zone.y + zone.h / 2 - 53,
        scale: zone.w / 76,
        rotate: jit(prev.id, "r", 8),
        opacity: 0,
        faceUp: false,
        z: 900,
      };
    },
    [state.lastEvent, me.playerId, zones],
  );

  const pileZone = zones.pile;
  const tableCentre = (
    <TableArea
      stockCount={state.stockCount + (dealt !== null ? Math.max(0, dealTotal - dealt) : 0)}
      pileCount={state.pile.length}
      burnedCount={state.burnedCount}
      canTapPile={canTapPile}
      onTapPile={onPlay}
    />
  );
  const myTable = (
    <MyTable
      emoji={ICON_EMOJI[me.icon]}
      color={ME_COLOR}
      active={isMyTurn}
      handCount={me.hand.length}
      isOut={amOut}
      faceDownSlots={me.faceDownSlots}
    />
  );

  return (
    <div
      ref={boardRef}
      data-testid="game-board"
      data-tier={layout.tier}
      data-phase={phase}
      data-my-turn={isMyTurn ? "true" : undefined}
      className="game-board cq relative flex-1 min-h-0 w-full max-w-[900px] mx-auto overflow-hidden"
    >
      <div className="dot-grid absolute inset-0 pointer-events-none" />

      <div
        className="absolute inset-0 flex flex-col"
        style={{ padding: "clamp(10px,2.5cqw,16px) 12px clamp(10px,2.5cqw,16px)" }}
        data-testid={isDealing ? "deal-animation" : undefined}
      >
        <OpponentsArea
          opponents={opponents}
          colorFor={colorFor}
          currentPlayerId={state.currentPlayerId}
          phase={phase}
          badges={effects.badges}
          dense={opponents.length >= 3 && bw > 0 && bw < 640}
        />

        <StatusRow
          text={statusText}
          highlight={isMyTurn}
          seconds={isPlaying ? seconds : null}
          requirement={isPlaying ? requirementText(state.requirement) : null}
          popKey={`${state.currentPlayerId ?? ""}:${phase}`}
        />

        {layout.sideBySide ? (
          <div className="flex-1 min-h-0 flex items-center justify-center" style={{ gap: "clamp(28px,6cqw,60px)" }}>
            {tableCentre}
            <div className="w-px self-stretch my-4 bg-cream/10" />
            {myTable}
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 flex items-center justify-center">{tableCentre}</div>
            {myTable}
          </>
        )}

        <PlayerHand count={me.hand.length} emptyText={emptyText} compact={layout.sideBySide} />

        <ActionBar model={actionModel} />
      </div>

      <CardLayer placements={placements} exitFor={exitFor} />

      {/* FX layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 20 }}>
        {effects.flash && (
          <div key={`flash-${effects.flash.key}`} className="anim-flash absolute inset-0" style={{ background: effects.flash.color }} />
        )}
        {pileZone &&
          effects.bursts.map((b) =>
            Array.from({ length: 9 }).map((_, i) => (
              <div
                key={`burst-${b.key}-${i}`}
                className="absolute"
                style={{
                  left: pileZone.x + pileZone.w / 2 + (i - 4) * 11 + jit(`f${i}`, "x", 6),
                  top: pileZone.y + pileZone.h / 2 + jit(`f${i}`, "y", 10),
                  fontSize: 20 + ((i * 7) % 14),
                  lineHeight: 1,
                  animation: `flame ${1 + ((i * 13) % 5) / 10}s ease-out ${i * 0.05}s both`,
                  filter: "drop-shadow(0 4px 6px rgba(0,0,0,.35))",
                }}
              >
                🔥
              </div>
            )),
          )}
        {effects.rain && (
          <EmojiRain
            key={`rain-${effects.rain.key}`}
            emoji={effects.rain.kind === "poo" ? "💩" : ["🎉", "✨", "🎊"]}
            count={effects.rain.count}
            kind={effects.rain.kind}
          />
        )}
        <EventBanner banner={effects.banner} />
      </div>

      {showRotate && (
        <div
          data-testid="rotate-overlay"
          className="absolute inset-0 z-50 bg-table-deep/95 flex flex-col items-center justify-center gap-3 text-center px-6"
        >
          <div className="text-4xl">📱</div>
          <div className="font-display font-extrabold text-xl">Rotate your phone</div>
          <div className="text-muted text-sm">💩head plays best in portrait on a phone.</div>
        </div>
      )}
    </div>
  );
}
