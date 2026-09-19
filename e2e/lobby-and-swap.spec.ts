import { test, expect } from "@playwright/test";
import {
  closeAll,
  cs,
  expectBanner,
  expectHandCount,
  faceUpCard,
  findActivePage,
  forceState,
  handCard,
  key,
  setupPlayers,
  startGame,
  waitForPhase,
  waitForSwapping,
} from "./helpers.ts";

/**
 * Lobby → deal → swap → ready gating, with three players.
 */
test("lobby, deal, swap and ready gating", async ({ browser }) => {
  const { players, pages } = await setupPlayers(browser, 3);
  const [alice, bob, carol] = players;
  try {
    // Only the host sees the rules picker; Millybims is the default.
    await expect(alice.page.getByTestId("rules-millybims")).toHaveAttribute("data-selected", "true");
    await expect(alice.page.getByTestId("rules-ukpub")).toBeVisible();
    await expect(bob.page.getByTestId("rules-millybims")).toHaveCount(0);
    await expect(alice.page.getByTestId("lobby-count")).toHaveText("Players (3/5)");
    await expect(alice.page.getByTestId("share-btn")).toBeVisible();
    await expect(bob.page.getByTestId("start-game-btn")).toHaveCount(0);

    await startGame(alice.page);
    await expect(alice.page.getByTestId("deal-animation")).toBeVisible();
    await waitForSwapping(pages);

    // The swap phase explains itself
    await expect(alice.page.getByTestId("swap-callout")).toContainText("Set up your table");

    // 3 hand + 3 face-up + 3 face-down each
    await expectHandCount(alice.page, 3);
    await expect(alice.page.locator('[data-testid^="faceup-card-"]')).toHaveCount(3);
    await expect(alice.page.locator('[data-testid^="blind-slot-"]')).toHaveCount(3);
    // Face-up cards are public…
    await expect(bob.page.locator('[data-testid^="opp-faceup-Alice-"]')).toHaveCount(3);
    // …hands are not (only a count)
    await expect(bob.page.getByTestId("opponent-Alice-hand-count")).toHaveAttribute("data-count", "3");

    // Swap a hand card with a face-up card
    await forceState(alice.page, { hand: cs("2h 3d Jc"), faceUp: cs("7d 9s Ad") });
    await expect(handCard(alice.page, "2h")).toBeVisible();
    await handCard(alice.page, "2h").click({ position: { x: 12, y: 24 } });
    await expect(alice.page.getByTestId("action-hint")).toContainText("tap a face-up card");
    // …and the three face-up cards light up as targets
    await expect(alice.page.getByTestId("my-table").locator('[data-target="true"]')).toHaveCount(3);
    await faceUpCard(alice.page, "7d").click();
    await expect(faceUpCard(alice.page, "2h")).toBeVisible();
    await expect(handCard(alice.page, "7d")).toBeVisible();
    await expect(alice.page.locator('[data-testid^="faceup-card-"]')).toHaveCount(3);
    // The two cards fly past each other, then settle fully opaque in place
    await expect(alice.page.getByTestId("swap-flight")).toHaveCount(0);
    await expect(faceUpCard(alice.page, "2h").locator("..")).toHaveCSS("opacity", "1");
    await expect(handCard(alice.page, "7d").locator("> div").first()).toHaveCSS("opacity", "1");
    await expect(alice.page.getByTestId("my-table").locator('[data-target="true"]')).toHaveCount(0);
    // Table-first works too: every hand card becomes a target until you change your mind
    await faceUpCard(alice.page, "9s").click();
    await expect(handCard(alice.page, "3d")).toHaveAttribute("data-target", "true");
    await faceUpCard(alice.page, "9s").click();
    await expect(handCard(alice.page, "3d")).not.toHaveAttribute("data-target", "true");
    // Everyone sees the new face-up card
    await expect(bob.page.getByTestId(`opp-faceup-Alice-${key("2h")}`)).toBeVisible();

    // Ready gating: nothing starts until the last player is ready
    await alice.page.getByTestId("ready-btn").click();
    await expect(alice.page.getByTestId("ready-btn")).toBeDisabled();
    await expect(carol.page.getByTestId("status-bar")).toContainText("1/3 ready");
    await expect(bob.page.getByTestId("opponent-Alice-ready")).toBeVisible();
    await bob.page.getByTestId("ready-btn").click();
    await expect(carol.page.getByTestId("status-bar")).toContainText("2/3 ready");
    await waitForPhase(carol.page, "swapping");
    // Once ready you can't swap any more
    await expect(alice.page.getByTestId("ready-btn")).toContainText("Ready (2/3)");

    await carol.page.getByTestId("ready-btn").click();
    for (const p of pages) await waitForPhase(p, "playing");
    await expectBanner(alice.page, "start");

    const { active, others } = await findActivePage(pages);
    await expect(active.getByTestId("status-bar")).toContainText("Your turn");
    await expect(active.getByTestId("requirement-chip")).toHaveText("Anything goes");
    for (const o of others) {
      await expect(o.getByTestId("status-bar")).toContainText("'s turn");
      await expect(o.getByTestId("action-bar")).toHaveAttribute("data-kind", "waiting");
    }
  } finally {
    await closeAll(players);
  }
});
