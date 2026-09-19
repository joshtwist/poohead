import { useSyncExternalStore } from "react";
import { layoutFor, type Layout } from "../lib/layout.ts";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  window.visualViewport?.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    window.visualViewport?.removeEventListener("resize", onChange);
  };
}

function snapshotKey(): string {
  return `${window.innerWidth}x${window.innerHeight}`;
}

/**
 * Viewport-driven layout spec. Re-renders only when the window size
 * actually changes (the snapshot is a string, so React can compare it).
 */
export function useLayoutTier(): Layout {
  const key = useSyncExternalStore(subscribe, snapshotKey, () => "393x852");
  const [w, h] = key.split("x").map(Number);
  return layoutFor(w, h);
}
