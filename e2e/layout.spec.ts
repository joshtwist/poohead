import { test, expect, type Page } from "@playwright/test";
import {
  closeAll,
  cs,
  forceState,
  handCard,
  readyAll,
  setupPlayers,
  startGame,
  waitForSwapping,
} from "./helpers.ts";

/**
 * Layout contract, run on every project (iPhone, iPhone SE, iPad portrait,
 * iPad landscape, desktop):
 *
 * - the board never scrolls vertically
 * - every control and table slot sits inside the viewport
 * - opponents stay on one row
 * - the hand fans up to 9 cards without scrolling, then scrolls with each
 *   card still showing at least its rank corner
 */

const EXPECTED_TIER: Record<string, string> = {
  iphone: "phone",
  "iphone-se": "compact",
  ipad: "tablet",
  "ipad-landscape": "tabletWide",
  desktop: "tabletWide",
};

const MUST_BE_VISIBLE = [
  "status-bar",
  "requirement-chip",
  "stock",
  "pile",
  "table-slot-0",
  "table-slot-1",
  "table-slot-2",
  "player-hand",
  "action-bar",
];

async function expectNoVerticalScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    const root = document.getElementById("root")!;
    return {
      docScroll: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      rootScroll: root.scrollHeight,
      rootClient: root.clientHeight,
    };
  });
  expect(m.docScroll, "document must not scroll").toBeLessThanOrEqual(m.innerH);
  expect(m.rootScroll, "#root must not scroll").toBeLessThanOrEqual(m.rootClient);
}

async function expectInViewport(page: Page, testId: string): Promise<void> {
  const vp = page.viewportSize()!;
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} has a bounding box`).toBeTruthy();
  if (!box) return;
  expect(box.x, `${testId} left`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${testId} top`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${testId} right`).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height, `${testId} bottom`).toBeLessThanOrEqual(vp.height + 1);
}

const scroller = (page: Page) => page.getByTestId("player-hand").locator("> div");

test.describe("layout", () => {
  test("board fits the viewport with three players", async ({ browser }, testInfo) => {
    const { players, pages } = await setupPlayers(browser, 3);
    const page = players[0].page;
    try {
      await startGame(page);
      await readyAll(pages);

      await expect(page.getByTestId("game-board")).toHaveAttribute(
        "data-tier",
        EXPECTED_TIER[testInfo.project.name],
      );
      await expectNoVerticalScroll(page);
      for (const id of MUST_BE_VISIBLE) await expectInViewport(page, id);

      const tiles = page.locator("[data-opponent-tile]");
      await expect(tiles).toHaveCount(2);
      const tops = await tiles.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops), "opponents share one row").toBeLessThan(3);
      for (let i = 0; i < 2; i++) {
        const box = await tiles.nth(i).boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      }

      // Nine cards fan without scrolling…
      await forceState(page, { hand: cs("2h 3h 4h 5h 6h 7h 8h 9h Jh") });
      await expect(handCard(page, "Jh")).toBeVisible();
      await expect(page.locator('[data-testid^="hand-card-"]')).toHaveCount(9);
      await page.waitForTimeout(700); // let the springs settle
      const nine = await scroller(page).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(nine.sw, "9 cards fit without scrolling").toBeLessThanOrEqual(nine.cw);
      await expectNoVerticalScroll(page);

      // …twenty compress to the minimum step and, on a phone, overflow
      // into a horizontal scroller. Every card must still peek out by
      // at least 25px so it can be tapped.
      await forceState(page, {
        hand: cs("2h 3h 4h 5h 6h 7h 8h 9h Jh Qh Kh Ah 2s 3s 4s 5s 6s 7s 8s 9s"),
        makeCurrent: true, // so a card can be selected below
      });
      await expect(page.locator('[data-testid^="hand-card-"]')).toHaveCount(20);
      await page.waitForTimeout(700);
      const twenty = await scroller(page).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      const rects = await page
        .locator('[data-testid^="hand-card-"]')
        .evaluateAll((els) =>
          els
            .map((e) => e.getBoundingClientRect())
            .map((r) => ({ left: r.left, right: r.right }))
            .sort((a, b) => a.left - b.left),
        );
      for (let i = 1; i < rects.length; i++) {
        expect(rects[i].left - rects[i - 1].left, `card ${i} step`).toBeGreaterThanOrEqual(25);
      }
      if (twenty.sw > twenty.cw) {
        // Phone: the fan is wider than the screen and scrolls sideways.
        expect(testInfo.project.name, "only phones need to scroll 20 cards").toMatch(/iphone/);
      } else {
        // Tablet/desktop: the whole fan fits inside the viewport.
        expect(rects[0].left).toBeGreaterThanOrEqual(0);
        expect(rects[rects.length - 1].right).toBeLessThanOrEqual(page.viewportSize()!.width);
      }
      await expectNoVerticalScroll(page);
      // Selecting a card lifts it without breaking the layout
      await handCard(page, "2h").click({ position: { x: 12, y: 24 } });
      await expect(handCard(page, "2h")).toHaveAttribute("data-selected", "true");
      await expectNoVerticalScroll(page);
    } finally {
      await closeAll(players);
    }
  });

  test("five players: four opponents fit on one row of a phone", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone", "phone-width check");
    const { players, pages } = await setupPlayers(browser, 5);
    const page = players[0].page;
    try {
      await startGame(page);
      await waitForSwapping(pages);
      const tiles = page.locator("[data-opponent-tile]");
      await expect(tiles).toHaveCount(4);
      const boxes = await tiles.evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { top: r.top, left: r.left, right: r.right };
        }),
      );
      const tops = boxes.map((b) => b.top);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(3);
      for (const b of boxes) {
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(page.viewportSize()!.width);
      }
      await expectNoVerticalScroll(page);
      for (const id of ["table-slot-2", "player-hand", "action-bar"]) await expectInViewport(page, id);
    } finally {
      await closeAll(players);
    }
  });
});
