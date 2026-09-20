import { describe, expect, it } from "vitest";
import type { GameState } from "./game-engine.ts";
import {
  addPlayer,
  applyTestForce,
  createGame,
  finishDealing,
  flipBlind,
  forceStart,
  getGameCompleteResult,
  getPlayerView,
  pickUpPile,
  playCards,
  setPlayerConnected,
  setReady,
  setUnready,
  startGame,
  swapCards,
} from "./game-engine.ts";
import {
  P,
  assertInvariants,
  c,
  cs,
  currentPlayer,
  fixedDeps,
  keys,
  makeState,
  pileCards,
} from "./testkit.ts";

function lobby(n: number): GameState {
  let s = createGame("g1");
  for (let i = 0; i < n; i++) s = addPlayer(s, P[i], P[i].toUpperCase(), "cat");
  return s;
}

/** Deal → swapping, deterministic (identity shuffle). */
function dealt(n: number, rules: "standard" | "ukpub" | "millybims" = "millybims"): GameState {
  return finishDealing(startGame(lobby(n), "p1", rules, fixedDeps));
}

function readyAll(s: GameState): GameState {
  for (const p of s.players) s = setReady(s, p.playerId, fixedDeps);
  return s;
}

describe("lobby → deal → swap → start", () => {
  it("deals 3 face-down, 3 face-up, 3 hand per player and keeps the rest as stock", () => {
    const s = startGame(lobby(3), "p1", "ukpub", fixedDeps);
    expect(s.phase).toBe("dealing");
    expect(s.rules).toBe("ukpub");
    for (const id of ["p1", "p2", "p3"]) {
      expect(s.hands[id]).toHaveLength(3);
      expect(s.tables[id].faceUp).toHaveLength(3);
      expect(s.tables[id].faceDown).toHaveLength(3);
      expect(s.tables[id].faceDown.every((x) => x !== null)).toBe(true);
    }
    expect(s.stock).toHaveLength(52 - 27);
    assertInvariants(s, { fullDeck: true });
  });

  it("five players leaves a 7-card stock", () => {
    const s = startGame(lobby(5), "p1", "standard", fixedDeps);
    expect(s.stock).toHaveLength(7);
    assertInvariants(s, { fullDeck: true });
  });

  it("only the host with 2+ players and a known rule set may start", () => {
    expect(() => startGame(lobby(2), "p2", "standard")).toThrow(/host/);
    expect(() => startGame(lobby(1), "p1", "standard")).toThrow(/at least 2/);
    expect(() => startGame(lobby(2), "p1", "nope" as never)).toThrow(/Unknown rule set/);
  });

  it("a sixth player cannot join", () => {
    expect(() => addPlayer(lobby(5), "p6", "P6", "dog")).toThrow(/full/);
  });

  it("finishDealing moves to swapping; nobody is ready", () => {
    const s = dealt(2);
    expect(s.phase).toBe("swapping");
    expect(Object.values(s.ready).every((r) => r === false)).toBe(true);
  });

  it("swap trades a hand card for one of your own face-up cards", () => {
    const s = dealt(2);
    const handCard = s.hands.p1[0];
    const faceUpCard = s.tables.p1.faceUp[1];
    const t = swapCards(s, "p1", handCard, faceUpCard);
    expect(t.hands.p1[0]).toEqual(faceUpCard);
    expect(t.tables.p1.faceUp[1]).toEqual(handCard);
    assertInvariants(t, { fullDeck: true });
  });

  it("swap rejects cards you don't hold, and swapping after ready", () => {
    const s = dealt(2);
    expect(() => swapCards(s, "p1", s.hands.p2[0], s.tables.p1.faceUp[0])).toThrow(/not in your hand/);
    expect(() => swapCards(s, "p1", s.hands.p1[0], s.tables.p2.faceUp[0])).toThrow(/face-up/);
    const r = setReady(s, "p1", fixedDeps);
    expect(() => swapCards(r, "p1", r.hands.p1[0], r.tables.p1.faceUp[0])).toThrow(/already/);
  });

  it("play begins only when everyone is ready", () => {
    let s = dealt(3);
    s = setReady(s, "p1", fixedDeps);
    expect(s.phase).toBe("swapping");
    s = setReady(s, "p2", fixedDeps);
    expect(s.phase).toBe("swapping");
    s = setReady(s, "p3", fixedDeps);
    expect(s.phase).toBe("playing");
    expect(s.lastEvent?.kind).toBe("start");
  });

  it("unready reopens swapping for that player until the last player readies", () => {
    let s = dealt(3);
    s = setReady(s, "p1", fixedDeps);
    expect(s.ready.p1).toBe(true);
    s = setUnready(s, "p1");
    expect(s.ready.p1).toBe(false);
    expect(s.phase).toBe("swapping");
    // …and they can swap again
    const swapped = swapCards(s, "p1", s.hands.p1[0], s.tables.p1.faceUp[0]);
    expect(swapped.hands.p1[0]).toEqual(s.tables.p1.faceUp[0]);
    // Unready when not ready is a no-op
    expect(setUnready(s, "p1")).toBe(s);
    // Once everyone is ready play has begun and there is nothing to undo
    s = setReady(s, "p1", fixedDeps);
    s = setReady(s, "p2", fixedDeps);
    s = setReady(s, "p3", fixedDeps);
    expect(s.phase).toBe("playing");
    expect(() => setUnready(s, "p1")).toThrow(/swapping/);
  });

  it("ready is idempotent", () => {
    const s = setReady(dealt(2), "p1", fixedDeps);
    expect(setReady(s, "p1", fixedDeps)).toBe(s);
  });

  it("force start needs the host and every connected player ready; offline players are auto-readied", () => {
    let s = dealt(3);
    s = setReady(s, "p1", fixedDeps);
    expect(() => forceStart(s, "p2", fixedDeps)).toThrow(/host/);
    expect(() => forceStart(s, "p1", fixedDeps)).toThrow(/ready first/);
    s = setPlayerConnected(s, "p3", false);
    expect(() => forceStart(s, "p1", fixedDeps)).toThrow(/ready first/); // p2 still blocking
    s = setReady(s, "p2", fixedDeps);
    s = forceStart(s, "p1", fixedDeps);
    expect(s.phase).toBe("playing");
    expect(s.ready.p3).toBe(true);
  });

  it("the holder of the lowest non-wild card starts", () => {
    const s = readyAll(
      makeState({
        players: 3,
        phase: "swapping",
        hands: { p1: "Kh Qd Jc", p2: "4s 9d Ac", p3: "5h 6d 7c" },
        faceUp: { p1: "As Ks Qs", p2: "Kd Qc Jd", p3: "3d 8c 9c" },
      }),
    );
    expect(s.phase).toBe("playing");
    expect(currentPlayer(s)).toBe("p3"); // 3 in p3's face-up cards
    expect(s.lastEvent).toMatchObject({ kind: "start", playerId: "p3", lowestRank: "3" });
  });

  it("UK pub: 3 is wild so the scan starts at 4", () => {
    const s = readyAll(
      makeState({
        players: 2,
        rules: "ukpub",
        phase: "swapping",
        hands: { p1: "3h 9d Kc", p2: "4s Qd Ac" },
        faceUp: { p1: "As Ks Qs", p2: "Kd Qc Jd" },
      }),
    );
    expect(currentPlayer(s)).toBe("p2");
    expect(s.lastEvent).toMatchObject({ kind: "start", lowestRank: "4" });
  });

  it("nobody holding a non-wild card → random start with no lowest rank", () => {
    const s = readyAll(
      makeState({
        players: 2,
        phase: "swapping",
        hands: { p1: "2h 10d 7c", p2: "8s 2d 10c" },
        faceUp: { p1: "2s 10s 7s", p2: "8d 8c 7d" },
      }),
    );
    expect(s.phase).toBe("playing");
    expect(s.lastEvent).toMatchObject({ kind: "start", lowestRank: null });
  });
});

