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
  slideReady,
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
    await expect(alice.page.getByTestId("lobby-count")).toHaveText("3 of 5 at the table");
    await expect(alice.page.getByTestId("share-btn")).toBeVisible();
    await expect(bob.page.getByTestId("start-game-btn")).toHaveCount(0);

    await startGame(alice.page);
    await expect(alice.page.getByTestId("deal-animation")).toBeVisible();
    await waitForSwapping(pages);

    // The swap phase explains itself
    await expect(alice.page.getByTestId("action-hint")).toContainText("Park your big guns");

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
    await expect(alice.page.getByTestId("action-hint")).toContainText("tap a card in the other row");
    // …and the three face-up cards light up as targets
    await expect(alice.page.locator('[data-testid^="faceup-card-"][data-target="true"]')).toHaveCount(3);
    await faceUpCard(alice.page, "7d").click();
    await expect(faceUpCard(alice.page, "2h")).toBeVisible();
    await expect(handCard(alice.page, "7d")).toBeVisible();
    await expect(alice.page.locator('[data-testid^="faceup-card-"]')).toHaveCount(3);
    // The two cards swap zones and the targets switch off again
    await expect(alice.page.locator('[data-testid^="faceup-card-"][data-target="true"]')).toHaveCount(0);
    // Table-first works too: every hand card becomes a target until you change your mind
    await faceUpCard(alice.page, "9s").click();
    await expect(handCard(alice.page, "3d")).toHaveAttribute("data-target", "true");
    await faceUpCard(alice.page, "9s").click();
    await expect(handCard(alice.page, "3d")).not.toHaveAttribute("data-target", "true");
    // Everyone sees the new face-up card
    await expect(bob.page.getByTestId(`opp-faceup-Alice-${key("2h")}`)).toBeVisible();

    // A stray tap on the knob must not ready you up — only a full slide does
    await alice.page.getByTestId("ready-btn").click();
    await expect(alice.page.getByTestId("ready-state")).toHaveCount(0);
    await expect(carol.page.getByTestId("status-bar")).toContainText("0/3 ready");

    // Ready gating: nothing starts until the last player is ready
    await slideReady(alice.page);
    await expect(alice.page.getByTestId("ready-state")).toContainText("1/3");
    await expect(alice.page.getByTestId("ready-btn")).toHaveCount(0);
    await expect(carol.page.getByTestId("status-bar")).toContainText("1/3 ready");
    await expect(bob.page.getByTestId("opponent-Alice-ready")).toBeVisible();

    // Changed your mind? Undo while the others are still deciding…
    await alice.page.getByTestId("unready-btn").click();
    await expect(alice.page.getByTestId("ready-btn")).toBeVisible();
    await expect(carol.page.getByTestId("status-bar")).toContainText("0/3 ready");
    await expect(bob.page.getByTestId("opponent-Alice-ready")).toHaveCount(0);
    // …swap some more…
    await faceUpCard(alice.page, "9s").click();
    await handCard(alice.page, "3d").click({ position: { x: 12, y: 24 } });
    await expect(faceUpCard(alice.page, "3d")).toBeVisible();
    await expect(handCard(alice.page, "9s")).toBeVisible();
    // …and ready up again
    await slideReady(alice.page);
    await expect(carol.page.getByTestId("status-bar")).toContainText("1/3 ready");

    await slideReady(bob.page);
    await expect(carol.page.getByTestId("status-bar")).toContainText("2/3 ready");
    await waitForPhase(carol.page, "swapping");
    await expect(alice.page.getByTestId("ready-state")).toContainText("2/3");

    await slideReady(carol.page);
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
