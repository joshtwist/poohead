import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import type { Card, PlayerIcon, Rank, Suit } from "../src/shared/types.ts";
import type { RuleSetId } from "../src/shared/rules.ts";
import type { TestForceMessage } from "../src/shared/protocol.ts";

/**
 * Shared helpers for multi-player 💩head tests.
 *
 * Each player gets an isolated browser context (own localStorage, own
 * playerId). Deterministic positions come from the `_test_force` WebSocket
 * hook, which the Worker only honours with TEST_HOOKS=1 (.dev.vars).
 */

export interface Player {
  name: string;
  ctx: BrowserContext;
  page: Page;
}

export const NAMES = ["Alice", "Bob", "Carol", "Dan", "Eve"];
export const ICONS: PlayerIcon[] = ["cat", "dog", "bird", "fish", "rabbit"];

// ── Cards ────────────────────────────────────────────────────────────

const SUITS: Record<string, Suit> = {
  h: "hearts",
  d: "diamonds",
  c: "clubs",
  s: "spades",
};

/** "Ks" → { suit: "spades", rank: "K" }; "10h" → the ten of hearts. */
export function c(code: string): Card {
  const suit = SUITS[code.slice(-1)];
  const rank = code.slice(0, -1) as Rank;
  if (!suit || !rank) throw new Error(`Bad card code: ${code}`);
  return { suit, rank };
}

/** "Ks 3c 10h" → three cards. */
export function cs(codes: string): Card[] {
  return codes.trim().split(/\s+/).map(c);
}

/** The `<suit>-<rank>` fragment used in test ids. */
export function key(code: string): string {
  const card = c(code);
  return `${card.suit}-${card.rank}`;
}

// ── Contexts & joining ───────────────────────────────────────────────

