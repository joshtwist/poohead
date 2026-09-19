import { test, expect } from "@playwright/test";
import {
  closeAll,
  cs,
  expectBanner,
  expectHandCount,
  expectMyTurn,
  expectNotMyTurn,
  expectPileCount,
  expectRain,
  expectRequirement,
  expectStockCount,
  forceState,
  handCard,
  pickUp,
  pileTop,
  setupPlayers,
  startGame,
  waitForPhase,
  waitForSwapping,
} from "./helpers.ts";

const TAP = { position: { x: 12, y: 24 } };

test.describe("playing from the hand", () => {
  test("multi-card play, draw back to three, requirement chip, pick up", async ({ browser }) => {
    const { players, pages } = await setupPlayers(browser, 2);
    const [alice, bob] = players;
    try {
      await startGame(alice.page);
      await waitForSwapping(pages);

      await forceState(alice.page, {
        hand: cs("4h 4s Kc"),
        faceUp: cs("Ad Qs Js"),
        stock: cs("6c 7c 8c"),
        pile: [cs("3d")],
        phase: "playing",
        makeCurrent: true,
      });
      for (const p of pages) await waitForPhase(p, "playing");
      await expectMyTurn(alice.page);
      await expectNotMyTurn(bob.page);
      await expectRequirement(alice.page, "Play 3 or higher");
      await expect(alice.page.getByTestId("play-btn")).toBeDisabled();

      // Select two 4s — the button label follows the selection
      await handCard(alice.page, "4h").click(TAP);
      await expect(alice.page.getByTestId("play-btn")).toHaveText(/Play 4$/);
      await expect(alice.page.getByTestId("play-btn")).toBeEnabled();
      await expect(alice.page.getByTestId("select-all-chip")).toContainText("All 2 4s");
      await handCard(alice.page, "4s").click(TAP);
      await expect(alice.page.getByTestId("play-btn")).toContainText("Play 2 4s");
      await expect(alice.page.getByTestId("select-all-chip")).toHaveCount(0);
      await alice.page.getByTestId("play-btn").click();

      // Both 4s land on the pile for everyone; Alice draws back up to 3
      await expect(pileTop(bob.page, "4h")).toBeVisible();
      await expect(pileTop(bob.page, "4s")).toBeVisible();
      await expectPileCount(bob.page, 3);
      await expectHandCount(alice.page, 3);
      await expect(handCard(alice.page, "Kc")).toBeVisible();
      await expectStockCount(alice.page, 1);

      // Bob must beat a 4 and can't
      await expectMyTurn(bob.page);
      await expectRequirement(bob.page, "Play 4 or higher");
      await forceState(bob.page, { hand: cs("3c 3h") });
      await expect(handCard(bob.page, "3c")).toBeVisible();
      await expect(bob.page.getByTestId("play-btn")).toHaveText(/No playable cards/);
      await expect(bob.page.getByTestId("play-btn")).toBeDisabled();
      await expect(bob.page.getByTestId("action-hint")).toContainText("pick up");

      await pickUp(bob.page);
      // 💩 rains on every screen, and Bob's tile tells Alice how many he took
      await expectRain(bob.page, "poo");
      await expectRain(alice.page, "poo");
      await expect(alice.page.getByTestId("opponent-Bob-badge")).toHaveText("+3 💩");
      await expectHandCount(bob.page, 5);
      await expectPileCount(alice.page, 0);
      await expectBanner(alice.page, "pickup");
      await expectMyTurn(alice.page);
      await expectRequirement(alice.page, "Anything goes");
    } finally {
      await closeAll(players);
    }
  });

  test("picking up while you still have a play needs a second tap", async ({ browser }) => {
    const { players, pages } = await setupPlayers(browser, 2);
    const [alice, bob] = players;
    try {
      await startGame(alice.page);
      await waitForSwapping(pages);
      await forceState(alice.page, {
        hand: cs("Ah Kc 9d"),
        pile: [cs("5d")],
        phase: "playing",
        makeCurrent: true,
      });
      for (const p of pages) await waitForPhase(p, "playing");
      await expectMyTurn(alice.page);

      const btn = alice.page.getByTestId("pickup-btn");
      await btn.click();
      await expect(btn).toHaveAttribute("data-armed", "true");
      await expect(btn).toContainText("Really pick up?");
      await expectPileCount(alice.page, 1);
      await expectMyTurn(alice.page);
      await btn.click();
      await expectPileCount(alice.page, 0);
      await expectHandCount(alice.page, 4);
      await expectMyTurn(bob.page);

      // Playing an illegal rank is refused by the client before it's sent
      await forceState(bob.page, { hand: cs("3c"), pile: [cs("Kd")], makeCurrent: true });
      await expect(handCard(bob.page, "3c")).toBeVisible();
      await expectRequirement(bob.page, "Play King or higher");
      await expect(bob.page.getByTestId("play-btn")).toHaveText(/No playable cards/);
      await handCard(bob.page, "3c").click(TAP);
      await expect(handCard(bob.page, "3c")).not.toHaveAttribute("data-selected", "true");
      await expect(bob.page.getByTestId("play-btn")).toBeDisabled();
    } finally {
      await closeAll(players);
    }
  });
});
