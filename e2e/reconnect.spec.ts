import { test, expect } from "@playwright/test";
import {
  closeAll,
  cs,
  expectMyTurn,
  expectRequirement,
  forceState,
  handCard,
  pileTop,
  setupPlayers,
  startGame,
  waitForPhase,
  waitForSwapping,
} from "./helpers.ts";

/**
 * Reloading mid-game (phone locked, app backgrounded, tab closed) must
 * land the player straight back where they were — during swapping and
 * during play — with the same cards, pile and requirement.
 */
test("reload resumes the game in swapping and in playing", async ({ browser }) => {
  const { players, pages } = await setupPlayers(browser, 2);
  const [alice, bob] = players;
  try {
    await startGame(alice.page);
    await waitForSwapping(pages);

    await forceState(alice.page, { hand: cs("2h 3d Jc") });
    await expect(handCard(alice.page, "2h")).toBeVisible();

    await alice.page.reload();
    await waitForPhase(alice.page, "swapping");
    await expect(handCard(alice.page, "2h")).toBeVisible();
    await expect(alice.page.getByTestId("ready-btn")).toBeVisible();
    await expect(alice.page.getByTestId("name-input")).toHaveCount(0);

    // Into play with a known pile (Millybims: 7 on a King → King or lower)
    await forceState(alice.page, { pile: [cs("Kd"), cs("7h")], phase: "playing", makeCurrent: true });
    await waitForPhase(alice.page, "playing");
    await expectRequirement(alice.page, "King or lower");

    await alice.page.reload();
    await waitForPhase(alice.page, "playing");
    await expectMyTurn(alice.page);
    await expectRequirement(alice.page, "King or lower");
    await expect(handCard(alice.page, "2h")).toBeVisible();
    await expect(pileTop(alice.page, "7h")).toBeVisible();
    await expect(alice.page.getByTestId("pile")).toHaveAttribute("data-count", "2");

    // Bob saw Alice drop and come back
    await expect(bob.page.getByTestId("opponent-Alice")).toHaveAttribute("data-connected", "true");
    await waitForPhase(bob.page, "playing");
  } finally {
    await closeAll(players);
  }
});
