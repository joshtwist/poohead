import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card as CardType, Rank } from "../../shared/types.ts";
import { RANKS, cardKey, cardsEqual, sortCards } from "../../shared/types.ts";
import type { ClientMessage, StateMessage } from "../../shared/protocol.ts";
import {
  RULE_SETS,
  canPlayRank,
  formatRank,
  formatRequirement,
  isWild,
} from "../../shared/rules.ts";
import { ICON_MAP, ICON_COLORS } from "../lib/icons.ts";
import { ordinal } from "../lib/format.ts";
import { vibrateError } from "../lib/haptics.ts";
import { useLayoutTier } from "../hooks/useLayoutTier.ts";
import { useGameEvents } from "../hooks/useGameEvents.ts";
import { OpponentsArea } from "./OpponentsArea.tsx";
import { StatusRow } from "./StatusRow.tsx";
import { TableArea } from "./TableArea.tsx";
import { MyTable, type MyTableMode } from "./MyTable.tsx";
import { PlayerHand } from "./PlayerHand.tsx";
import { ActionBar, type ActionModel } from "./ActionBar.tsx";
import { EventBanner } from "./EventBanner.tsx";

interface GameBoardProps {
  state: StateMessage;
  gameId: string;
  send: (msg: ClientMessage) => void;
  /** Bumps on every server error; used to roll back optimistic plays. */
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
const PENDING_TTL_MS = 2500;
const PICKUP_ARM_MS = 2200;

function hasCard(list: CardType[], card: CardType): boolean {
  return list.some((c) => cardsEqual(c, card));
}

/**
 * The table during the swapping and playing phases. Owns every piece of
 * client-only state (selection, optimistic plays, the pick-up confirm,
 * event banners, the turn stopwatch) and derives everything else from
 * the server state each render, so a fresh `state` can never leave a
 * stale selection behind.
 */
export function GameBoard({ state, gameId, send, errorSeq }: GameBoardProps) {
  const layout = useLayoutTier();
  const rules = RULE_SETS[state.rules];
  const me = state.you;
  const phase = state.phase;
  const isPlaying = phase === "playing";
  const isSwapping = phase === "swapping";
  const isMyTurn = isPlaying && state.currentPlayerId === me.playerId;
  const source = me.source;
  const myIndex = state.players.findIndex((p) => p.playerId === me.playerId);
  const myView = state.players[myIndex];
  const amOut = myView?.isOut ?? false;

  // ── Client-only state ─────────────────────────────────────────────
  const [rawSelection, setRawSelection] = useState<Selection>(NONE);
  const [pendingPlay, setPendingPlay] = useState<{ cards: CardType[]; at: number } | null>(null);
  const [pickupArmed, setPickupArmed] = useState(false);
  const { banner, flash } = useGameEvents(state, me.playerId, gameId);

  // Reset transient state whenever the turn / phase moves on.
  const eventSeq = state.lastEvent?.seq ?? 0;
  useEffect(() => {
    setRawSelection(NONE);
    setPickupArmed(false);
    setPendingPlay(null);
  }, [state.currentPlayerId, phase, eventSeq]);

  // Roll back an optimistic play the server rejected.
  useEffect(() => {
    if (errorSeq > 0) setPendingPlay(null);
  }, [errorSeq]);

  // …or that never got confirmed.
  useEffect(() => {
    if (!pendingPlay) return;
    const t = setTimeout(() => setPendingPlay(null), PENDING_TTL_MS);
    return () => clearTimeout(t);
  }, [pendingPlay]);

  // Two-tap pick-up confirmation expires on its own.
  useEffect(() => {
    if (!pickupArmed) return;
    const t = setTimeout(() => setPickupArmed(false), PICKUP_ARM_MS);
    return () => clearTimeout(t);
  }, [pickupArmed]);

  // Turn stopwatch.
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!isPlaying) return;
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [state.currentPlayerId, isPlaying]);

  // Cards that just arrived in the hand (draws, pick-ups) get a pulse.
  const handKeyString = me.hand.map(cardKey).join(",");
  const prevHandRef = useRef<Set<string> | null>(null);
  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const keys = new Set(handKeyString ? handKeyString.split(",") : []);
    const prev = prevHandRef.current;
    prevHandRef.current = keys;
    if (!prev) return;
    const added = [...keys].filter((k) => !prev.has(k));
    if (added.length === 0) return;
    setNewKeys(new Set(added));
    const t = setTimeout(() => setNewKeys(new Set()), 1800);
    return () => clearTimeout(t);
  }, [handKeyString]);

  // ── Derived ───────────────────────────────────────────────────────
  const wildRanks = useMemo(
    () => new Set<Rank>(RANKS.filter((r) => isWild(r, rules))),
    [rules],
  );
  const legalRanks = useMemo(
    () => new Set<Rank>(RANKS.filter((r) => canPlayRank(r, state.requirement, rules))),
    [state.requirement, rules],
  );

  const pendingCards = pendingPlay?.cards ?? [];
  const visibleHand = useMemo(
    () => sortCards(me.hand.filter((c) => !hasCard(pendingCards, c))),
    [me.hand, pendingCards],
  );
  const visibleFaceUp = me.faceUp.filter((c) => !hasCard(pendingCards, c));

  // Validate the raw selection against the current state every render.
  const selection: Selection = (() => {
    const s = rawSelection;
    switch (s.kind) {
      case "none":
        return s;
      case "hand": {
        if (!isMyTurn || source !== "hand") return NONE;
        const cards = s.cards.filter((c) => hasCard(visibleHand, c));
        return cards.length ? { kind: "hand", cards } : NONE;
      }
      case "faceUp": {
        if (!isMyTurn || source !== "faceUp") return NONE;
        const cards = s.cards.filter((c) => hasCard(visibleFaceUp, c));
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
    if (selection.kind === "hand" || selection.kind === "faceUp") {
      for (const c of selection.cards) set.add(cardKey(c));
    } else if (selection.kind === "swapHand" || selection.kind === "swapFaceUp") {
      set.add(cardKey(selection.card));
    }
    return set;
  }, [selection]);

  const sourceCards =
    source === "hand" ? visibleHand : source === "faceUp" ? visibleFaceUp : [];
  const playableCards = sourceCards.filter((c) => legalRanks.has(c.rank));
  const hasPlayable = isMyTurn && (source === "blind" ? me.faceDownCount > 0 : playableCards.length > 0);

  const currentPlayer = state.players.find((p) => p.playerId === state.currentPlayerId);
  const poohead = phase === "complete" ? state.players.find((p) => !p.isOut) : undefined;

  // ── Actions ───────────────────────────────────────────────────────
  const toggleCard = useCallback(
    (kind: "hand" | "faceUp", card: CardType) => {
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
    },
    [],
  );

  function sendSwap(handCard: CardType, faceUpCard: CardType) {
    send({ type: "swap", handCard, faceUpCard });
    setRawSelection(NONE);
  }

  function onTapHand(card: CardType) {
    if (isSwapping) {
      if (me.ready) return;
      if (selection.kind === "swapFaceUp") return sendSwap(card, selection.card);
      setRawSelection(
        selection.kind === "swapHand" && cardsEqual(selection.card, card)
          ? NONE
          : { kind: "swapHand", card },
      );
      return;
    }
    if (!isMyTurn || source !== "hand") return;
    if (!legalRanks.has(card.rank)) {
      vibrateError();
      return;
    }
    toggleCard("hand", card);
  }

  function onTapFaceUp(card: CardType) {
    if (isSwapping) {
      if (me.ready) return;
      if (selection.kind === "swapHand") return sendSwap(selection.card, card);
      setRawSelection(
        selection.kind === "swapFaceUp" && cardsEqual(selection.card, card)
          ? NONE
          : { kind: "swapFaceUp", card },
      );
      return;
    }
    if (!isMyTurn || source !== "faceUp") return;
    if (!legalRanks.has(card.rank)) {
      vibrateError();
      return;
    }
    toggleCard("faceUp", card);
  }

  function onTapBlind(slot: number) {
    if (!isMyTurn || source !== "blind" || !me.faceDownSlots[slot]) return;
    setRawSelection(
      selection.kind === "blind" && selection.slot === slot ? NONE : { kind: "blind", slot },
    );
  }

  function onPlay() {
    if (selection.kind !== "hand" && selection.kind !== "faceUp") return;
    const cards = selection.cards;
    send({ type: "play", cards });
    setPendingPlay({ cards, at: Date.now() });
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
    const kind = selection.kind;
    const cards = sourceCards.filter((c) => c.rank === rank);
    setRawSelection({ kind, cards });
  }

  // ── View models ───────────────────────────────────────────────────
  const readyCount = state.players.filter((p) => p.ready).length;
  const total = state.players.length;
  const unready = state.players.filter((p) => !p.ready).map((p) => p.name);
  const allConnectedReady = state.players.filter((p) => p.connected).every((p) => p.ready);

  let actionModel: ActionModel;
  if (isSwapping) {
    actionModel = {
      kind: "swap",
      ready: me.ready,
      readyCount,
      total,
      isHost: me.isCreator,
      canForceStart: allConnectedReady && readyCount < total,
      onReady: () => send({ type: "ready" }),
      onForceStart: () => send({ type: "force_start" }),
      hint: me.ready
        ? `Waiting for ${unready.join(", ") || "everyone"}…`
        : selection.kind === "swapHand"
          ? "Now tap a face-up card on your table to swap"
          : selection.kind === "swapFaceUp"
            ? "Now tap a card in your hand to swap"
            : "Tap a hand card, then a table card to swap. Done? Tap Ready.",
    };
  } else if (phase === "complete") {
    actionModel = {
      kind: "waiting",
      text: poohead ? `${poohead.playerId === me.playerId ? "You're" : `${poohead.name} is`} the 💩head!` : "Game over",
    };
  } else if (amOut) {
    actionModel = {
      kind: "out",
      text: `You're out — ${ordinal(myView?.finishedPlace ?? state.finishedOrder.indexOf(me.playerId) + 1)} 🎉`,
    };
  } else if (!isMyTurn) {
    actionModel = {
      kind: "waiting",
      text: currentPlayer ? `Waiting for ${currentPlayer.name}…` : "Waiting…",
      hint:
        source === "faceUp"
          ? "Your hand is empty — you'll play from your table cards"
          : source === "blind"
            ? "Down to your face-down cards — a flip is coming"
            : undefined,
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
          ? "Tap Flip to reveal it. If it can't be played, you take the pile."
          : "Pick a face-down card to flip — it's a gamble!",
    };
  } else {
    const selCount = selection.kind === "hand" || selection.kind === "faceUp" ? selection.cards.length : 0;
    const selRank = selCount > 0 && (selection.kind === "hand" || selection.kind === "faceUp") ? selection.cards[0].rank : null;
    const sameRankInSource = selRank ? sourceCards.filter((c) => c.rank === selRank).length : 0;
    const pileEmpty = state.pile.length === 0;
    actionModel = {
      kind: "play",
      playLabel:
        selCount === 0
          ? hasPlayable
            ? "Play"
            : "No playable cards"
          : selCount === 1
            ? `Play ${formatRank(selRank!)}`
            : `Play ${selCount} ${formatRank(selRank!)}s`,
      playDisabled: selCount === 0,
      onPlay,
      pickupLabel: `Pick up (${state.pile.length})`,
      pickupPrimary: !hasPlayable && !pileEmpty,
      pickupArmed,
      canPickUp: !pileEmpty,
      onPickUp,
      selectAll:
        selRank && sameRankInSource > selCount
          ? { label: `All ${sameRankInSource} ${formatRank(selRank)}s`, onSelect: onSelectAll }
          : null,
      hint: !hasPlayable
        ? pileEmpty
          ? "Play anything"
          : "Nothing fits — you'll have to pick up the pile"
        : selCount === 0
          ? source === "faceUp"
            ? "Tap a face-up card on your table to select it"
            : "Tap a card to select it — same-rank cards can go together"
          : "Tap Play (or the pile) to play",
    };
  }

  const statusText = isSwapping
    ? `Swap cards · ${readyCount}/${total} ready`
    : phase === "complete"
      ? "Game over"
      : amOut
        ? `You're out — ${ordinal(myView?.finishedPlace ?? 1)}`
        : isMyTurn
          ? "Your turn"
          : currentPlayer
            ? `${currentPlayer.name}'s turn`
            : "…";

  const myTableMode: MyTableMode = isSwapping && !me.ready
    ? "swap"
    : isMyTurn && source === "faceUp"
      ? "faceUp"
      : isMyTurn && source === "blind"
        ? "blind"
        : "idle";

  const handInteractive = (isSwapping && !me.ready) || (isMyTurn && source === "hand");
  const handPlayable = isMyTurn && source === "hand" ? legalRanks : null;
  const canTapPile =
    isMyTurn && (selection.kind === "hand" || selection.kind === "faceUp") && selection.cards.length > 0;

  const emptyText = amOut
    ? "You're out!"
    : source === "faceUp"
      ? "Hand empty — play from your table cards"
      : source === "blind"
        ? "Down to your face-down cards…"
        : isSwapping
          ? ""
          : "";

  const MyIcon = ICON_MAP[me.icon];
  const myColor = ICON_COLORS[(myIndex >= 0 ? myIndex : 0) % ICON_COLORS.length];
  const showRotate = layout.width > layout.height && layout.height < 480;

  const table = (
    <TableArea
      stockCount={state.stockCount}
      pile={state.pile}
      lastPlayCount={state.lastPlayCount}
      burnedCount={state.burnedCount}
      layout={layout}
      wildRanks={wildRanks}
      canTapPile={canTapPile}
      onTapPile={onPlay}
      flash={flash}
    />
  );

  const myTable = (
    <MyTable
      faceUp={visibleFaceUp}
      faceDownSlots={me.faceDownSlots}
      layout={layout}
      mode={myTableMode}
      selectedKeys={selectedKeys}
      selectedSlot={selection.kind === "blind" ? selection.slot : null}
      playableRanks={isMyTurn && source === "faceUp" ? legalRanks : null}
      wildRanks={wildRanks}
      onTapFaceUp={onTapFaceUp}
      onTapBlind={onTapBlind}
      you={{ Icon: MyIcon, colorClass: myColor, handCount: me.hand.length, isOut: amOut }}
    />
  );

  return (
    <div
      data-testid="game-board"
      data-tier={layout.tier}
      data-phase={phase}
      data-my-turn={isMyTurn ? "true" : undefined}
      className={`game-board relative flex flex-1 min-h-0 flex-col w-full max-w-[900px] mx-auto transition-colors duration-500 ${
        isMyTurn ? "bg-felt-active" : "bg-felt"
      }`}
    >
      <OpponentsArea
        players={state.players}
        selfId={me.playerId}
        currentPlayerId={state.currentPlayerId}
        phase={phase}
        layout={layout}
      />

      <StatusRow
        text={statusText}
        highlight={isMyTurn}
        seconds={isPlaying ? seconds : null}
        requirement={isPlaying ? formatRequirement(state.requirement) : null}
        requirementActive={isMyTurn}
      />

      {layout.sideBySide ? (
        <div className="flex-1 min-h-0 flex items-center justify-center gap-10 px-4">
          <div className="flex items-center justify-center">{table}</div>
          <div className="w-px self-stretch my-6 bg-white/10" />
          {myTable}
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 flex items-center justify-center">{table}</div>
          {myTable}
        </>
      )}

      <PlayerHand
        cards={visibleHand}
        layout={layout}
        selectedKeys={selectedKeys}
        playableRanks={handPlayable}
        wildRanks={wildRanks}
        interactive={handInteractive}
        onTap={onTapHand}
        newKeys={newKeys}
        emptyText={emptyText}
      />

      <ActionBar model={actionModel} layout={layout} />

      <EventBanner banner={banner} position={layout.sideBySide ? "high" : "table"} />

      {showRotate && (
        <div
          data-testid="rotate-overlay"
          className="absolute inset-0 z-50 bg-felt-deep/95 flex flex-col items-center justify-center gap-3 text-center px-6"
        >
          <div className="text-4xl">📱</div>
          <div className="text-white font-semibold">Rotate your phone</div>
          <div className="text-slate-300 text-sm">💩head plays best in portrait on a phone.</div>
        </div>
      )}
    </div>
  );
}
