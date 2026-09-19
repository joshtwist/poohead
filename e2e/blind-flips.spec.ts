import { test, expect } from "@playwright/test";
import {
  c,
  closeAll,
  cs,
  expectBanner,
  expectHandCount,
  expectMyTurn,
  expectPileCount,
  expectRain,
  expectRequirement,
  flipSlot,
  forceState,
  handCard,
  playCards,
  setupPlayers,
  startGame,
  waitForPhase,
  waitForSwapping,
} from "./helpers.ts";

/**
 * The endgame: face-down flips (fail and succeed), a burn, going out, the
 * 💩head screen on every client, and the rematch hand-off.
 */
test("blind flips, burn, going out, end screen and rematch", async ({ browser }) => {
  const { players, pages, gameId } = await setupPlayers(browser, 2);
  const [alice, bob] = players;
  try {
    await startGame(alice.page);
    await waitForSwapping(pages);

    // Alice is down to her three face-down cards; a 9 is on the pile
    await forceState(alice.page, {
      hand: [],
      faceUp: [],
      faceDown: [c("4h"), c("10s"), c("Kd")],
      pile: [cs("9c")],
      phase: "playing",
      makeCurrent: true,
    });
    for (const p of pages) await waitForPhase(p, "playing");
    await expectMyTurn(alice.page);
    await expect(alice.page.getByTestId("action-bar")).toHaveAttribute("data-kind", "flip");
    await expect(alice.page.getByTestId("flip-btn")).toBeDisabled();
    await expectRequirement(alice.page, "Play 9 or higher");
    // Nobody can see what's face down
    await expect(bob.page.getByTestId("opponent-Alice-slot-0")).toBeVisible();
    await expect(bob.page.locator('[data-testid^="opp-faceup-Alice-"]')).toHaveCount(0);

    // A 4 can't beat a 9: Alice takes the pile and the turn passes
    await flipSlot(alice.page, 0);
    await expectBanner(bob.page, "flip_fail");
    await expectRain(bob.page, "poo");
    await expect(bob.page.getByTestId("opponent-Alice-badge")).toHaveText(/^\+\d+ 💩$/);
    await expectHandCount(alice.page, 2); // 4h + 9c
    await expectPileCount(alice.page, 0);
    await expect(alice.page.getByTestId("empty-slot-0")).toBeVisible();
    await expectMyTurn(bob.page);
    await expect(bob.page.getByTestId("opponent-Alice-hand-count")).toHaveAttribute("data-count", "2");

    // Bob plays a Queen, handing the turn back
    await forceState(bob.page, { hand: cs("Qc") });
    await expect(handCard(bob.page, "Qc")).toBeVisible();
    await playCards(bob.page, ["Qc"]);
    await expectMyTurn(alice.page);

    // Back to the blind cards: the 10 burns, so Alice goes again
    await forceState(alice.page, { hand: [], faceUp: [] });
    await expect(alice.page.getByTestId("action-bar")).toHaveAttribute("data-kind", "flip");
    await expectRequirement(alice.page, "Play Queen or higher");
    await flipSlot(alice.page, 1);
    await expectPileCount(alice.page, 0);
    await expect(alice.page.getByTestId("burned-count")).toHaveAttribute("data-count", "2");
    await expectMyTurn(alice.page);
    await expect(alice.page.getByTestId("empty-slot-1")).toBeVisible();

    // Last card on an empty pile: Alice is out, Bob is the 💩head
    await flipSlot(alice.page, 2);
    // Going out gets confetti on the way to the end screen
    await expectRain(alice.page, "confetti");
    await expect(bob.page.getByTestId("poohead-banner")).toBeVisible({ timeout: 15_000 });
    await expect(bob.page.getByTestId("poohead-banner")).toHaveText("You're the 💩head!");
    await expect(alice.page.getByTestId("poohead-banner")).toHaveText("Bob is the 💩head!");
    await expect(alice.page.getByTestId("standing-row-Alice")).toHaveAttribute("data-place", "1");
    await expect(alice.page.getByTestId("standing-row-Bob")).toHaveAttribute("data-place", "2");
    // Bob's remaining cards (including the face-down ones) are revealed
    await expect(alice.page.getByTestId("poohead-cards")).toBeVisible();
    await expect(alice.page.getByTestId("poohead-card")).toHaveCount(9);

    // Rematch: Alice deals the next game and lands in its lobby…
    await alice.page.getByTestId("create-rematch-btn").click();
    await alice.page.waitForURL((url) => !url.pathname.endsWith(gameId), { timeout: 10_000 });
    await expect(alice.page.getByTestId("lobby-player-Alice")).toBeVisible();
    // …Bob is offered the new game and follows
    await expect(bob.page.getByTestId("join-rematch-btn")).toContainText("Join Alice's new game");
    await bob.page.getByTestId("join-rematch-btn").click();
    await expect(bob.page.getByTestId("lobby-player-Bob")).toBeVisible();
    await expect(alice.page.getByTestId("lobby-player-Bob")).toBeVisible();
    await expect(alice.page.getByTestId("lobby-count")).toHaveText("Players (2/5)");
  } finally {
    await closeAll(players);
  }
});
