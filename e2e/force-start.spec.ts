import { test, expect } from "@playwright/test";
import {
  closeAll,
  expectHandCount,
  setupPlayers,
  slideReady,
  startGame,
  waitForPhase,
  waitForSwapping,
} from "./helpers.ts";

/**
 * A player who drops during the swap phase must not block the game: the
 * host can start once every CONNECTED player is ready, and the dropped
 * player resumes straight into the playing phase when they come back.
 */
test("host force-starts around an offline player, who later resumes", async ({ browser }) => {
  const { players, pages, gameId } = await setupPlayers(browser, 3);
  const [alice, bob, carol] = players;
  try {
    await startGame(alice.page);
    await waitForSwapping(pages);

    // Carol drops (same context is kept so her playerId survives)
    await carol.page.close();
    await expect(alice.page.getByTestId("opponent-Carol")).toHaveAttribute("data-connected", "false");

    await slideReady(alice.page);
    // Bob (connected) isn't ready yet → no force start
    await expect(alice.page.getByTestId("force-start-btn")).toBeDisabled();
    await slideReady(bob.page);
    await expect(alice.page.getByTestId("force-start-btn")).toBeEnabled();
    // Non-hosts never get the button
    await expect(bob.page.getByTestId("force-start-btn")).toHaveCount(0);

    await alice.page.getByTestId("force-start-btn").click();
    await waitForPhase(alice.page, "playing");
    await waitForPhase(bob.page, "playing");

    // Carol returns on the same device and lands in the running game
    const page = await carol.ctx.newPage();
    await page.goto(`/${gameId}`);
    await waitForPhase(page, "playing");
    await expectHandCount(page, 3);
    await expect(alice.page.getByTestId("opponent-Carol")).toHaveAttribute("data-connected", "true");
  } finally {
    await closeAll(players);
  }
});
