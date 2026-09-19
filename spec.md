# 💩head — game specification

This is the reference for the rules the engine implements and the wire
protocol between the client and the `GameRoom` Durable Object. The code
in `src/shared/rules.ts` and `src/server/game-engine.ts` is the source of
truth; this document explains the decisions.

## Setup

- 2–5 players, one standard 52-card deck, no jokers.
- Each player is dealt, in order: 3 face-down cards (one per **slot**
  0–2), 3 face-up cards on top of them, 3 hand cards. The rest is the
  **stock**.
- Phases: `lobby → dealing → swapping → playing → complete`. The DO moves
  `dealing → swapping` on a 3.5s alarm so clients can animate the deal.

## Swapping

- Any player may swap a hand card with one of their own face-up cards, as
  often as they like, until they tap **Ready**. Ready is final.
- Play starts when everyone is ready. The host may **force start** once
  every *connected* player is ready; disconnected players are auto-readied.

## Starting player

The player holding the lowest non-wild rank (scanning 3, 4, … A) across
hand + face-up cards starts; ties are broken at random. If nobody holds a
non-wild card, a random player starts. The starter may open with any
legal play.

## A turn

The current player either **plays** or **picks up**.

- **Play** 1+ cards of a single rank from the current **source**. The
  source is strict: the hand while it has cards, then the face-up cards,
  then the face-down cards.
- Every card in the play must be of one rank; the rank must satisfy the
  pile's **requirement** (below). Wild ranks always satisfy it.
- After a play from the hand, the player draws from the stock until they
  hold 3 cards (or the stock runs out). A hand that grew past 3 after a
  pick-up draws nothing until it drops below 3 again.
- **Face-down play** is a **flip**: the player picks a slot; the card is
  revealed to everyone. If it is legal it is played with all effects. If
  not, the player takes the card *and* the pile into their hand and the
  turn passes.
- **Pick up**: the whole pile goes into the player's hand and the turn
  passes; the next player faces an empty pile ("anything goes"). Allowed
  whenever it's your turn and the pile is non-empty.

## Burns

The pile is **burned** (removed from the game, counted in `burnedCount`)
when a 10 is played or when the top four cards of the pile share a rank
(played together or completed across turns — any rank, including 2s and
invisible ranks). The same player goes again on the empty pile, unless
the burn emptied their last source, in which case they are out and the
turn passes. A burn cancels any skip the play would have caused.

## Going out and finishing

A player with no hand, face-up or face-down cards is **out**; the order
players go out is the ranking. When only one player still holds cards the
game is **complete** and that player is the **💩head**. Their remaining
cards (including face-down ones) are revealed on the end screen. A rematch
creates a fresh room and every client is offered the link.

## Requirement

The pile is stored as a list of **plays** (`{ rank, cards }`) so the rule
engine can look beneath a play. The requirement is a pure function of the
pile and the rule set:

```
requirementAt(plays, rules):
  skip down past invisible plays; nothing left → ANY
  r = rank of that play
  r == 2 → ANY
  r == 7:
    sevenOrLower        → MAX 7
    lowerThanPrevious   → b = next non-invisible play below
                          none → MAX 7; b == 2 → ANY; else MAX b
    none                → MIN 7
  otherwise → MIN r

canPlayRank(rank, req, rules):
  wild(rank) → true; ANY → true; MIN → power(rank) ≥ power(req);
  MAX → power(rank) ≤ power(req)
```

Rank power: 2 = 0, 3–9 as printed, 10, J = 11, Q = 12, K = 13, A = 14.

## Rule sets

| id | 7 | 7 wild | invisible (wild + transparent) | skip |
|---|---|---|---|---|
| `standard` | none | no | — | — |
| `ukpub` | next plays 7 or lower | no | 3 | 8 (one player per 8) |
| `millybims` (default) | next plays ≤ the card the 7 landed on | yes | 8 | — |

Always on: 2 (wild, resets), 10 (wild, burns), four of a kind burns.

Worked examples under Millybims (bottom → top): `K 7` → K or lower ·
`K 7 7` → 7 or lower · `7` on empty → 7 or lower · `2 7` → anything ·
`K 8 7` → K or lower · `K 7 8` → the player after the 8 still faces K or
lower · `K 7 4` → 4 or higher. Under UK pub the 7 and 8 are not wild, so
an 8 must itself satisfy the requirement before it skips; skips only
count players who are still in.

## Protocol

Client → server: `join`, `reconnect`, `start_game {rules}`,
`swap {handCard, faceUpCard}`, `ready`, `force_start`, `play {cards}`,
`flip {slot}`, `pick_up`, `create_rematch`, `ping`, and the test-only
`_test_force` (ignored unless the Worker runs with `TEST_HOOKS=1`).

Server → client: a personalised `state` after every mutation, plus
`lobby_info` (for connections that haven't joined), `error`,
`player_reconnected` / `player_disconnected`, `game_complete` (standings +
every player's final cards) and `pong`.

`state.lastEvent` carries exactly one event per mutation — `start`,
`play`, `flip`, `flip_fail` or `pickup` — with `burned`, `skippedIds` and
`wentOut` as flags, so a client can build every banner and animation from
a single record and dedupe by its `seq`.

Face-down cards are never included in `state`; other players only see
which slots still hold a card. They appear once, in `game_complete`.
