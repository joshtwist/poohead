# 💩head

A link-to-play version of the card game Shithead (also known as Karma or
Palace) for 2–5 players, built for phones and iPads. No accounts, no
installs: one person creates a game, shares the link, everyone plays in
the browser. Part of the [playcards.free](https://playcards.free) family,
live at **https://poohead.playcards.free**.

Descended from [joshtwist/rummy](https://github.com/joshtwist/rummy): the
same Cloudflare Worker + Durable Object engine, React client and share-a-
link flow, with the rules module and the whole table UI swapped out.

## How to play

Everyone gets three **face-down** cards, three **face-up** cards on top of
them, and three cards in **hand**. Before play starts you may swap hand
cards with your face-up cards, then tap **Ready**.

- On your turn play one or more cards of the **same rank** that beat the
  pile, or **pick up** the whole pile into your hand.
- You play from your hand first, then your face-up cards, and finally your
  face-down cards — flipped blind, one at a time. If a blind card can't be
  played you take the pile.
- While the stock lasts you draw back up to three cards in hand.
- A **2** can be played on anything and resets the pile. A **10** can be
  played on anything and **burns** the pile (so does four of a kind on
  top) — you go again.
- No cards left in any of the three places and you're out. The last player
  still holding cards is the **💩head**.

Ranks run 3 < 4 < … < 9 < J < Q < K < A. Suits never matter.

### Rule sets

The host picks one in the lobby.

| | Standard | UK pub | Millybims (default) |
|---|---|---|---|
| 2 resets, 10 burns, four of a kind burns | ✓ | ✓ | ✓ |
| 3 | — | invisible: play on anything, next player faces the card beneath | — |
| 7 | — | next player must play 7 or lower | wild; next player must play equal or lower than the card the 7 landed on (7 on empty → 7 or lower, 7 on a 2 → anything) |
| 8 | — | skips the next player (two 8s skip two) | invisible: play on anything, the next player faces exactly what you faced |

`src/shared/rules.ts` holds the presets and the pure functions that turn a
pile into a requirement; the same code runs on the server (to validate)
and in the client (to highlight playable cards).

## Development

```bash
pnpm install
pnpm start          # vite on :5173 + wrangler dev on :8787
```

Open http://localhost:5173, create a game, then open the game link in a
second browser profile (or an incognito window — each needs its own
localStorage) to join as a second player.

| Command | What it does |
|---|---|
| `pnpm typecheck` | Type-checks the client and the Worker |
| `pnpm test:unit` | Vitest: rules + engine (deterministic decks, random full games with invariants) |
| `pnpm test` | Playwright end-to-end on iPhone, iPhone SE, iPad portrait, iPad landscape and desktop |
| `pnpm test e2e/screenshot.spec.ts` | Captures each screen per viewport into `e2e/screenshots/` |
| `pnpm build` | Production build into `dist/` |

The e2e specs reach specific positions through a `_test_force` WebSocket
message that the Worker only honours when `TEST_HOOKS=1` (set in
`.dev.vars`, never in production).

## Architecture

```
src/shared/     types, rules presets + requirement logic, wire protocol
src/server/     Worker entry, GameRoom Durable Object, pure game engine
src/client/     React app (Vite, Tailwind 4, Framer Motion)
e2e/            Playwright specs + helpers
```

- **One Durable Object per game.** `GameRoom` holds the full state under a
  single storage key, tags each hibernating WebSocket with its playerId,
  and after every mutation saves and broadcasts a personalised
  `StateMessage` to every connection (face-down cards are never sent
  until the game is over).
- **Pure engine.** `src/server/game-engine.ts` is a set of
  `(state, …) => state` reducers that throw player-facing errors; the DO
  turns them into `{ type: "error" }` messages.
- **Responsive board.** `src/client/lib/layout.ts` computes a layout tier
  from the viewport (`compact`, `phone`, `tablet`, `tabletWide`) and the
  board sizes every card from it, so the table never scrolls vertically
  on a phone or an iPad. A long hand compresses, then scrolls
  horizontally.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`: typecheck → unit
tests → build → `wrangler deploy`. The workflow needs two repository
secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
`wrangler.toml` binds the Worker to the custom domain
`poohead.playcards.free` on the existing zone.
