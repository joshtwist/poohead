import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zones {
  /** Zone rects relative to the board, keyed by `data-zone`. */
  zones: Record<string, Rect>;
  /** Board size. */
  bw: number;
  bh: number;
}

const EMPTY: Zones = { zones: {}, bw: 0, bh: 0 };

/**
 * Measures every `[data-zone]` placeholder inside the board. The normal
 * flex layout positions the placeholders; the card layer reads their
 * rects and flies cards to them. Re-measures after every render (cheap:
 * ~20 elements), on resize, once fonts load, and on a few timers after
 * mount for good measure.
 */
export function useZones(boardRef: RefObject<HTMLElement | null>): Zones {
  const [measured, setMeasured] = useState<Zones>(EMPTY);
  const keyRef = useRef("");

  const measure = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const br = board.getBoundingClientRect();
    if (!br.width) return;
    const zones: Record<string, Rect> = {};
    board.querySelectorAll<HTMLElement>("[data-zone]").forEach((el) => {
      const r = el.getBoundingClientRect();
      zones[el.dataset.zone!] = {
        x: Math.round((r.left - br.left) * 10) / 10,
        y: Math.round((r.top - br.top) * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
      };
    });
    const next: Zones = { zones, bw: Math.round(br.width), bh: Math.round(br.height) };
    const key = JSON.stringify(next);
    if (key !== keyRef.current) {
      keyRef.current = key;
      setMeasured(next);
    }
  }, [boardRef]);

  // After every commit, before paint.
  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(board);
    document.fonts?.ready.then(() => measure()).catch(() => {});
    const timers = [120, 400, 1000, 2000].map((ms) => setTimeout(measure, ms));
    return () => {
      ro.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [boardRef, measure]);

  return measured;
}
