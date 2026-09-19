import { test, expect } from "@playwright/test";
import {
  closeAll,
  cs,
  expectBanner,
  expectMyTurn,
  expectNotMyTurn,
  expectRequirement,
  forceState,
  handCard,
  playCards,
  setupPlayers,
  startGame,
  waitForPhase,
  waitForSwapping,
} from "./helpers.ts";

/**
 * UK pub rules with three players: one 8 skips the next player, two 8s
 * skip two (so the turn comes straight back to you).
 */
test("UK pub: 8s skip players", async ({ browser }) => {
  const { players, pages } = await setupPlayers(browser, 3);
  const [alice, bob, carol] = players;
  try {
    await startGame(alice.page, "ukpub");
    await waitForSwapping(pages);

    await forceState(alice.page, {
      hand: cs("8h 8s Kc"),
      pile: [],
      phase: "playing",
      makeCurrent: true,
    });
    for (const p of pages) await waitForPhase(p, "playing");
    await expectMyTurn(alice.page);

    // One 8 skips Bob
    await playCards(alice.page, ["8h"]);
    await expectBanner(bob.page, "skip");
    await expectMyTurn(carol.page);
    await expectNotMyTurn(bob.page);
    await expectRequirement(carol.page, "Play 8 or higher");

    // Carol hands the turn on with a 9
    await forceState(carol.page, { hand: cs("9d") });
    await expect(handCard(carol.page, "9d")).toBeVisible();
    await playCards(carol.page, ["9d"]);
    await expectMyTurn(alice.page);

    // Two 8s skip Bob AND Carol: Alice goes again
    await forceState(alice.page, { hand: cs("8s 8d Kc"), pile: [] });
    await expect(handCard(alice.page, "8d")).toBeVisible();
    await expectRequirement(alice.page, "Anything goes");
    await playCards(alice.page, ["8s", "8d"]);
    await expectMyTurn(alice.page);
    await expectNotMyTurn(bob.page);
    await expectNotMyTurn(carol.page);
    await expect(alice.page.getByTestId("status-bar")).toContainText("Your turn");
  } finally {
    await closeAll(players);
  }
});