/** Attach error logging so failures surface console errors. */
export function attachErrorLogging(page: Page, label: string): void {
  page.on("pageerror", (err) => {
    console.log(`[${label} pageerror]`, err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[${label} console]`, msg.text());
    }
  });
}

/**
 * A fresh context that inherits the current project's device emulation
 * (viewport, touch, UA). `browser.newContext()` alone would ignore it.
 */
export async function newPlayerContext(browser: Browser): Promise<BrowserContext> {
  const use = test.info().project.use;
  return browser.newContext({
    viewport: use.viewport ?? undefined,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    baseURL: use.baseURL,
  });
}

/** Fill in the join form and submit. */
export async function joinAs(page: Page, name: string, icon: PlayerIcon): Promise<void> {
  await page.getByTestId("name-input").fill(name);
  await page.getByTestId(`icon-${icon}`).click();
  await page.getByTestId("join-btn").click();
  await expect(page.getByTestId(`lobby-player-${name}`)).toBeVisible({ timeout: 5_000 });
}

/** Create a game from the homepage and join it as the host (Alice). */
export async function createGame(browser: Browser): Promise<{ host: Player; gameId: string }> {
  const ctx = await newPlayerContext(browser);
  const page = await ctx.newPage();
  attachErrorLogging(page, NAMES[0]);
  await page.goto("/");
  await page.getByTestId("create-game-btn").click();
  await page.waitForURL(/\/[a-z0-9]{4,8}$/, { timeout: 10_000 });
  const gameId = new URL(page.url()).pathname.slice(1);
  await joinAs(page, NAMES[0], ICONS[0]);
  return { host: { name: NAMES[0], ctx, page }, gameId };
}

/** Join an existing game as the i-th player (Bob, Carol, …). */
export async function joinGame(browser: Browser, gameId: string, i: number): Promise<Player> {
  const ctx = await newPlayerContext(browser);
  const page = await ctx.newPage();
  attachErrorLogging(page, NAMES[i]);
  await page.goto(`/${gameId}`);
  await joinAs(page, NAMES[i], ICONS[i]);
  return { name: NAMES[i], ctx, page };
}

/** Host + (n-1) guests, all sitting in the lobby. */
export async function setupPlayers(
  browser: Browser,
  n: number,
): Promise<{ players: Player[]; gameId: string; pages: Page[] }> {
  const { host, gameId } = await createGame(browser);
  const players: Player[] = [host];
  for (let i = 1; i < n; i++) {
    players.push(await joinGame(browser, gameId, i));
  }
  for (const p of players) {
    await expect(host.page.getByTestId(`lobby-player-${p.name}`)).toBeVisible();
  }
  return { players, gameId, pages: players.map((p) => p.page) };
}

export async function closeAll(players: Player[]): Promise<void> {
  for (const p of players) await p.ctx.close();
}

// ── Phases ───────────────────────────────────────────────────────────

/** Host picks the rules (optional) and deals. */
export async function startGame(host: Page, rules?: RuleSetId): Promise<void> {
  if (rules) await host.getByTestId(`rules-${rules}`).click();
  await host.getByTestId("start-game-btn").click();
}

export async function waitForPhase(
  page: Page,
  phase: "swapping" | "playing" | "complete",
  timeout = 20_000,
): Promise<void> {
  await expect(page.getByTestId("game-board")).toHaveAttribute("data-phase", phase, { timeout });
}

/** The deal animation runs ~3.5s before the server opens the swap phase. */
export async function waitForSwapping(pages: Page[]): Promise<void> {
  for (const p of pages) await waitForPhase(p, "swapping");
}

/** Everyone taps Ready; resolves once every page is in the playing phase. */
export async function readyAll(pages: Page[]): Promise<void> {
  await waitForSwapping(pages);
  for (const p of pages) await p.getByTestId("ready-btn").click();
  for (const p of pages) await waitForPhase(p, "playing");
}

// ── Test hooks ───────────────────────────────────────────────────────

/** Send a raw client message over the page's live WebSocket (dev only). */
export async function sendWs(page: Page, msg: object): Promise<void> {
  await page.evaluate((m) => {
    const ws = (window as unknown as { __ws?: WebSocket }).__ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("No open window.__ws");
    ws.send(JSON.stringify(m));
  }, msg);
}

/** Overwrite the sender's hand / table / the shared stock & pile. */
export async function forceState(
  page: Page,
  force: Omit<TestForceMessage, "type">,
): Promise<void> {
  await sendWs(page, { type: "_test_force", ...force });
}

// ── Turn helpers ─────────────────────────────────────────────────────

export async function isMyTurn(page: Page): Promise<boolean> {
  return (await page.getByTestId("game-board").getAttribute("data-my-turn")) === "true";
}

export async function expectMyTurn(page: Page): Promise<void> {
  await expect(page.getByTestId("game-board")).toHaveAttribute("data-my-turn", "true");
}

export async function expectNotMyTurn(page: Page): Promise<void> {
  await expect(page.getByTestId("game-board")).not.toHaveAttribute("data-my-turn", "true");
}

/** Exactly one page must have the turn; returns it and the rest. */
export async function findActivePage(pages: Page[]): Promise<{ active: Page; others: Page[] }> {
  await expect
    .poll(
      async () => {
        let n = 0;
        for (const p of pages) if (await isMyTurn(p)) n++;
        return n;
      },
      { timeout: 10_000 },
    )
    .toBe(1);
  for (const p of pages) {
    if (await isMyTurn(p)) return { active: p, others: pages.filter((o) => o !== p) };
  }
  throw new Error("No active page");
}

// ── Cards on screen ──────────────────────────────────────────────────

export function handCard(page: Page, code: string): Locator {
  return page.getByTestId(`hand-card-${key(code)}`);
}

export function faceUpCard(page: Page, code: string): Locator {
  return page.getByTestId(`faceup-card-${key(code)}`);
}

export function pileTop(page: Page, code: string): Locator {
  return page.getByTestId(`pile-top-${key(code)}`);
}

/**
 * Fanned hand cards overlap on their RIGHT (later cards sit on top), so
 * tap near the left edge where every card is guaranteed uncovered.
 */
const CARD_TAP = { position: { x: 12, y: 24 } };

export async function selectCards(page: Page, codes: string[]): Promise<void> {
  for (const code of codes) await handCard(page, code).click(CARD_TAP);
}

export async function playCards(page: Page, codes: string[]): Promise<void> {
  await selectCards(page, codes);
  await page.getByTestId("play-btn").click();
}

export async function playFaceUp(page: Page, codes: string[]): Promise<void> {
  for (const code of codes) await faceUpCard(page, code).click();
  await page.getByTestId("play-btn").click();
}

/**
 * Pick up the pile. When the player still has a legal play the button
 * arms first ("Really pick up?") and needs a second tap.
 */
export async function pickUp(page: Page): Promise<void> {
  const btn = page.getByTestId("pickup-btn");
  await btn.click();
  if ((await btn.getAttribute("data-armed")) === "true") await btn.click();
}

export async function flipSlot(page: Page, slot: number): Promise<void> {
  await page.getByTestId(`blind-slot-${slot}`).click();
  await page.getByTestId("flip-btn").click();
}

// ── Assertions ───────────────────────────────────────────────────────

export async function expectRequirement(page: Page, text: string): Promise<void> {
  await expect(page.getByTestId("requirement-chip")).toHaveText(text);
}

/** Banners are short-lived (1–2.5s), so assert right after the action. */
export async function expectBanner(page: Page, kind: string, timeout = 6_000): Promise<void> {
  await expect(
    page.locator(`[data-testid="event-banner"][data-kind="${kind}"]`),
  ).toBeVisible({ timeout });
}

/** Board-wide emoji showers (💩 on a pick-up, 🎉 on going out) last ~3s. */
export async function expectRain(
  page: Page,
  kind: "poo" | "confetti",
  timeout = 6_000,
): Promise<void> {
  await expect(
    page.locator(`[data-testid="emoji-rain"][data-kind="${kind}"]`),
  ).toBeVisible({ timeout });
}

export async function expectHandCount(page: Page, n: number): Promise<void> {
  await expect(page.getByTestId("player-hand")).toHaveAttribute("data-count", String(n));
}

export async function expectPileCount(page: Page, n: number): Promise<void> {
  await expect(page.getByTestId("pile")).toHaveAttribute("data-count", String(n));
}

export async function expectStockCount(page: Page, n: number): Promise<void> {
  await expect(page.getByTestId("stock")).toHaveAttribute("data-count", String(n));
}