describe("playing from hand", () => {
  it("legal play goes on the pile and draws back to 3", () => {
    const s = makeState({
      hands: { p1: "4s 4d Kc", p2: "Qc" },
      stock: "9h 9d 9c 9s",
      pile: ["3h"],
    });
    const t = playCards(s, "p1", cs("4s 4d"));
    expect(keys(t.hands.p1)).toEqual(keys(cs("Kc 9h 9d")));
    expect(t.stock).toHaveLength(2);
    expect(t.pile.at(-1)).toEqual({ rank: "4", cards: cs("4s 4d") });
    expect(currentPlayer(t)).toBe("p2");
    expect(t.lastEvent).toMatchObject({
      kind: "play",
      playerId: "p1",
      nextPlayerId: "p2",
      source: "hand",
      burned: false,
      wentOut: false,
      skippedIds: [],
    });
    assertInvariants(t);
  });

  it("draw is bounded by the stock", () => {
    const s = makeState({ hands: { p1: "4s 4d 4c", p2: "Qc" }, stock: "9h", pile: [] });
    const t = playCards(s, "p1", cs("4s 4d 4c"));
    expect(keys(t.hands.p1)).toEqual(keys(cs("9h")));
    expect(t.stock).toHaveLength(0);
  });

  it("no draw while the hand is already 3 or more", () => {
    const s = makeState({ hands: { p1: "4s 5d 6c 7h 9h", p2: "Qc" }, stock: "Ah", pile: [] });
    const t = playCards(s, "p1", cs("4s"));
    expect(t.hands.p1).toHaveLength(4);
    expect(t.stock).toHaveLength(1);
  });

  it("rejects: wrong turn, empty, duplicates, mixed ranks, not owned, unplayable", () => {
    const s = makeState({ hands: { p1: "4s 4d Kc", p2: "Qc" }, pile: ["9h"] });
    expect(() => playCards(s, "p2", cs("Qc"))).toThrow(/not your turn/);
    expect(() => playCards(s, "p1", [])).toThrow(/at least one/);
    expect(() => playCards(s, "p1", cs("4s 4s"))).toThrow(/same card twice/);
    expect(() => playCards(s, "p1", cs("4s Kc"))).toThrow(/same rank/);
    expect(() => playCards(s, "p1", cs("Qc"))).toThrow(/not in your hand/);
    expect(() => playCards(s, "p1", cs("4s 4d"))).toThrow(/can't play 4s here — play 9 or higher/);
    expect(() => playCards(s, "p1", cs("4s"))).toThrow(/can't play a 4 here/);
  });

  it("wild cards ignore the requirement", () => {
    const s = makeState({
      rules: "millybims",
      hands: { p1: "2s 10d 7c 8h", p2: "Qc" },
      pile: ["Kh"],
    });
    for (const code of ["2s", "10d", "7c", "8h"]) {
      expect(() => playCards(s, "p1", [c(code)])).not.toThrow();
    }
  });

  it("UK pub: 7 and 8 must satisfy the requirement", () => {
    const s = makeState({ rules: "ukpub", hands: { p1: "7c 8h 3d", p2: "Qc" }, pile: ["Kh"] });
    expect(() => playCards(s, "p1", cs("7c"))).toThrow();
    expect(() => playCards(s, "p1", cs("8h"))).toThrow();
    expect(() => playCards(s, "p1", cs("3d"))).not.toThrow(); // invisible = wild
  });

  it("Millybims 7 then the constrained follow-up", () => {
    let s = makeState({ hands: { p1: "7c 5s 6s", p2: "Ah 9d 2c" }, pile: ["Kh"] });
    s = playCards(s, "p1", cs("7c"));
    expect(getPlayerView(s, "p2").requirement).toEqual({ kind: "max", rank: "K" });
    expect(() => playCards(s, "p2", cs("Ah"))).toThrow(/play king or lower/);
    s = playCards(s, "p2", cs("9d"));
    expect(getPlayerView(s, "p1").requirement).toEqual({ kind: "min", rank: "9" });
  });
});

describe("burns", () => {
  it("a 10 burns the pile and the same player goes again", () => {
    const s = makeState({ hands: { p1: "10s 4d Kc", p2: "Qc" }, pile: ["3h", "9d 9c"] });
    const t = playCards(s, "p1", cs("10s"));
    expect(t.pile).toEqual([]);
    expect(t.burnedCount).toBe(4);
    expect(currentPlayer(t)).toBe("p1");
    expect(t.lastEvent).toMatchObject({ kind: "play", burned: true, burnedCount: 4, nextPlayerId: "p1" });
    expect(getPlayerView(t, "p1").requirement).toEqual({ kind: "any" });
  });

  it("four of a kind played together burns", () => {
    const s = makeState({ hands: { p1: "9s 9d 9c 9h", p2: "Qc" }, pile: ["3h"] });
    const t = playCards(s, "p1", cs("9s 9d 9c 9h"));
    expect(t.pile).toEqual([]);
    expect(t.burnedCount).toBe(5);
    expect(currentPlayer(t)).toBe("p1");
  });

  it("completing four of a kind across players burns", () => {
    const s = makeState({ hands: { p1: "9c Ad Kd", p2: "Qc" }, pile: ["3h", "9s", "9h 9d"] });
    const t = playCards(s, "p1", cs("9c"));
    expect(t.pile).toEqual([]);
    expect(t.lastEvent).toMatchObject({ burned: true });
    expect(currentPlayer(t)).toBe("p1");
  });

  it("a card of another rank in between does not make four", () => {
    const s = makeState({ hands: { p1: "9c Ad Kd", p2: "Qc" }, pile: ["9s 9h", "8d", "9d"] });
    const t = playCards(s, "p1", cs("9c"));
    expect(t.pile).toHaveLength(4);
    expect(t.lastEvent).toMatchObject({ burned: false });
  });

  it("burning with your last card puts you out and passes the turn", () => {
    const s = makeState({ players: 3, hands: { p1: "10s", p2: "Qc", p3: "Qd" }, pile: ["3h"] });
    const t = playCards(s, "p1", cs("10s"));
    expect(t.finishedOrder).toEqual(["p1"]);
    expect(t.phase).toBe("playing");
    expect(currentPlayer(t)).toBe("p2");
    expect(t.lastEvent).toMatchObject({ burned: true, wentOut: true, nextPlayerId: "p2" });
    assertInvariants(t);
  });

  it("UK pub: four 8s burn rather than skip", () => {
    const s = makeState({
      players: 3,
      rules: "ukpub",
      hands: { p1: "8s 8d 8c 8h Kc", p2: "Qc", p3: "Qd" },
      pile: ["3h"],
    });
    const t = playCards(s, "p1", cs("8s 8d 8c 8h"));
    expect(t.pile).toEqual([]);
    expect(currentPlayer(t)).toBe("p1");
    expect(t.lastEvent).toMatchObject({ burned: true, skippedIds: [] });
  });
});

describe("UK pub skips", () => {
  it("one 8 skips one player", () => {
    const s = makeState({ players: 3, rules: "ukpub", hands: { p1: "8s Kc Qd" }, pile: ["5d"] });
    const t = playCards(s, "p1", cs("8s"));
    expect(currentPlayer(t)).toBe("p3");
    expect(t.lastEvent).toMatchObject({ skippedIds: ["p2"], nextPlayerId: "p3" });
  });

  it("two 8s skip two players (3 players → back to me)", () => {
    const s = makeState({ players: 3, rules: "ukpub", hands: { p1: "8s 8d Qd" }, pile: ["5d"] });
    const t = playCards(s, "p1", cs("8s 8d"));
    expect(currentPlayer(t)).toBe("p1");
    expect(t.lastEvent).toMatchObject({ skippedIds: ["p2", "p3"] });
  });

  it("two players: one 8 gives me another turn; two 8s hand it back", () => {
    const s = makeState({ players: 2, rules: "ukpub", hands: { p1: "8s 8d Qd" }, pile: ["5d"] });
    const one = playCards(s, "p1", cs("8s"));
    expect(currentPlayer(one)).toBe("p1");
    expect(one.lastEvent).toMatchObject({ skippedIds: ["p2"] });
    const two = playCards(s, "p1", cs("8s 8d"));
    expect(currentPlayer(two)).toBe("p2");
    expect(two.lastEvent).toMatchObject({ skippedIds: ["p2", "p1"] });
  });

  it("skips only count players still in the game", () => {
    const s = makeState({
      players: 4,
      rules: "ukpub",
      hands: { p1: "8s Kc Qd", p3: "Qc", p4: "Qh" },
      finishedOrder: ["p2"],
      pile: ["5d"],
    });
    const t = playCards(s, "p1", cs("8s"));
    expect(t.lastEvent).toMatchObject({ skippedIds: ["p3"] });
    expect(currentPlayer(t)).toBe("p4");
  });

  it("Millybims 8 does not skip", () => {
    const s = makeState({ players: 3, hands: { p1: "8s Kc Qd" }, pile: ["5d"] });
    expect(currentPlayer(playCards(s, "p1", cs("8s")))).toBe("p2");
  });
});

describe("picking up", () => {
  it("takes the whole pile into hand and passes the turn", () => {
    const s = makeState({ hands: { p1: "4s", p2: "Qc" }, pile: ["9h", "Kd Kc"] });
    const t = pickUpPile(s, "p1");
    expect(keys(t.hands.p1)).toEqual(keys(cs("4s 9h Kd Kc")));
    expect(t.pile).toEqual([]);
    expect(currentPlayer(t)).toBe("p2");
    expect(t.lastEvent).toMatchObject({ kind: "pickup", count: 3, nextPlayerId: "p2" });
    expect(getPlayerView(t, "p2").requirement).toEqual({ kind: "any" });
  });

  it("is allowed even when you could play", () => {
    const s = makeState({ hands: { p1: "As", p2: "Qc" }, pile: ["9h"] });
    expect(() => pickUpPile(s, "p1")).not.toThrow();
  });

  it("is refused on an empty pile or out of turn", () => {
    const s = makeState({ hands: { p1: "As", p2: "Qc" }, pile: [] });
    expect(() => pickUpPile(s, "p1")).toThrow(/pile is empty/);
    expect(() => pickUpPile(makeState({ pile: ["9h"] }), "p2")).toThrow(/not your turn/);
  });

  it("picking up while on face-up cards puts you back on your hand", () => {
    const s = makeState({ hands: { p1: "" }, faceUp: { p1: "3c" }, pile: ["Kh"] });
    const t = pickUpPile(s, "p1");
    expect(t.hands.p1).toEqual(cs("Kh"));
    expect(t.tables.p1.faceUp).toEqual(cs("3c"));
    expect(getPlayerView({ ...t, currentPlayerIndex: 0 }, "p1").you.source).toBe("hand");
  });
});

describe("source order", () => {
  it("face-up cards cannot be played while the hand has cards", () => {
    const s = makeState({ hands: { p1: "4s" }, faceUp: { p1: "Ks" }, pile: [] });
    expect(() => playCards(s, "p1", cs("Ks"))).toThrow(/not in your hand/);
  });

  it("face-up cards are playable once the hand is empty (several at once)", () => {
    const s = makeState({ hands: { p1: "" }, faceUp: { p1: "Ks Kd 4c" }, pile: ["9h"] });
    const t = playCards(s, "p1", cs("Ks Kd"));
    expect(t.tables.p1.faceUp).toEqual(cs("4c"));
    expect(t.lastEvent).toMatchObject({ source: "faceUp" });
  });

  it("cannot flip while holding hand or face-up cards", () => {
    const withHand = makeState({ hands: { p1: "4s" }, faceDown: { p1: "Ks Kd Kc" } });
    expect(() => flipBlind(withHand, "p1", 0)).toThrow(/hand first/);
    const withFaceUp = makeState({ hands: { p1: "" }, faceUp: { p1: "4s" }, faceDown: { p1: "Ks Kd Kc" } });
    expect(() => flipBlind(withFaceUp, "p1", 0)).toThrow(/face-up cards first/);
  });

  it("playing when only blind cards remain tells you to flip", () => {
    const s = makeState({ hands: { p1: "" }, faceDown: { p1: "Ks Kd Kc" } });
    expect(() => playCards(s, "p1", cs("Ks"))).toThrow(/flip a face-down card/);
  });
});

describe("blind flips", () => {
  it("a legal flip is played, the slot empties, turn passes", () => {
    const s = makeState({ hands: { p1: "" }, faceDown: { p1: "Ks 3c 10h" }, pile: ["Qd"] });
    const t = flipBlind(s, "p1", 0);
    expect(t.tables.p1.faceDown).toEqual([null, c("3c"), c("10h")]);
    expect(t.pile.at(-1)).toEqual({ rank: "K", cards: cs("Ks") });
    expect(currentPlayer(t)).toBe("p2");
    expect(t.lastEvent).toMatchObject({ kind: "flip", card: c("Ks"), burned: false, wentOut: false });
    assertInvariants(t);
  });

  it("an illegal flip sends the card and the pile to your hand", () => {
    const s = makeState({ hands: { p1: "" }, faceDown: { p1: "Ks 3c 10h" }, pile: ["Qd", "Qh"] });
    const t = flipBlind(s, "p1", 1);
    expect(keys(t.hands.p1)).toEqual(keys(cs("Qd Qh 3c")));
    expect(t.pile).toEqual([]);
    expect(t.tables.p1.faceDown).toEqual([c("Ks"), null, c("10h")]);
    expect(currentPlayer(t)).toBe("p2");
    expect(t.lastEvent).toMatchObject({ kind: "flip_fail", card: c("3c"), pickedUp: 3, nextPlayerId: "p2" });
    assertInvariants(t);
  });

  it("flipping a 10 burns and you flip again", () => {
    const s = makeState({ hands: { p1: "" }, faceDown: { p1: "Ks 3c 10h" }, pile: ["Qd"] });
    const t = flipBlind(s, "p1", 2);
    expect(t.pile).toEqual([]);
    expect(currentPlayer(t)).toBe("p1");
    expect(t.lastEvent).toMatchObject({ kind: "flip", burned: true, burnedCount: 2 });
  });

  it("a flip can complete four of a kind", () => {
    const s = makeState({ hands: { p1: "" }, faceDown: { p1: "9s - -" }, pile: ["9h 9d", "9c"] });
    const t = flipBlind(s, "p1", 0);
    expect(t.lastEvent).toMatchObject({ kind: "flip", burned: true, wentOut: true });
    expect(t.phase).toBe("complete"); // 2 players: p1 out → p2 is the 💩head
  });

  it("the last blind card failing does not put you out", () => {
    const s = makeState({ hands: { p1: "" }, faceDown: { p1: "3s - -" }, pile: ["Kd"] });
    const t = flipBlind(s, "p1", 0);
    expect(t.finishedOrder).toEqual([]);
    expect(t.hands.p1).toEqual(cs("Kd 3s"));
    expect(t.phase).toBe("playing");
  });

  it("rejects bad or empty slots", () => {
    const s = makeState({ hands: { p1: "" }, faceDown: { p1: "Ks - 10h" } });
    expect(() => flipBlind(s, "p1", 3)).toThrow(/Invalid/);
    expect(() => flipBlind(s, "p1", -1)).toThrow(/Invalid/);
    expect(() => flipBlind(s, "p1", 1)).toThrow(/already gone/);
  });
});

describe("going out and finishing", () => {
  it("playing your last card puts you out; with 2 players the game completes", () => {
    const s = makeState({ hands: { p1: "Ks", p2: "Qc" }, pile: ["9d"] });
    const t = playCards(s, "p1", cs("Ks"));
    expect(t.finishedOrder).toEqual(["p1"]);
    expect(t.phase).toBe("complete");
    expect(t.lastEvent).toMatchObject({ wentOut: true, nextPlayerId: null });
    const result = getGameCompleteResult(t);
    expect(result.pooheadId).toBe("p2");
    expect(result.standings.map((x) => [x.playerId, x.place, x.isPoohead])).toEqual([
      ["p1", 1, false],
      ["p2", 2, true],
    ]);
    expect(result.finalCards.p2.hand).toEqual(cs("Qc"));
  });

  it("with 3 players the game continues until one is left", () => {
    let s = makeState({
      players: 3,
      hands: { p1: "Ks", p2: "Ac", p3: "Jd" },
      faceDown: { p2: "As - -" },
      pile: ["9d"],
    });
    s = playCards(s, "p1", cs("Ks"));
    expect(s.phase).toBe("playing");
    expect(currentPlayer(s)).toBe("p2");
    s = playCards(s, "p2", cs("Ac")); // p2 still has a blind card
    expect(currentPlayer(s)).toBe("p3");
    s = pickUpPile(s, "p3"); // p3 picks up; p1 is out so p2 is next
    expect(currentPlayer(s)).toBe("p2");
    s = flipBlind(s, "p2", 0); // As on an empty pile → legal, p2 out
    expect(s.phase).toBe("complete");
    expect(getGameCompleteResult(s).pooheadId).toBe("p3");
    expect(getGameCompleteResult(s).standings.map((x) => x.playerId)).toEqual(["p1", "p2", "p3"]);
    expect(getGameCompleteResult(s).finalCards.p3.hand.length).toBeGreaterThan(0);
  });

  it("getGameCompleteResult refuses an unfinished game", () => {
    expect(() => getGameCompleteResult(makeState())).toThrow(/not complete/);
  });

  it("finished players are skipped in the turn order", () => {
    const s = makeState({
      players: 3,
      hands: { p1: "Ks Kd", p3: "Qd" },
      finishedOrder: ["p2"],
      pile: ["9d"],
    });
    const t = playCards(s, "p1", cs("Ks"));
    expect(currentPlayer(t)).toBe("p3");
  });
});

describe("views", () => {
  it("never leaks face-down card identities before the end", () => {
    const s = makeState({
      hands: { p1: "Ks", p2: "Qc" },
      faceUp: { p1: "4s 5s", p2: "6d" },
      faceDown: { p1: "As Ad -", p2: "Ah - Ac" },
      pile: ["3h", "9s 9d"],
      stock: "2c 2d",
    });
    const view = getPlayerView(s, "p1");
    const json = JSON.stringify(view);
    expect(json).not.toContain('"rank":"A"');
    expect(view.you.faceDownSlots).toEqual([true, true, false]);
    expect(view.you.faceDownCount).toBe(2);
    expect(view.players[1].faceUp).toEqual(cs("6d"));
    expect(view.players[1].faceDownSlots).toEqual([true, false, true]);
    expect(view.players[1].handCount).toBe(1);
    expect(view.pile).toEqual(cs("3h 9s 9d"));
    expect(view.lastPlayCount).toBe(2);
    expect(view.stockCount).toBe(2);
    expect(view.requirement).toEqual({ kind: "min", rank: "9" });
    expect(view.you.source).toBe("hand");
    expect(view.currentPlayerId).toBe("p1");
    expect(view.rules).toBe("millybims");
  });

  it("reports out players and finishing places", () => {
    const s = makeState({ players: 3, hands: { p1: "Ks", p3: "Qd" }, finishedOrder: ["p2"] });
    const view = getPlayerView(s, "p1");
    expect(view.players[1]).toMatchObject({ isOut: true, finishedPlace: 1, handCount: 0 });
    expect(view.players[0]).toMatchObject({ isOut: false, finishedPlace: null });
  });

  it("source is null outside the playing phase", () => {
    const s = dealt(2);
    expect(getPlayerView(s, "p1").you.source).toBeNull();
    expect(getPlayerView(s, "p1").currentPlayerId).toBeNull();
  });
});

describe("test hook", () => {
  it("overwrites only the given fields and can jump to playing", () => {
    const s = dealt(2);
    const t = applyTestForce(s, "p2", {
      type: "_test_force",
      hand: cs("Ks"),
      faceDown: [null, null, null],
      stock: [],
      pile: [cs("3h"), cs("9s 9d")],
      makeCurrent: true,
      phase: "playing",
    });
    expect(t.phase).toBe("playing");
    expect(currentPlayer(t)).toBe("p2");
    expect(t.hands.p2).toEqual(cs("Ks"));
    expect(t.tables.p2.faceUp).toEqual(s.tables.p2.faceUp); // untouched
    expect(t.pile).toEqual([
      { rank: "3", cards: cs("3h") },
      { rank: "9", cards: cs("9s 9d") },
    ]);
    expect(t.stock).toEqual([]);
    expect(Object.values(t.ready).every(Boolean)).toBe(true);
  });
});

describe("full random games keep their invariants", () => {
  it("plays 40 random games to completion without violating invariants", () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const deps = {
      shuffle: (cards: typeof s.stock) => {
        const out = [...cards];
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      },
      randomIndex: (n: number) => Math.floor(rand() * n),
    };
    let s = createGame("x");
    for (let game = 0; game < 40; game++) {
      const n = 2 + (game % 4);
      const rules = (["standard", "ukpub", "millybims"] as const)[game % 3];
      s = createGame("x");
      for (let i = 0; i < n; i++) s = addPlayer(s, P[i], P[i], "cat");
      s = finishDealing(startGame(s, "p1", rules, deps));
      for (const p of s.players) s = setReady(s, p.playerId, deps);
      let turns = 0;
      while (s.phase === "playing" && turns < 2000) {
        turns++;
        const me = currentPlayer(s);
        const view = getPlayerView(s, me);
        const source = view.you.source;
        if (source === "blind") {
          const slot = view.you.faceDownSlots.findIndex(Boolean);
          s = flipBlind(s, me, slot);
        } else {
          const zone = source === "hand" ? view.you.hand : view.you.faceUp;
          const rules = view.rules;
          const playable = zone.filter((card) =>
            canPlay(card.rank, view.requirement, rules),
          );
          if (playable.length === 0 || (view.pile.length > 0 && rand() < 0.05)) {
            s = pickUpPile(s, me);
          } else {
            const pick = playable[Math.floor(rand() * playable.length)];
            const all = zone.filter((card) => card.rank === pick.rank);
            const count = 1 + Math.floor(rand() * all.length);
            s = playCards(s, me, all.slice(0, count));
          }
        }
        assertInvariants(s, { fullDeck: true });
      }
      expect(s.phase).toBe("complete");
      const result = getGameCompleteResult(s);
      expect(result.standings).toHaveLength(n);
      expect(new Set(result.standings.map((x) => x.playerId)).size).toBe(n);
    }
  });
});

// Local import to keep the random-game test self-contained.
import { RULE_SETS, canPlayRank } from "../shared/rules.ts";
import type { Rank } from "../shared/types.ts";
import type { Requirement, RuleSetId } from "../shared/rules.ts";
function canPlay(rank: Rank, req: Requirement, rules: RuleSetId): boolean {
  return canPlayRank(rank, req, RULE_SETS[rules]);
}
