import { test } from "@playwright/test";
import {
  c,
  closeAll,
  cs,
  forceState,
  handCard,
  setupPlayers,
  startGame,
  waitForPhase,
  waitForSwapping,
} from "./helpers.ts";

/**
 * Captures the key screens on every project for eyeballing:
 * e2e/screenshots/<project>-<screen>.png (gitignored).
 */
test("capture key screens", async ({ browser }, testInfo) => {
  const dir = "e2e/screenshots";
  const shot = (name: string) => `${dir}/${testInfo.project.name}-${name}.png`;
  const { players, pages } = await setupPlayers(browser, 3);
  const [alice, bob] = players;
  try {
    await alice.page.screenshot({ path: shot("lobby") });
    await startGame(alice.page);
    await waitForSwapping(pages);
    await alice.page.waitForTimeout(400);
    await alice.page.screenshot({ path: shot("swapping") });

    await forceState(alice.page, {
      hand: cs("2h 3d Jc 5s 9d"),
      faceUp: cs("7d 9s Ad"),
      pile: [cs("Kd"), cs("7h")],
      phase: "playing",
      makeCurrent: true,
    });
    for (const p of pages) await waitForPhase(p, "playing");
    await handCard(alice.page, "9d").waitFor();
    await alice.page.waitForTimeout(800);
    await alice.page.screenshot({ path: shot("my-turn") });
    await bob.page.screenshot({ path: shot("waiting") });

    await forceState(alice.page, {
      hand: cs("2h 3d Jc 5s 9d 4c 6c 8c 10c Qc Kc Ac 3s 4s 6s 7s"),
    });
    await handCard(alice.page, "7s").waitFor();
    await alice.page.waitForTimeout(800);
    await alice.page.screenshot({ path: shot("big-hand") });

    await forceState(alice.page, {
      hand: [],
      faceUp: [],
      faceDown: [c("4h"), null, c("Kd")],
    });
    await alice.page.getByTestId("flip-btn").waitFor();
    await alice.page.waitForTimeout(600);
    await alice.page.screenshot({ path: shot("blind") });
  } finally {
    await closeAll(players);
  }
});
